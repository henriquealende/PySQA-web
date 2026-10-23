"""Room impulse responses (RIR) and binaural ones (BRIR): loading, the usual room-acoustic parameters and the
energy decay curve.

The parameters follow ISO 3382 (reverberation time from the Schroeder backward integral, early decay time, clarity
C50 and C80, definition D50), computed on the whole file and in octave bands. They are meant to describe a response
you bring or make, not to certify a measurement.
"""
from __future__ import annotations

import io
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

import numpy as np
import soundfile as sf
from scipy.signal import butter, sosfiltfilt

from utils.lang import msg

MAX_SECONDS = 30.0
MIN_SECONDS = 0.05
BANDS_HZ = (125, 250, 500, 1000, 2000, 4000)


class RirError(ValueError):
    """The file is not a usable room response (HTTP 400)."""


@dataclass
class RirSet:
    name: str
    fs: float
    ir: np.ndarray                  # (n, channels) float32, as read (not normalised)
    channels: int
    duration_s: float
    metrics: Dict[str, Optional[float]] = field(default_factory=dict)
    bands: Dict[str, Optional[float]] = field(default_factory=dict)       # T20 per octave band, s
    decay: Dict[str, List[float]] = field(default_factory=dict)           # {"t": [...], "db": [...]}


def read_rir(data: bytes, name: str) -> RirSet:
    try:
        x, fs = sf.read(io.BytesIO(data), dtype="float32", always_2d=True)
    except Exception:
        raise RirError(msg(f"{name} não é um WAV válido.", f"{name} is not a valid WAV file."))
    n, ch = x.shape
    if ch > 2:
        raise RirError(msg(f"{name} tem {ch} canais. Use um arquivo de 1 canal (RIR) ou 2 canais (BRIR, uma por orelha).",
                           f"{name} has {ch} channels. Use a 1-channel (RIR) or 2-channel (BRIR, one per ear) file."))
    dur = n / fs
    if dur > MAX_SECONDS:
        raise RirError(msg(f"{name} dura {dur:.1f} s; o máximo é {MAX_SECONDS:.0f} s.", f"{name} lasts {dur:.1f} s; the maximum is {MAX_SECONDS:.0f} s."))
    if dur < MIN_SECONDS or not np.any(x):
        raise RirError(msg(f"{name} é curto demais ou está em silêncio.", f"{name} is too short or silent."))
    return _build(name, x, fs)


def _build(name: str, x: np.ndarray, fs: float) -> RirSet:
    r = RirSet(name=name, fs=float(fs), ir=x, channels=x.shape[1], duration_s=x.shape[0] / fs)
    mono = x.mean(axis=1).astype(np.float64)
    r.metrics, r.decay = _metrics(mono, fs)
    r.bands = _bands(mono, fs)
    return r


def from_array(name: str, x: np.ndarray, fs: float) -> RirSet:
    """A room response made in memory (the synthetic ones): (n,) or (n, channels) float."""
    x = np.asarray(x, dtype=np.float32)
    return _build(name, x[:, None] if x.ndim == 1 else x, fs)


# ── Energy decay ──────────────────────────────────────────────────────────────

def _prepare(ir: np.ndarray, fs: float) -> Optional[np.ndarray]:
    """Energy from the direct sound on, noise floor removed, cut where the decay reaches the noise."""
    start = int(np.argmax(np.abs(ir)))
    e = ir[start:].astype(np.float64) ** 2
    if len(e) < int(0.03 * fs):
        return None
    tail = e[-max(int(0.1 * len(e)), 8):]
    noise = float(tail.mean())
    if noise > 0:
        win = max(int(0.01 * fs), 1)
        smooth = np.convolve(e, np.ones(win) / win, mode="same")
        above = np.where(smooth > 4.0 * noise)[0]          # 6 dB over the noise floor
        if len(above) == 0:
            return None
        e = e[: above[-1] + 1]
        e = np.maximum(e - noise, 0.0)
    return e if len(e) >= int(0.03 * fs) and e.sum() > 0 else None


