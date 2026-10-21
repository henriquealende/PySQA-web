"""High-level audio analysis helpers called by the routers."""
from __future__ import annotations

import io
import os
import tempfile
import uuid
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

import numpy as np
from scipy.io import wavfile
from scipy.signal import spectrogram as scipy_spectrogram, hilbert

from services.session_store import AudioEntry, audio_ram_mb, new_audio_id, persist_session
from utils import limits

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

def load_wav(file_bytes: bytes, filename: str) -> AudioEntry:
    """Parse WAV bytes, normalise to float64 [-1,1], save tmp file."""
    sr, data = wavfile.read(io.BytesIO(file_bytes))
    # Normalise to float64
    if data.dtype == np.int16:
        norm = data.astype(np.float64) / 32768.0
    elif data.dtype == np.int32:
        norm = data.astype(np.float64) / 2147483648.0
    elif np.issubdtype(data.dtype, np.floating):
        norm = data.astype(np.float64)
    else:
        norm = data.astype(np.float64)

    channels = 1 if norm.ndim == 1 else norm.shape[1]
    n_samples = norm.shape[0]
    duration_s = n_samples / sr

    # Save to tmp file for streaming
    audio_id = new_audio_id()
    tmp_path = TMP_DIR / f"{audio_id}.wav"
    wavfile.write(str(tmp_path), sr, (norm * 32767).astype(np.int16))

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


def compute_waveform(entry: AudioEntry) -> Dict[str, Any]:
    mono = _mono(entry.data)
    n = len(mono)
    if n > _WAVEFORM_MAX_POINTS:
        t_ds, mono_ds = _minmax_envelope(mono, entry.sample_rate, _WAVEFORM_MAX_POINTS)
    else:
        mono_ds = mono
        t_ds = np.arange(n) / entry.sample_rate

    return {
        "t": np.round(t_ds, 6).tolist(),
        "amplitude": np.round(mono_ds, 6).tolist(),
        "peak": float(np.max(np.abs(mono))) if n else 0.0,
        "duration_s": entry.duration_s,
        "sample_rate": entry.sample_rate,
    }


# ── Spectrum (FFT) ────────────────────────────────────────────────────────────

def compute_spectrum(entry: AudioEntry) -> Dict[str, Any]:
    limits.check_budget("spectrum", entry.duration_s, entry.sample_rate, audio_ram_mb())
    mono = _mono(entry.data)
    calibrated = entry.calibration_pa is not None
    if calibrated:
        mono = mono * entry.calibration_pa  # scale to Pa

    n = len(mono)
    window = np.hanning(n)
    fft = np.fft.rfft(mono * window)
    freqs = np.fft.rfftfreq(n, d=1.0 / entry.sample_rate)
    mag = np.abs(fft)

    # dB SPL re 20 µPa when calibrated (window amplitude correction: sum(window)/N), else dBFS
    ref = 20e-6 * (n / 2) if calibrated else (n / 2)

    def to_db(v):
        return np.round(20 * np.log10(v / ref + 1e-12), 2)

    out: Dict[str, Any] = {"calibrated": calibrated}
    if len(freqs) > _SPECTRUM_MAX_POINTS:
        # magnitude_db is the per-bucket peak (tones never disappear);
        # average_db is the per-bucket power mean (the noise floor).
        centre, peak, rms = _log_reduce(freqs, mag, _SPECTRUM_MAX_POINTS)
        out["freqs"] = np.round(centre, 3).tolist()
        out["magnitude_db"] = to_db(peak).tolist()
        out["average_db"] = to_db(rms).tolist()
    else:
        out["freqs"] = np.round(freqs, 3).tolist()
        out["magnitude_db"] = to_db(mag).tolist()
    return out


# ── Spectrogram ───────────────────────────────────────────────────────────────

def compute_spectrogram(entry: AudioEntry, params: dict | None = None) -> Dict[str, Any]:
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
        "t": t.tolist(),
        "f": f.tolist(),
        "power_db": Sxx_db.tolist(),
        "z_min": vmin,
        "z_max": vmax,
        "cmap": str(p.get("cmap", "magma")),
        "freq_scale": str(p.get("freq_scale", "log")),
    }


