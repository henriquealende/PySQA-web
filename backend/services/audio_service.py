"""High-level audio analysis helpers called by the routers."""
from __future__ import annotations

import copy
import io
import math
import os
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any, Dict, List, NamedTuple, Optional, Tuple

import numpy as np
from scipy.io import wavfile
from scipy.signal import spectrogram as scipy_spectrogram, hilbert, oaconvolve

from services.session_store import AudioEntry, audio_ram_mb, new_audio_id, persist_session, usable_audio_id
from utils import limits
from utils.lang import msg
from utils.samples import BROWSER_SAFE, normalise_samples
from utils.series_stats import series_statistics

# ── Pre-warmed metric singletons ──────────────────────────────────────────────
_LOUD = _SHARP = _ROUGH = _FS_CALC = _TON = _MPI = None

def _init_singletons():
    global _LOUD, _SHARP, _ROUGH, _FS_CALC, _TON, _MPI
    try:
        from psychoacoustics.loudness import Loudness
        _LOUD = Loudness()
    except Exception:
        pass
    try:
        from psychoacoustics.sharpness_din import Sharpnes_DIN
        _SHARP = Sharpnes_DIN()
    except Exception:
        pass
    try:
        from psychoacoustics.roughness import Roughness
        _ROUGH = Roughness()
    except Exception:
        pass
    try:
        from psychoacoustics.fluctuation_strength import FluctuationStrength
        _FS_CALC = FluctuationStrength()
    except Exception:
        pass
    try:
        from psychoacoustics.tonality import TonalityECMA
        _TON = TonalityECMA()
    except Exception:
        pass
    try:
        from psychoacoustics.mpi import IPM
        _MPI = IPM()
    except Exception:
        pass

_init_singletons()

# ── shared tmp dir ─────────────────────────────────────────────────────────
TMP_DIR = Path(os.environ.get("PYSQA_TMP_DIR") or Path(__file__).parent.parent / "tmp_sessions")
TMP_DIR.mkdir(parents=True, exist_ok=True)

# Max samples returned for waveform (down-sampled for rendering speed)
_WAVEFORM_MAX_POINTS = 8_000

# ── I/O ───────────────────────────────────────────────────────────────────────

def load_wav(file_bytes: bytes, filename: str, audio_id: Optional[str] = None) -> AudioEntry:
    """Parse WAV bytes, normalise to float64 (full scale = 1.0) and keep a copy on disk."""
    sr, data = wavfile.read(io.BytesIO(file_bytes))
    norm = normalise_samples(data)

    channels = 1 if norm.ndim == 1 else norm.shape[1]
    n_samples = norm.shape[0]
    duration_s = n_samples / sr

    # The copy on disk is what is played, downloaded and reloaded after a restart, so it must not lose
    # quality: keep the upload exactly as it came whenever a browser can play it (it used to be
    # squeezed into 16 bits, and a peak above full scale wrapped around into noise); otherwise
    # (64-bit samples) write 32-bit float, which holds every sample of a file of up to 24 bits.
    audio_id = usable_audio_id(audio_id) or new_audio_id()
    tmp_path = TMP_DIR / f"{uuid.uuid4().hex}.wav"      # the file name never comes from client input
    if data.dtype in BROWSER_SAFE:
        tmp_path.write_bytes(file_bytes)
    else:
        import soundfile as sf
        sf.write(str(tmp_path), norm, sr, subtype="FLOAT")

    return AudioEntry(
        audio_id=audio_id,
        name=filename,
        sample_rate=sr,
        channels=channels,
        duration_s=duration_s,
        data=norm,
        raw_path=tmp_path,
    )


def _mono(data: np.ndarray) -> np.ndarray:
    """Return mono channel (first channel if stereo)."""
    if data.ndim == 1:
        return data
    return data[:, 0]


# ── Sections ──────────────────────────────────────────────────────────────────
# The user may analyse only a part of a file. The computations below take an optional
# [t0, t1] (seconds) and run on that slice of the signal. A numpy slice is a view, so a
# section costs no extra memory, and the memory budget is judged on its own duration:
# that is what lets a long file be analysed in pieces on a small server.

MIN_SECTION_S = 0.05
_MAX_SECTION_RESULTS = 8        # section results kept per file (the oldest are dropped)


class SectionError(ValueError):
    """The requested section cannot be analysed (HTTP 400)."""


class _Slice(NamedTuple):
    entry: AudioEntry           # what to compute on: the entry itself, or a view of one section of it
    offset_s: float             # time of its first sample inside the whole file
    start: int                  # first sample (inclusive) and last sample (exclusive) in the whole file
    end: int
    whole: bool

    @property
    def span(self) -> Optional[List[float]]:
        """[t0, t1] in seconds, or None when the whole file is analysed."""
        if self.whole:
            return None
        return [round(self.offset_s, 6), round(self.end / self.entry.sample_rate, 6)]


