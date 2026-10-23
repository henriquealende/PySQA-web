"""Runs the auralization chain on a mono signal.

Phase 1 has one block, HRTF (binaural positioning). The structure is a list of steps so the next blocks
(room, headphone, level) are added as further steps without touching the callers.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional

import numpy as np
from scipy.signal import oaconvolve

from utils.lang import msg

from . import hrtf as hrtf_mod
from .sofa_io import HrtfSet

HrtfResolver = Callable[[str], Optional[HrtfSet]]


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
class Chain:
    hrtf: HrtfStep = field(default_factory=HrtfStep)


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


def render(mono: np.ndarray, fs: int, chain: Chain, resolve: HrtfResolver) -> RenderResult:
    notes: List[str] = []
    x = np.asarray(mono, dtype=np.float32)
    step = chain.hrtf
    az, el = step.azimuth, step.elevation
    if step.enabled:
        hset = resolve(step.asset)
        if hset is None:
            raise ChainError(msg("O conjunto de HRTF não está mais no servidor. Envie o arquivo SOFA de novo.",
                                 "The HRTF set is no longer on the server. Upload the SOFA file again."))
        hr, az, el = hrtf_mod.hrir_for(hset, step.azimuth, step.elevation, fs)
        if not hset.builtin and (abs(az - hrtf_mod.wrap_deg(step.azimuth)) > 10 or abs(el - step.elevation) > 15):
            notes.append(msg(f"A direção medida mais próxima é azimute {az:.0f}°, elevação {el:.0f}°.",
                             f"The nearest measured direction is azimuth {az:.0f}°, elevation {el:.0f}°."))
        out = np.stack([oaconvolve(x, hr[e].astype(np.float32)) for e in range(2)], axis=1)
        out *= np.float32(distance_gain(step.distance_m))
    else:
        out = np.stack([x, x], axis=1)

    out = out.astype(np.float64)
    peak = float(np.max(np.abs(out))) if out.size else 0.0
    peak_db = 20 * np.log10(peak) if peak > 0 else -200.0
    if peak > 1.0:
        notes.append(msg(f"O pico passa de 0 dBFS ({peak_db:+.1f} dBFS): o arquivo guarda o valor exato, mas a reprodução satura. Reduza o nível da fonte.",
                         f"The peak exceeds 0 dBFS ({peak_db:+.1f} dBFS): the file keeps the exact value, but playback will clip. Lower the source level."))
    return RenderResult(data=out, fs=fs, azimuth=az, elevation=el, peak_dbfs=peak_db, notes=notes)