# ── 1/3-Octave bands ─────────────────────────────────────────────────────────

def compute_octave_bands(entry: AudioEntry, weighting: str = "Z") -> Dict[str, Any]:
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
    }


# ── Envelope ──────────────────────────────────────────────────────────────────

def compute_envelope(
    entry: AudioEntry,
    smoothing_ms: float = 0.0,
    lpf_hz: float | None = None,
) -> Dict[str, Any]:
    from scipy.signal import butter, filtfilt
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
        envelope = np.convolve(envelope, kernel, mode="same")

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
        "t": np.round(t, 6).tolist(),
        "signal": np.round(sig_ds, 6).tolist(),
        "envelope": np.round(env_ds, 6).tolist(),
        "f_env": np.round(f_env, 3).tolist(),
        "env_spec_db": np.round(env_spec_db, 2).tolist(),
    }


# ── Psychoacoustic metrics ────────────────────────────────────────────────────

def _calibrated_mono(entry: AudioEntry) -> np.ndarray:
    """Return mono signal scaled to Pa if calibration is set, else normalised float."""
    mono = _mono(entry.data)
    if entry.calibration_pa is not None:
        mono = mono * entry.calibration_pa
    return mono


def compute_metric(entry: AudioEntry, metric_key: str, field_type: str = "free") -> Dict[str, Any]:
    """Dispatch to the correct psychoacoustic computation."""
    cal_tag = f"cal{entry.calibration_pa:.6f}" if entry.calibration_pa else "raw"
    cache_key = f"metric_{metric_key}_{field_type}_{cal_tag}"
    if cache_key in entry._cache:
        return entry._cache[cache_key]

    # One memory-hungry computation at a time; the others wait for the slot.
    with limits.heavy_slot():
        if cache_key in entry._cache:          # finished by a request that was ahead in the queue
            return entry._cache[cache_key]
        limits.check_budget(metric_key, entry.duration_s, entry.sample_rate, audio_ram_mb())
        mono = _calibrated_mono(entry)
        sr   = entry.sample_rate
        result = _dispatch_metric(mono, sr, metric_key, field_type=field_type)
        entry._cache[cache_key] = result
        return result


def _dispatch_metric(mono: np.ndarray, sr: int, key: str, field_type: str = "free") -> Dict[str, Any]:
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
        return _metric_roughness_ecma(mono, sr)
    if key == "fluctuation_strength":
        return _metric_fluctuation(mono, sr)
    if key == "tonality_ecma":
        return _metric_tonality(mono, sr, diffuse=is_diffuse)
    if key == "ipm":
        return _metric_ipm(mono, sr)
    raise ValueError(f"Unknown metric: {key}")


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
    try:
        bark, global_val, specific = sharp.sharpnessCalculation(mono, sr, field_type="diffuse" if diffuse else "free")
    except TypeError:
        bark, global_val, specific = sharp.sharpnessCalculation(mono, sr)
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


def _metric_roughness_ecma(mono, sr):
    rough = _ROUGH or __import__('psychoacoustics.roughness', fromlist=['Roughness']).Roughness()
    # Try Sottek HM first; fall back to MoSQITo (roughnessECMA_Mqt).
    try:
        bark, global_val, specific, time_data = rough.roughnessECMA_Shm(mono, sr)
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