def _section(entry: AudioEntry, t0: Optional[float] = None, t1: Optional[float] = None) -> _Slice:
    n = entry.data.shape[0]
    sr = entry.sample_rate
    if t0 is None and t1 is None:
        return _Slice(entry, 0.0, 0, n, True)
    lo = 0.0 if t0 is None else float(t0)
    hi = n / sr if t1 is None else float(t1)
    if not (math.isfinite(lo) and math.isfinite(hi)):
        raise SectionError(msg("Os limites do trecho precisam ser números.", "The section limits must be numbers."))
    start = int(round(max(lo, 0.0) * sr))
    end = min(int(round(hi * sr)), n)
    if start >= n:
        raise SectionError(msg(f"O trecho começa em {lo:.2f} s, mas este arquivo dura só {n / sr:.2f} s.",
                               f"The section starts at {lo:.2f} s but this file lasts only {n / sr:.2f} s."))
    if end - start < max(1, int(MIN_SECTION_S * sr)):
        raise SectionError(msg(f"O trecho precisa durar pelo menos {MIN_SECTION_S:g} s.",
                               f"The section must last at least {MIN_SECTION_S:g} s."))
    if start == 0 and end == n:
        return _Slice(entry, 0.0, 0, n, True)
    view = copy.copy(entry)
    view.data = entry.data[start:end]
    view.duration_s = (end - start) / sr
    view._cache = {}                # results of a section are cached on the real entry, under a key of their own
    return _Slice(view, start / sr, start, end, False)


def section_span(entry: AudioEntry, t0: Optional[float], t1: Optional[float]) -> Optional[List[float]]:
    """The [t0, t1] that will really be analysed (clamped to the file), or None for the whole file."""
    return _section(entry, t0, t1).span


def _shift_time(result: Dict[str, Any], offset_s: float) -> Dict[str, Any]:
    """Time axes of a section start at 0; put them back on the timeline of the whole file."""
    td = result.get("time_data")
    if td and "t" in td:
        td["t"] = [round(x + offset_s, 6) for x in td["t"]]
    return result


# ── Two channels ──────────────────────────────────────────────────────────────
# The charts show the left and the right channel of a stereo file. Each calculation below is written for
# one channel; `_both_channels` runs it on the first two channels and lists the per-channel arrays in
# `channels` (the top-level arrays stay the left channel, which is what a mono file returns).
# Psychoacoustic metrics are not doubled: they use the left channel only (see compute_metric).

def _channel_view(entry: AudioEntry, ch: int) -> AudioEntry:
    """The entry seen as a mono file made of channel *ch* (the entry itself when it is mono)."""
    if entry.data.ndim == 1 or entry.data.shape[1] < 2:
        return entry
    view = copy.copy(entry)
    view.data = entry.data[:, min(max(ch, 0), entry.data.shape[1] - 1)]
    view._cache = {}
    return view


def _both_channels(entry: AudioEntry, fn, keys: Tuple[str, ...], *args, **kwargs) -> Dict[str, Any]:
    left = fn(_channel_view(entry, 0), *args, **kwargs)
    if entry.data.ndim == 1 or entry.data.shape[1] < 2:
        return left
    right = fn(_channel_view(entry, 1), *args, **kwargs)
    left["channels"] = [{"name": nm, **{k: r[k] for k in keys}} for nm, r in (("L", left), ("R", right))]
    return left


# ── Waveform ──────────────────────────────────────────────────────────────────

_SPECTRUM_MAX_POINTS = 2_400

# Peak-preserving reduction for plotting. Plain decimation (x[::step]) drops whatever
# falls between the kept samples: a clipped burst or a narrow tone can vanish from the
# plot. These helpers keep the extremes of every bucket instead.

def _bucket_edges(n: int, buckets: int) -> np.ndarray:
    """Start index of each of *buckets* contiguous, near-equal slices of an n-sample signal."""
    return np.linspace(0, n, buckets + 1, dtype=np.int64)[:-1]


