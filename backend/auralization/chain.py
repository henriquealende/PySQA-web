"""Runs the auralization chain on a mono signal.

Blocks: Environment (room response, optional), HRTF (binaural positioning) and background noise (optional, at a given
signal-to-noise ratio). Each ear ends up with one filter that
holds everything, so the signal is convolved once per ear. The structure is a list of steps so the next blocks
(headphone, level) are added without touching the callers.

How the room and the head are combined:
- BRIR (binaural response, one channel per ear): it already holds the head, so the HRTF block is ignored.
- RIR (one channel) with HRTF: the direct sound goes through the HRIR of the chosen direction; what comes after the
  first few milliseconds is the reverberation, made different for each ear (random-phase all-pass) so the two ears
  are not identical. It is a simplification: the early reflections are not placed in space.
- RIR without HRTF: the same response on both ears.
The room does not change the loudness: the total energy of the filters is kept equal to that of the head alone.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import gcd
from typing import Callable, List, Optional, Tuple

import numpy as np
from scipy.signal import oaconvolve, resample_poly

from utils.lang import msg

from . import hrtf as hrtf_mod
from .noise import COLORS, mix_snr
from .rir import RirSet, decorrelate
from .sofa_io import HrtfSet

HrtfResolver = Callable[[str], Optional[HrtfSet]]
RirResolver = Callable[[str], Optional[RirSet]]

DIRECT_MS = 2.5          # what counts as the direct sound after the peak of the response
DECORR_MS = 10.0         # length of the all-pass that decorrelates the reverberation of the two ears
MAX_FILTER_S = 30.0


class ChainError(ValueError):
    """The chain asks for something that cannot be done (HTTP 400)."""


@dataclass
class HrtfStep:
    enabled: bool = True
    asset: str = hrtf_mod.SPHERE_ID
    azimuth: float = 0.0
    elevation: float = 0.0
    distance_m: float = 1.0


@dataclass
class EnvironmentStep:
    type: str = "none"                  # none | rir | brir
    asset: Optional[str] = None
    reverb_gain_db: float = 0.0         # level of everything after the direct sound, in dB


@dataclass
class NoiseStep:
    type: str = "none"                  # none | white | pink | brown
    snr_db: float = 15.0


@dataclass
class Chain:
    hrtf: HrtfStep = field(default_factory=HrtfStep)
    environment: EnvironmentStep = field(default_factory=EnvironmentStep)
    noise: NoiseStep = field(default_factory=NoiseStep)


@dataclass
class RenderResult:
    data: np.ndarray                # (n, 2) float64, may exceed full scale
    fs: int
    azimuth: float                  # direction really used (the nearest measured one)
    elevation: float
    peak_dbfs: float
    notes: List[str] = field(default_factory=list)


def downmix(x: np.ndarray) -> np.ndarray:
    """One channel: the mean of the channels of a multichannel recording."""
    return x if x.ndim == 1 else x.mean(axis=1)


def distance_gain(distance_m: float) -> float:
    """Free-field spreading: 1/r relative to 1 m."""
    return 1.0 / max(float(distance_m), 0.1)


def _resample(x: np.ndarray, fs_from: float, fs_to: float) -> np.ndarray:
    if abs(fs_from - fs_to) <= 0.5:
        return x
    g = gcd(int(round(fs_to)), int(round(fs_from)))
    return resample_poly(x, int(round(fs_to)) // g, int(round(fs_from)) // g, axis=0)


def _pad(x: np.ndarray, n: int) -> np.ndarray:
    out = np.zeros(n)
    out[: len(x)] = x[:n]
    return out


def _environment_filters(env: EnvironmentStep, fs: int, rir: RirSet, hrir: Optional[np.ndarray], dgain: float,
                         notes: List[str], reverb_gain_db: float) -> Tuple[np.ndarray, np.ndarray]:
    """One filter per ear that holds the room (and the head, when it is not already inside the response)."""
    r = _resample(rir.ir.astype(np.float64), rir.fs, fs)
    peak = float(np.max(np.abs(r)))
    if peak <= 0:
        raise ChainError(msg("A resposta ao impulso do ambiente está em silêncio.", "The room impulse response is silent."))
    r = r / peak                                    # the strongest sample, normally the direct sound, is 1
    gain = 10 ** (reverb_gain_db / 20.0)
    direct_n = int(round(DIRECT_MS * fs / 1000.0))
    starts = [int(np.argmax(np.abs(r[:, c]))) for c in range(r.shape[1])]
    p = min(starts)                                 # drop the lead-in, keep the delay between the ears
    r = r[p:]
    cut = direct_n + (max(starts) - p)              # everything after this is reverberation

    if env.type == "brir":
        if r.shape[1] != 2:
            raise ChainError(msg("Uma BRIR precisa de 2 canais (esquerda e direita).", "A BRIR needs 2 channels (left and right)."))
        if hrir is not None:
            notes.append(msg("A BRIR já inclui a cabeça: o bloco HRTF foi ignorado.", "The BRIR already includes the head: the HRTF block was ignored."))
        h = r.copy()
        h[cut:] *= gain
        return h[:, 0], h[:, 1]

    mono = r.mean(axis=1) if r.shape[1] > 1 else r[:, 0]
    tail = mono[cut:] * gain
    if hrir is None:
        h = np.concatenate([mono[:cut], tail])
        return h, h.copy()
    n = max(hrir.shape[1], cut + len(tail))
    out = []
    for ear in range(2):
        direct = _pad(hrir[ear] * dgain, n)
        late = np.zeros(n)
        late[cut:cut + len(tail)] = decorrelate(tail, seed=11 + ear, ms=DECORR_MS, fs=fs) if len(tail) else tail
        out.append(direct + late)
    return out[0], out[1]


def render(mono: np.ndarray, fs: int, chain: Chain, resolve_hrtf: HrtfResolver,
           resolve_rir: Optional[RirResolver] = None) -> RenderResult:
    notes: List[str] = []
    x = np.asarray(mono, dtype=np.float32)
    step, env = chain.hrtf, chain.environment
    az, el = step.azimuth, step.elevation

    hrir: Optional[np.ndarray] = None
    dgain = distance_gain(step.distance_m)
    if step.enabled:
        hset = resolve_hrtf(step.asset)
        if hset is None:
            raise ChainError(msg("O conjunto de HRTF não está mais no servidor. Envie o arquivo SOFA de novo.",
                                 "The HRTF set is no longer on the server. Upload the SOFA file again."))
        hrir, az, el = hrtf_mod.hrir_for(hset, step.azimuth, step.elevation, fs)
        if not hset.builtin and (abs(az - hrtf_mod.wrap_deg(step.azimuth)) > 10 or abs(el - step.elevation) > 15):
            notes.append(msg(f"A direção medida mais próxima é azimute {az:.0f}°, elevação {el:.0f}°.",
                             f"The nearest measured direction is azimuth {az:.0f}°, elevation {el:.0f}°."))

    if env.type != "none":
        rir = resolve_rir(env.asset) if (resolve_rir and env.asset) else None
        if rir is None:
            raise ChainError(msg("A resposta ao impulso do ambiente não está mais no servidor. Envie o arquivo de novo.",
                                 "The room impulse response is no longer on the server. Upload the file again."))
        if env.type == "brir":
            az, el = 0.0, 0.0
        # The room does not make the sound louder: the filters are scaled so that, with no reverberation change (0 dB),
        # the total energy equals that of the head alone (or of a unit impulse), and the same scale is kept when the
        # reverberation level is changed.
        base = _environment_filters(env, fs, rir, hrir, dgain, [], 0.0)
        e_base = float(np.mean([np.sum(f ** 2) for f in base]))
        e_ref = float(np.mean(np.sum(hrir ** 2, axis=1))) * dgain ** 2 if (hrir is not None and env.type != "brir") else 1.0
        scale = float(np.sqrt(e_ref / e_base)) if e_base > 0 else 1.0
        hl, hr_ = _environment_filters(env, fs, rir, hrir, dgain, notes, env.reverb_gain_db)
        hl, hr_ = hl * scale, hr_ * scale
        if len(hl) > MAX_FILTER_S * fs:
            raise ChainError(msg("A resposta ao impulso é longa demais depois da reamostragem.", "The impulse response is too long after resampling."))
        filters = (hl, hr_)
    elif hrir is not None:
        filters = (hrir[0] * dgain, hrir[1] * dgain)
    else:
        filters = None

    if filters is None:
        out = np.stack([x, x], axis=1)
    else:
        out = np.stack([oaconvolve(x, f.astype(np.float32)) for f in filters], axis=1)

    out = out.astype(np.float64)
    if chain.noise.type != "none":
        if chain.noise.type not in COLORS:
            raise ChainError(msg("Tipo de ruído desconhecido.", "Unknown noise type."))
        out = mix_snr(out, fs, chain.noise.type, chain.noise.snr_db)
    peak = float(np.max(np.abs(out))) if out.size else 0.0
    peak_db = 20 * np.log10(peak) if peak > 0 else -200.0
    if peak > 1.0:
        notes.append(msg(f"O pico passa de 0 dBFS ({peak_db:+.1f} dBFS): o arquivo guarda o valor exato, mas a reprodução satura. Reduza o nível da fonte.",
                         f"The peak exceeds 0 dBFS ({peak_db:+.1f} dBFS): the file keeps the exact value, but playback will clip. Lower the source level."))
    return RenderResult(data=out, fs=fs, azimuth=az, elevation=el, peak_dbfs=peak_db, notes=notes)