def _metric_tonality(mono, sr, diffuse=False):
    ton = _TON or __import__('psychoacoustics.tonality', fromlist=['TonalityECMA']).TonalityECMA()

    # ── Path 1: Sottek Hearing Model (ECMA-418-2 production) ─────────────────
    try:
        bark, global_val, specific, time_data = ton.tonalityECMA_Shm(mono, sr)
        out = {
            "global": round(float(global_val), 4),
            "unit": "tu",
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
    except Exception:
        pass  # fall through to native implementation

    # ── Path 2: Native Python ECMA-418-2 implementation ──────────────────────
    try:
        T, Ts, Ttd, Tsv, fts, ftd, F, t, z = ton.calculate_tonality(mono, sr)
        return {
            "global": round(float(Tsv), 4),
            "unit": "tu",
            "x_axis": z.tolist(),
            "x_label": "Bark HMS",
            "y_axis": Ts.tolist(),
            "y_label": "Specific Tonality ECMA (tu/Bark)",
            "plot_type": "bar_or_line",
            "time_data": {
                "t": t.tolist(),
                "values": Ttd.tolist(),
            },
        }
    except Exception as e:
        return {"error": str(e)}


def _metric_ipm(mono, sr):
    mpi_calc = _MPI or __import__('psychoacoustics.mpi', fromlist=['IPM']).IPM()
    try:
        bark, levels = mpi_calc.calculateMPI(mono, sr)
        levels_arr = np.asarray(levels, dtype=float)
        # Global: energy-sum in dB (same formula as Python app)
        global_val = float(10.0 * np.log10(np.sum(10.0 ** (levels_arr / 10.0))))
        return {
            "global": round(global_val, 3),
            "unit": "dB",
            "x_axis": bark.tolist(),
            "x_label": "Bark HMS",
            "y_axis": levels_arr.tolist(),
            "y_label": "IPM [dB/Bark HMS]",
            "plot_type": "line",
            "threshold": 5.0,
            "threshold_label": "Impulsive Threshold (5 dB)",
        }
    except Exception as e:
        return {"error": str(e)}



# ── Processing helpers ────────────────────────────────────────────────────────

def _derive(entry: AudioEntry, new_data: np.ndarray, tag: str) -> AudioEntry:
    """Create a new AudioEntry derived from *entry* with *new_data* and a name tag."""
    import copy, uuid
    import soundfile as sf
    new_entry = copy.copy(entry)
    new_entry.audio_id = uuid.uuid4().hex[:12]
    base = entry.name.rsplit('.', 1)[0]
    new_entry.name = f"{base}{tag}.wav"
    if new_data.ndim == 1 and entry.data.ndim == 2:
        new_data = np.stack([new_data] * entry.data.shape[1], axis=1)
    new_entry.data = new_data
    new_entry.duration_s = new_data.shape[0] / entry.sample_rate
    new_entry._cache = {}
    tmp = TMP_DIR / f"{new_entry.audio_id}.wav"
    sf.write(str(tmp), new_entry.data, entry.sample_rate)
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
    return _derive(entry, filtered, tag)


def apply_window_to_entry(
    entry: AudioEntry,
    start_sample: int,
    end_sample: int,
    window_type: str,
) -> AudioEntry:
    from processing.windowing import apply_window
    mono = _mono(entry.data)
    windowed, _ = apply_window(mono, entry.sample_rate,
                               start_sample=start_sample,
                               end_sample=end_sample,
                               window_type=window_type)
    tag = f"[win_{window_type.lower()}]"
    return _derive(entry, windowed, tag)


def apply_weighting_to_entry(entry: AudioEntry, curve: str) -> AudioEntry:
    from processing.filtering import apply_weighting
    mono = _mono(entry.data)
    weighted = apply_weighting(mono, entry.sample_rate, curve)
    tag = f"[{curve.upper()}-weight]"
    return _derive(entry, weighted, tag)


def apply_loudness_adj_to_entry(entry: AudioEntry, ref: AudioEntry) -> AudioEntry:
    loud = _LOUD or __import__('psychoacoustics.loudness', fromlist=['Loudness']).Loudness()
    mono = _mono(entry.data)
    ref_mono = _mono(ref.data)
    try:
        _, ref_global, _, _ = loud.loudnessZWK(ref_mono, ref.sample_rate)
        _, src_global, _, _ = loud.loudnessZWK(mono, entry.sample_rate)
    except Exception:
        _, ref_global, _ = loud.loudnessZWK(ref_mono, ref.sample_rate)
        _, src_global, _ = loud.loudnessZWK(mono, entry.sample_rate)
    if src_global < 1e-6:
        return _derive(entry, mono, "[loudness_adj]")
    scale = ref_global / src_global
    adjusted = mono * scale
    tag = "[loudness_adj]"
    return _derive(entry, adjusted, tag)