def _minmax_envelope(x: np.ndarray, sr: int, max_points: int) -> Tuple[np.ndarray, np.ndarray]:
    """Reduce *x* to at most *max_points* samples without losing peaks.

    Every bucket contributes its minimum and its maximum, both placed at the bucket
    centre, so plotting the result as a line draws the true min/max envelope.
    """
    n = len(x)
    idx = _bucket_edges(n, max(1, max_points // 2))
    ends = np.append(idx[1:], n)
    y = np.empty(2 * len(idx))
    y[0::2] = np.minimum.reduceat(x, idx)
    y[1::2] = np.maximum.reduceat(x, idx)
    return np.repeat((idx + ends) / 2.0 / sr, 2), y


def _log_reduce(freqs: np.ndarray, mag: np.ndarray, max_points: int):
    """Reduce a linear-magnitude spectrum to ~max_points log-spaced buckets.

    Returns (centre_freqs, peak, rms) per bucket. The peak keeps narrow tones at their
    true level; the rms (power mean) keeps the noise floor honest. Buckets are laid out
    in bin indices, so low frequencies (fewer bins than buckets) keep full resolution.
    """
    n = len(freqs)
    edges = np.geomspace(freqs[1], freqs[-1], max_points + 1)
    idx = np.unique(np.searchsorted(freqs, edges[:-1]))
    idx = idx[idx >= 1]
    ends = np.append(idx[1:], n)
    peak = np.maximum.reduceat(mag, idx)
    rms = np.sqrt(np.add.reduceat(mag ** 2, idx) / (ends - idx))
    centre = (freqs[idx] + freqs[ends - 1]) / 2.0
    return centre, peak, rms


def _compute_waveform(entry: AudioEntry) -> Dict[str, Any]:
    mono = _mono(entry.data)
    n = len(mono)
    if n > _WAVEFORM_MAX_POINTS:
        t_ds, mono_ds = _minmax_envelope(mono, entry.sample_rate, _WAVEFORM_MAX_POINTS)
    else:
        mono_ds = mono
        t_ds = np.arange(n) / entry.sample_rate

    calibrated = entry.calibration_pa is not None
    scale = entry.calibration_pa if calibrated else 1.0     # Pa when calibrated (the axis says so), full scale otherwise
    return {
        "t": np.round(t_ds, 6).tolist(),
        "amplitude": np.round(mono_ds * scale, 6).tolist(),
        "peak": float(np.max(np.abs(mono))) if n else 0.0,  # always in full scale: it is compared with clipping
        "reduced": n > _WAVEFORM_MAX_POINTS,                # True: min and max of each bucket, interleaved
        "calibrated": calibrated,
        "duration_s": entry.duration_s,
        "sample_rate": entry.sample_rate,
    }


def compute_waveform(entry: AudioEntry) -> Dict[str, Any]:
    out = _both_channels(entry, _compute_waveform, ("amplitude", "peak"))
    if "channels" in out:
        out["peak"] = max(c["peak"] for c in out["channels"])      # the clipping warning looks at both
    return out


# ── Spectrum (FFT) ────────────────────────────────────────────────────────────

def compute_spectrum(entry: AudioEntry, t0: Optional[float] = None, t1: Optional[float] = None) -> Dict[str, Any]:
    """Magnitude spectrum of the file, one curve per channel (at most two: left and right).

    `magnitude_db` is the first channel (what a mono file returns); a stereo file also lists both curves
    in `channels`. When the spectrum is reduced for plotting each point is the peak of its bucket, so a
    tone never disappears.
    """
    sec = _section(entry, t0, t1)
    entry = sec.entry
    limits.check_budget("spectrum", entry.duration_s, entry.sample_rate, audio_ram_mb())
    calibrated = entry.calibration_pa is not None
    n_ch = 1 if entry.data.ndim == 1 else min(entry.data.shape[1], 2)

    n = entry.data.shape[0]
    window = np.hanning(n)
    freqs = np.fft.rfftfreq(n, d=1.0 / entry.sample_rate)

    # Window gain is divided out (sum(window)/2 is the line height of a unit-amplitude sine).
    # Calibrated: dB SPL re 20 µPa, RMS per line, so a 94 dB tone peaks at ~94 dB.
    # Uncalibrated: dBFS by peak amplitude, so a full-scale sine peaks at ~0 dBFS.
    gain = float(np.sum(window)) / 2.0
    ref = 20e-6 * gain * np.sqrt(2.0) if calibrated else gain

    def to_db(v):
        return np.round(20 * np.log10(v / ref + 1e-12), 2)

    reduced = len(freqs) > _SPECTRUM_MAX_POINTS
    curves: List[np.ndarray] = []
    out_freqs = freqs
    for ch in range(n_ch):
        x = entry.data if entry.data.ndim == 1 else entry.data[:, ch]
        if calibrated:
            x = x * entry.calibration_pa  # scale to Pa
        mag = np.abs(np.fft.rfft(x * window))
        if reduced:
            out_freqs, mag, _ = _log_reduce(freqs, mag, _SPECTRUM_MAX_POINTS)
        curves.append(to_db(mag))

    out: Dict[str, Any] = {"calibrated": calibrated, "section": sec.span,
                           "freqs": np.round(out_freqs, 3).tolist(),
                           "magnitude_db": curves[0].tolist()}
    if n_ch > 1:
        out["channels"] = [{"name": nm, "magnitude_db": c.tolist()} for nm, c in zip(("L", "R"), curves)]
    return out


# ── Spectrogram ───────────────────────────────────────────────────────────────

def compute_spectrogram(entry: AudioEntry, params: dict | None = None,
                        t0: Optional[float] = None, t1: Optional[float] = None) -> Dict[str, Any]:
    """Spectrogram of one channel: params["channel"] is 0 (left, the default) or 1 (right)."""
    entry = _channel_view(entry, int((params or {}).get("channel", 0)))
    sec = _section(entry, t0, t1)
    entry = sec.entry
    limits.check_budget("spectrogram", entry.duration_s, entry.sample_rate, audio_ram_mb())
    p         = params or {}
    nfft      = int(p.get("nfft", 2048))
    overlap   = float(p.get("overlap", 75.0))
    win_name    = str(p.get("window", "hann")).lower()
    kaiser_beta = float(p.get("kaiser_beta", 14.0))
    dyn_range   = float(p.get("dyn_range", 90.0))
    fmax_req    = p.get("fmax", None)

    _WIN_MAP = {"hanning": "hann", "hamming": "hamming", "blackman": "blackman",
                "rectangular": "boxcar", "bartlett": "bartlett", "hann": "hann",
                "kaiser": "kaiser", "flattop": "flattop", "boxcar": "boxcar"}
    win_scipy = _WIN_MAP.get(win_name, "hann")

    mono = _mono(entry.data)
    sr   = entry.sample_rate
    n    = len(mono)

    nperseg  = min(nfft, n // 2) if n > nfft else max(64, n // 4)
    noverlap = int(nperseg * overlap / 100.0)

    import scipy.signal as _sp
    if win_scipy == "kaiser":
        win_array = _sp.get_window(("kaiser", kaiser_beta), nperseg)
    else:
        win_array = _sp.get_window(win_scipy, nperseg)
    f, t, Sxx = scipy_spectrogram(mono, fs=sr, window=win_array,
                                   nperseg=nperseg, noverlap=noverlap,
                                   scaling="spectrum", mode="magnitude")
    Sxx_db = 20.0 * np.log10(np.maximum(Sxx, 1e-12))
    vmax   = float(np.max(Sxx_db))
    vmin   = vmax - dyn_range

    nyq       = sr / 2.0
    fmax_clip = min(float(fmax_req), nyq) if fmax_req else min(20000.0, nyq)
    f_idx     = np.searchsorted(f, fmax_clip)
    f         = f[:f_idx]
    Sxx_db    = Sxx_db[:f_idx, :]

    if Sxx_db.shape[1] > 400:
        step   = Sxx_db.shape[1] // 400
        t      = t[::step]
        Sxx_db = Sxx_db[:, ::step]

    return {
        "t": np.round(t + sec.offset_s, 6).tolist(),
        "f": np.round(f, 2).tolist(),
        # 0.1 dB steps are finer than any colour scale shows; levels below the floor are drawn as the floor
        "power_db": np.round(np.maximum(Sxx_db, vmin), 1).tolist(),
        "z_min": vmin,
        "z_max": vmax,
        "cmap": str(p.get("cmap", "magma")),
        "freq_scale": str(p.get("freq_scale", "log")),
        "section": sec.span,
    }


# ── 1/3-Octave bands ─────────────────────────────────────────────────────────

def _compute_octave_bands(entry: AudioEntry, weighting: str = "Z",
                          t0: Optional[float] = None, t1: Optional[float] = None) -> Dict[str, Any]:
    sec = _section(entry, t0, t1)
    entry = sec.entry
    limits.check_budget("octave", entry.duration_s, entry.sample_rate, audio_ram_mb())
    from processing.filtering import THIRD_OCTAVE_CENTRES_HZ, apply_filter, FilterType, apply_weighting

    mono = _mono(entry.data)
    sr   = entry.sample_rate
    calibrated = entry.calibration_pa is not None

    if calibrated:
        mono = mono * entry.calibration_pa  # scale to Pa

    # Apply A/C-weighting before band analysis when requested
    if weighting.upper() in ("A", "C"):
        try:
            mono = apply_weighting(mono, sr, weighting.upper())
        except Exception:
            pass

    SPL_REF = 20e-6  # Pa

    levels_db = []
    for fc in THIRD_OCTAVE_CENTRES_HZ:
        factor = 2 ** (1 / 6)
        f_low  = fc / factor
        f_high = fc * factor
        if f_high >= sr / 2 * 0.98:
            levels_db.append(None)
            continue
        try:
            filtered = apply_filter(mono, sr, filter_type=FilterType.BANDPASS,
                                    cutoff=(f_low, f_high))
            rms = np.sqrt(np.mean(filtered ** 2))
            if calibrated:
                db = 20 * np.log10(rms / SPL_REF + 1e-12)
            else:
                db = 20 * np.log10(rms + 1e-12)
            levels_db.append(round(float(db), 2))
        except Exception:
            levels_db.append(None)

    return {
        "centres_hz": THIRD_OCTAVE_CENTRES_HZ,
        "levels_db": levels_db,
        "weighting": weighting.upper(),
        "calibrated": calibrated,
        "section": sec.span,
    }


def compute_octave_bands(entry: AudioEntry, weighting: str = "Z",
                        t0: Optional[float] = None, t1: Optional[float] = None) -> Dict[str, Any]:
    return _both_channels(entry, _compute_octave_bands, ("levels_db",), weighting, t0, t1)


# ── Envelope ──────────────────────────────────────────────────────────────────

def _compute_envelope(
    entry: AudioEntry,
    smoothing_ms: float = 0.0,
    lpf_hz: float | None = None,
    t0: Optional[float] = None,
    t1: Optional[float] = None,
) -> Dict[str, Any]:
    from scipy.signal import butter, filtfilt
    sec = _section(entry, t0, t1)
    entry = sec.entry
    mono = _mono(entry.data)
    sr   = entry.sample_rate
    n    = len(mono)

    limits.check_budget("envelope", entry.duration_s, sr, audio_ram_mb())
    env_raw  = np.abs(hilbert(mono))   # compute once
    envelope = env_raw.copy()

    # Optional smoothing (moving-average RMS in time domain)
    if smoothing_ms > 0:
        win_samples = max(1, int(smoothing_ms * 1e-3 * sr))
        kernel = np.ones(win_samples) / win_samples
        envelope = oaconvolve(envelope, kernel, mode="same")   # FFT-based, same result as np.convolve

    # Optional low-pass filter on the envelope
    if lpf_hz is not None and 0 < lpf_hz < sr / 2 * 0.98:
        try:
            b, a = butter(4, lpf_hz / (sr / 2), btype="low")
            envelope = filtfilt(b, a, envelope)
        except Exception:
            pass

    # Downsample for rendering — keep the true min/max of the signal and the max of the envelope
    if n > _WAVEFORM_MAX_POINTS:
        t, sig_ds = _minmax_envelope(mono, sr, _WAVEFORM_MAX_POINTS)
        idx    = _bucket_edges(n, max(1, _WAVEFORM_MAX_POINTS // 2))
        env_ds = np.repeat(np.maximum.reduceat(envelope, idx), 2)
    else:
        t      = np.arange(n) / sr
        sig_ds = mono
        env_ds = envelope

    # Envelope spectrum — reuse unsmoothed result (no second hilbert call)
    fft_env = np.fft.rfft(env_raw * np.hanning(n))
    f_env   = np.fft.rfftfreq(n, d=1.0 / sr)
    mag_env = np.abs(fft_env)
    if len(f_env) > 2048:
        f_env, mag_env, _ = _log_reduce(f_env, mag_env, 2048)
    env_spec_db = 20 * np.log10(mag_env / (n / 2) + 1e-12)

    return {
        "reduced": n > _WAVEFORM_MAX_POINTS,
        "section": sec.span,
        "t": np.round(t + sec.offset_s, 6).tolist(),
        "signal": np.round(sig_ds, 6).tolist(),
        "envelope": np.round(env_ds, 6).tolist(),
        "f_env": np.round(f_env, 3).tolist(),
        "env_spec_db": np.round(env_spec_db, 2).tolist(),
    }


def compute_envelope(entry: AudioEntry, smoothing_ms: float = 0.0, lpf_hz: float | None = None,
                     t0: Optional[float] = None, t1: Optional[float] = None) -> Dict[str, Any]:
    return _both_channels(entry, _compute_envelope, ("signal", "envelope", "f_env", "env_spec_db"),
                          smoothing_ms, lpf_hz, t0, t1)


# ── Psychoacoustic metrics ────────────────────────────────────────────────────

def _calibrated_mono(entry: AudioEntry) -> np.ndarray:
    """Return mono signal scaled to Pa if calibration is set, else normalised float."""
    mono = _mono(entry.data)
    if entry.calibration_pa is not None:
        mono = mono * entry.calibration_pa
    return mono


def compute_metric(entry: AudioEntry, metric_key: str, field_type: str = "free",
                   t0: Optional[float] = None, t1: Optional[float] = None,
                   cancelled: Optional[Any] = None, job: str = "", precision: str = "exact") -> Dict[str, Any]:
    """Dispatch to the correct psychoacoustic computation (on the whole file, or on one section of it).

    precision="fast" only matters for Tonality ECMA-418-2 (an approximate, faster calculation); every other
    metric ignores it, so it never splits their cache.
    """
    sec = _section(entry, t0, t1)
    cal_tag = f"cal{entry.calibration_pa:.6f}" if entry.calibration_pa else "raw"
    fast = metric_key == "tonality_ecma" and str(precision).lower() == "fast"
    cache_key = f"metric_{metric_key}_{field_type}_{cal_tag}" + ("_fast" if fast else "")
    if not sec.whole:
        cache_key += f"|s{sec.start}-{sec.end}"            # sample indices: the same section always hits the same entry
    if cache_key in entry._cache:
        return entry._cache[cache_key]

    # A calculation expected to take too long is refused at once, before it waits for the slot.
    limits.check_time(metric_key, sec.entry.duration_s, sec.entry.sample_rate,
                      time_kind="tonality_ecma_fast" if fast else None)
    # One memory-hungry computation at a time; the others wait for the slot.
    with limits.heavy_slot(cancelled, job, metric_key):
        if cache_key in entry._cache:          # finished by a request that was ahead in the queue
            return entry._cache[cache_key]
        part = sec.entry
        limits.check_budget(metric_key, part.duration_s, part.sample_rate, audio_ram_mb(),
                            time_kind="tonality_ecma_fast" if fast else None)
        mono = _calibrated_mono(part)
        sr   = part.sample_rate
        started = time.monotonic()
        result = _dispatch_metric(mono, sr, metric_key, field_type=field_type, fast=fast)
        # Exact and Fast have different speeds: each keeps its own average (it feeds the progress bar)
        limits.record_timing(metric_key + ("_fast" if fast else ""), part.duration_s, time.monotonic() - started)
        if not sec.whole:
            result = _shift_time(result, sec.offset_s)
            result["section"] = sec.span
            _remember_section(entry, cache_key)
        _add_statistics(result)
        entry._cache[cache_key] = result
        return result


def _add_statistics(result: Dict[str, Any]) -> None:
    """Statistics of the time series of the metric (mean, extremes, Nx), when it has one."""
    td = result.get("time_data")
    if not td:
        return
    stats = series_statistics(td.get("t", []), td.get("values", []))
    if stats is not None:
        result["stats"] = stats


def _remember_section(entry: AudioEntry, new_key: str) -> None:
    """Keep only the latest few section results: every selection the user drags would add one."""
    keys = [k for k in entry._cache if "|s" in k and k != new_key]
    for old in keys[: max(0, len(keys) + 1 - _MAX_SECTION_RESULTS)]:
        entry._cache.pop(old, None)


def _dispatch_metric(mono: np.ndarray, sr: int, key: str, field_type: str = "free", fast: bool = False) -> Dict[str, Any]:
    is_diffuse = field_type.lower() == "diffuse"
    if key == "loudness_zwk":
        return _metric_loudness_zwk(mono, sr, diffuse=is_diffuse)
    if key == "loudness_ecma":
        return _metric_loudness_ecma(mono, sr, diffuse=is_diffuse)
    if key == "sharpness_din":
        return _metric_sharpness(mono, sr, diffuse=is_diffuse)
    if key == "roughness_dw":
        return _metric_roughness_dw(mono, sr)
    if key == "roughness_ecma":
        return _metric_roughness_ecma(mono, sr, diffuse=is_diffuse)
    if key == "fluctuation_strength":
        return _metric_fluctuation(mono, sr)
    if key == "tonality_ecma":
        return _metric_tonality(mono, sr, diffuse=is_diffuse, fast=fast)
    if key == "ipm":
        return _metric_ipm(mono, sr)
    raise ValueError(msg(f"Métrica desconhecida: {key}", f"Unknown metric: {key}"))


def _metric_loudness_zwk(mono, sr, diffuse=False, compute_time_varying=True):
    loud = _LOUD or __import__('psychoacoustics.loudness', fromlist=['Loudness']).Loudness()
    try:
        bark, global_val, specific, time_data = loud.loudnessZWK(
            mono, sr,
            field_type="diffuse" if diffuse else "free",
            compute_time_varying=compute_time_varying,
        )
    except TypeError:
        bark, global_val, specific, time_data = loud.loudnessZWK(mono, sr)
    out = {
        "global": round(float(global_val), 3),
        "unit": "sone",
        "x_axis": bark.tolist(),
        "x_label": "Bark",
        "y_axis": specific.tolist(),
        "y_label": "Specific Loudness (sone/Bark)",
        "plot_type": "bar_or_line",
    }
    if time_data:
        out["time_data"] = {
            "t": time_data["t"].tolist(),
            "values": time_data["values"].tolist(),
        }
    return out


def _metric_loudness_ecma(mono, sr, diffuse=False):
    from psychoacoustics.loudness import Loudness
    loud = Loudness()
    # Try Sottek Hearing Model (ECMA-418-2 production); fall back to MoSQITo if unavailable.
    try:
        bark, global_val, specific, time_data = loud.loudnessECMA_Shm(
            mono, sr, field_type="diffuse" if diffuse else "free")
    except Exception:
        # MoSQITo fallback (loudness_ecma)
        try:
            bark, global_val, specific = loud.loudnessECMA_Mqt(mono, sr)
            time_data = None
        except Exception as e2:
            return {"error": str(e2)}
    # Ensure 1-D arrays (SHM may return 2-D depending on version)
    bark_arr     = np.asarray(bark).ravel()
    specific_arr = np.asarray(specific).ravel()
    # Trim to matching length (safety)
    n = min(len(bark_arr), len(specific_arr))
    out = {
        "global": round(float(global_val), 3),
        "unit": "sone",
        "x_axis": bark_arr[:n].tolist(),
        "x_label": "Bark HMS",
        "y_axis": specific_arr[:n].tolist(),
        "y_label": "Specific Loudness ECMA (sone/Bark HMS)",
        "plot_type": "bar_or_line",
    }
    if time_data:
        out["time_data"] = {
            "t": np.asarray(time_data["t"]).ravel().tolist(),
            "values": np.asarray(time_data["values"]).ravel().tolist(),
        }
    return out


def _metric_sharpness(mono, sr, diffuse=False):
    sharp = _SHARP or __import__('psychoacoustics.sharpness_din', fromlist=['Sharpnes_DIN']).Sharpnes_DIN()
    bark, global_val, specific = sharp.sharpnessCalculation(mono, sr, field_type="diffuse" if diffuse else "free")
    return {
        "global": round(float(global_val), 3),
        "unit": "acum",
        "x_axis": bark.tolist(),
        "x_label": "Bark",
        "y_axis": specific.tolist(),
        "y_label": "Specific Sharpness (acum/Bark)",
        "plot_type": "bar_or_line",
    }


def _metric_roughness_dw(mono, sr):
    rough = _ROUGH or __import__('psychoacoustics.roughness', fromlist=['Roughness']).Roughness()
    # roughnessDW returns (Bark, global, specific, time_data)
    bark, global_val, specific, time_data = rough.roughnessDW(mono, sr)
    out = {
        "global": round(float(global_val), 4),
        "unit": "asper",
        "x_axis": bark.tolist(),
        "x_label": "Bark",
        "y_axis": specific.tolist() if hasattr(specific, "tolist") else list(specific),
        "y_label": "Specific Roughness (asper/Bark)",
        "plot_type": "bar_or_line",
    }
    if time_data:
        out["time_data"] = {
            "t": time_data["t"].tolist(),
            "values": time_data["values"].tolist(),
        }
    return out


def _metric_roughness_ecma(mono, sr, diffuse=False):
    rough = _ROUGH or __import__('psychoacoustics.roughness', fromlist=['Roughness']).Roughness()
    # Try Sottek HM first; fall back to MoSQITo (roughnessECMA_Mqt).
    try:
        bark, global_val, specific, time_data = rough.roughnessECMA_Shm(
            mono, sr, field_type="diffuse" if diffuse else "free")
        has_time = True
    except Exception:
        try:
            bark, global_val, specific = rough.roughnessECMA_Mqt(mono, sr)
            time_data = None
            has_time = False
        except Exception as e2:
            return {"error": str(e2)}
    # Ensure 1-D arrays
    bark_arr     = np.asarray(bark).ravel()
    specific_arr = np.asarray(specific).ravel()
    n = min(len(bark_arr), len(specific_arr))
    out = {
        "global": round(float(global_val), 4),
        "unit": "asper",
        "x_axis": bark_arr[:n].tolist(),
        "x_label": "Bark HMS",
        "y_axis": specific_arr[:n].tolist(),
        "y_label": "Specific Roughness ECMA (asper/Bark HMS)",
        "plot_type": "bar_or_line",
    }
    if time_data:
        out["time_data"] = {
            "t": np.asarray(time_data["t"]).ravel().tolist(),
            "values": np.asarray(time_data["values"]).ravel().tolist(),
        }
    return out


def _metric_fluctuation(mono, sr):
    fs_calc = _FS_CALC or __import__('psychoacoustics.fluctuation_strength', fromlist=['FluctuationStrength']).FluctuationStrength()
    bark, global_val, specific = fs_calc.calculateFS(mono, sr)
    return {
        "global": round(float(global_val), 4),
        "unit": "vacil",
        "x_axis": bark.tolist(),
        "x_label": "Bark",
        "y_axis": specific.tolist(),
        "y_label": "Specific Fluctuation Strength (vacil/Bark)",
        "plot_type": "bar_or_line",
    }


def _metric_tonality(mono, sr, diffuse=False, fast=False):
    ton = _TON or __import__('psychoacoustics.tonality', fromlist=['TonalityECMA']).TonalityECMA()

    # ── Path 1: Sottek Hearing Model (ECMA-418-2 production) ─────────────────
    try:
        bark, global_val, specific, time_data = ton.tonalityECMA_Shm(
            mono, sr, field_type="diffuse" if diffuse else "free", fast=fast)
        out = {
            "global": round(float(global_val), 4),
            "unit": "tu",
            "precision": "fast" if fast else "exact",
            "x_axis": bark.tolist() if hasattr(bark, "tolist") else list(bark),
            "x_label": "Bark HMS",
            "y_axis": specific.tolist() if hasattr(specific, "tolist") else list(specific),
            "y_label": "Specific Tonality ECMA (tu/Bark)",
            "plot_type": "bar_or_line",
        }
        if time_data:
            out["time_data"] = {
                "t": time_data["t"].tolist(),
                "values": time_data["values"].tolist(),
            }
        return out
    except Exception as exc:
        # The older hand-made port of the standard used to answer here. It returned values off by orders of
        # magnitude (billions of tu for a 60 dB tone), so it is no longer used: an honest message is better.
        return {"error": msg("A Tonality (ECMA-418-2) precisa do pacote 'sottek-hearing-model'",
                             "Tonality (ECMA-418-2) needs the 'sottek-hearing-model' package")
                         + (f" ({exc})" if str(exc) else "") + "."}


def _ipm_input_error(exc) -> str:
    """Translated text of an IPMInputError (the module itself only knows English)."""
    i = exc.info
    if exc.reason == "too_short":
        return msg(f"O trecho é curto demais para a IPM: ela precisa de pelo menos {i['min_s']:.1f} s (este tem {i['seconds']:.2f} s).",
                   f"The segment is too short for the IPM: it needs at least {i['min_s']:.1f} s (this one has {i['seconds']:.2f} s).")
    if exc.reason == "sample_rate":
        return msg(f"A IPM precisa de taxa de amostragem de pelo menos {i['min_hz']} Hz; este arquivo tem {i['fs']} Hz. Use um arquivo de 44,1 ou 48 kHz.",
                   f"The IPM needs a sample rate of at least {i['min_hz']} Hz; this file is {i['fs']} Hz. Use a 44.1 or 48 kHz file.")
    return msg(f"O sinal tem {i['count']} valores inválidos (NaN ou infinito); a IPM não pode ser calculada.",
               f"The signal has {i['count']} invalid values (NaN or infinity); the IPM cannot be computed.")


def _metric_ipm(mono, sr):
    mpi_module = __import__('psychoacoustics.mpi', fromlist=['IPM', 'IPMInputError'])
    mpi_calc = _MPI or mpi_module.IPM()
    try:
        r = mpi_calc.analyze(mono, sr)
        top = int(np.argmax(r.mpi))
        return {
            "global": round(r.global_db, 3),          # amplitude sum of the bands with an event (0 when none); the thesis gives no formula for its global value
            "unit": "dB",
            "x_axis": r.z.tolist(),
            "x_label": "Bark HMS",
            "y_axis": r.mpi.tolist(),
            "y_label": "IPM [dB/Bark HMS]",
            "plot_type": "line",
            "threshold": mpi_module.THRESHOLD_DB,
            "threshold_label": "Impulsive Threshold (5 dB)",
            "impulsive": r.impulsive,
            "bands_over_threshold": r.bands_over_threshold,
            "reliable_bands": r.reliable_bands,
            "max_band_bark": float(r.z[top]),
            "max_band_hz": round(float(r.freqs[top]), 1),
            "max_mpi": round(float(r.mpi[top]), 3),
            "event_time_s": None if not r.detected.any() else round(r.strongest_event_time, 3),
        }
    except mpi_module.IPMInputError as e:
        return {"error": _ipm_input_error(e)}
    except Exception as e:
        return {"error": str(e)}



# ── Processing helpers ────────────────────────────────────────────────────────

def _derive(entry: AudioEntry, new_data: np.ndarray, tag: str, audio_id: Optional[str] = None) -> AudioEntry:
    """Create a new AudioEntry derived from *entry* with *new_data* and a name tag."""
    import copy, uuid
    import soundfile as sf
    new_entry = copy.copy(entry)
    new_entry.audio_id = usable_audio_id(audio_id) or uuid.uuid4().hex[:12]
    base = entry.name.rsplit('.', 1)[0]
    new_entry.name = f"{base}{tag}.wav"
    if new_data.ndim == 1 and entry.data.ndim == 2:
        new_data = np.stack([new_data] * entry.data.shape[1], axis=1)
    new_entry.data = new_data
    new_entry.duration_s = new_data.shape[0] / entry.sample_rate
    new_entry._cache = {}
    tmp = TMP_DIR / f"{uuid.uuid4().hex}.wav"
    # 32-bit float: processing (EQ, loudness adjustment...) can push samples past full scale, and
    # 16-bit PCM would clip them. Browsers play it and clip only at the loudspeaker.
    sf.write(str(tmp), new_entry.data, entry.sample_rate, subtype="FLOAT")
    new_entry.raw_path = tmp
    return new_entry


def apply_filter_to_entry(
    entry: AudioEntry,
    filter_type: str,
    cutoff=None,
    method: str = "Butterworth",
    fundamental: float | None = None,
    q_factor: float = 30.0,
    octave_gains_db=None,
    audio_id: Optional[str] = None,
) -> AudioEntry:
    from processing.filtering import apply_filter, FilterType
    ft = FilterType.from_label(filter_type)
    mono = _mono(entry.data)

    if isinstance(cutoff, list) and len(cutoff) == 2:
        cutoff = (float(cutoff[0]), float(cutoff[1]))
    elif isinstance(cutoff, (int, float)):
        cutoff = float(cutoff)

    filtered = apply_filter(
        mono, entry.sample_rate,
        filter_type=ft,
        cutoff=cutoff,
        order=4,
        design=method,
        octave_gains_db=octave_gains_db,
        fundamental=fundamental,
        q_factor=q_factor,
    )
    tag = f"[{filter_type.replace(' ', '_').lower()}]"
    return _derive(entry, filtered, tag, audio_id)


def apply_window_to_entry(
    entry: AudioEntry,
    start_sample: int,
    end_sample: int,
    window_type: str,
    audio_id: Optional[str] = None,
) -> AudioEntry:
    from processing.windowing import apply_window
    mono = _mono(entry.data)
    windowed, _ = apply_window(mono, entry.sample_rate,
                               start_sample=start_sample,
                               end_sample=end_sample,
                               window_type=window_type)
    tag = f"[win_{window_type.lower()}]"
    return _derive(entry, windowed, tag, audio_id)


def apply_weighting_to_entry(entry: AudioEntry, curve: str, audio_id: Optional[str] = None) -> AudioEntry:
    from processing.filtering import apply_weighting
    mono = _mono(entry.data)
    weighted = apply_weighting(mono, entry.sample_rate, curve)
    tag = f"[{curve.upper()}-weight]"
    return _derive(entry, weighted, tag, audio_id)


def apply_loudness_adj_to_entry(entry: AudioEntry, ref: AudioEntry, audio_id: Optional[str] = None) -> AudioEntry:
    loud = _LOUD or __import__('psychoacoustics.loudness', fromlist=['Loudness']).Loudness()
    mono = _mono(entry.data)
    ref_mono = _mono(ref.data)
    # Two full ISO 532-1 runs: the same memory cost as the metric itself, so it takes the
    # same compute slot and passes the same budget check.
    def stationary_loudness(x, sr_):
        return float(loud.loudnessZWK(x, sr_, field_type="free", compute_time_varying=False)[1])

    with limits.heavy_slot():
        for e in (entry, ref):
            limits.check_budget("loudness_zwk", e.duration_s, e.sample_rate, audio_ram_mb(), can_select=False,
                                time_kind="")      # the stationary loudness of the match is quick: only memory limits it
        ref_global = stationary_loudness(ref_mono, ref.sample_rate)
        src_global = stationary_loudness(mono, entry.sample_rate)
        if src_global < 1e-6 or ref_global < 1e-6:
            return _derive(entry, mono, "[loudness_adj]", audio_id)
        # Loudness grows with amplitude to the power of about 0.6, not linearly, so multiplying by the ratio of the two
        # loudnesses would land well short. Start from that power law, then correct on the measured loudness
        # (a few passes of a secant search on log N against log gain).
        exponent = 0.6
        scale = (ref_global / src_global) ** (1.0 / exponent)
        last = None
        for _ in range(8):
            got = stationary_loudness(mono * scale, entry.sample_rate)
            if got < 1e-9 or abs(got / ref_global - 1.0) < 0.005:
                break
            if last is not None and abs(np.log(scale / last[0])) > 1e-9:
                slope = (np.log(got) - np.log(last[1])) / (np.log(scale) - np.log(last[0]))
                if 0.2 < slope < 1.5:
                    exponent = slope
            last = (scale, got)
            scale *= (ref_global / got) ** (1.0 / exponent)
    return _derive(entry, mono * scale, "[loudness_adj]", audio_id)