def _edc_db(e: np.ndarray) -> np.ndarray:
    edc = np.cumsum(e[::-1])[::-1]
    return 10 * np.log10(np.maximum(edc / edc[0], 1e-12))


def _time_from_slope(edc: np.ndarray, fs: float, hi: float, lo: float, span: float) -> Optional[float]:
    """Time for a 60 dB decay from the slope of the curve between `hi` and `lo` dB (T20: -5 to -25; EDT: 0 to -10)."""
    i0 = np.where(edc <= hi)[0]
    i1 = np.where(edc <= lo)[0]
    if len(i0) == 0 or len(i1) == 0 or i1[0] - i0[0] < 4:
        return None
    seg = slice(i0[0], i1[0] + 1)
    t = np.arange(seg.start, seg.stop) / fs
    slope = np.polyfit(t, edc[seg], 1)[0]                   # dB per second, negative
    return float(-span / slope) if slope < -1e-6 else None


def _metrics(ir: np.ndarray, fs: float) -> Tuple[Dict[str, Optional[float]], Dict[str, List[float]]]:
    out: Dict[str, Optional[float]] = {k: None for k in ("rt60_t20", "rt60_t30", "edt", "c50", "c80", "d50")}
    e = _prepare(ir, fs)
    if e is None:
        return out, {"t": [], "db": []}
    edc = _edc_db(e)
    out["rt60_t20"] = _time_from_slope(edc, fs, -5.0, -25.0, 60.0)
    out["rt60_t30"] = _time_from_slope(edc, fs, -5.0, -35.0, 60.0)
    out["edt"] = _time_from_slope(edc, fs, 0.0, -10.0, 60.0)
    for ms, key in ((50, "c50"), (80, "c80")):
        k = int(round(ms / 1000 * fs))
        early, late = e[:k].sum(), e[k:].sum()
        if late > 0 and early > 0:
            out[key] = float(10 * np.log10(early / late))
    k50 = int(round(0.05 * fs))
    out["d50"] = float(100.0 * e[:k50].sum() / e.sum())
    keep = np.where(edc > -70.0)[0]
    end = int(keep[-1]) + 1 if len(keep) else len(edc)
    step = max(end // 400, 1)
    idx = np.arange(0, end, step)
    return out, {"t": np.round(idx / fs, 4).tolist(), "db": np.round(edc[idx], 2).tolist()}


def _bands(ir: np.ndarray, fs: float) -> Dict[str, Optional[float]]:
    out: Dict[str, Optional[float]] = {}
    for fc in BANDS_HZ:
        if fc * 2 ** 0.5 >= 0.45 * fs:
            continue
        sos = butter(4, [fc / 2 ** 0.5, fc * 2 ** 0.5], btype="band", fs=fs, output="sos")
        e = _prepare(sosfiltfilt(sos, ir), fs)
        out[str(fc)] = _time_from_slope(_edc_db(e), fs, -5.0, -25.0, 60.0) if e is not None else None
    return out


def info(r: RirSet) -> dict:
    return {
        "channels": r.channels, "sample_rate": r.fs, "duration_s": round(r.duration_s, 3),
        "metrics": {k: (None if v is None else round(v, 3)) for k, v in r.metrics.items()},
        "bands": {k: (None if v is None else round(v, 3)) for k, v in r.bands.items()},
        "decay": r.decay,
    }


# ── For the chain ─────────────────────────────────────────────────────────────

def decorrelate(x: np.ndarray, seed: int, ms: float, fs: float) -> np.ndarray:
    """Convolve with a short all-pass filter of random phase: same spectrum and, apart from a few ms of smearing, the
    same decay, but a different waveform for each seed, so two ears do not get identical reverberation."""
    n = max(int(ms * fs / 1000), 16)
    n += n % 2
    rng = np.random.default_rng(seed)
    phase = rng.uniform(-np.pi, np.pi, n // 2 + 1)
    phase[0] = 0.0
    phase[-1] = 0.0
    h = np.fft.irfft(np.exp(1j * phase), n)
    from scipy.signal import fftconvolve
    return fftconvolve(x, h)[: len(x)]
