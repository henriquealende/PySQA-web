"""Background noise for the scenes: coloured noise mixed with the signal at a chosen signal-to-noise ratio."""
from __future__ import annotations

import numpy as np

COLORS = {"white": 0.0, "pink": 1.0, "brown": 2.0}      # power spectrum proportional to 1 / f^alpha
F_FLOOR_HZ = 20.0                                         # below this the spectrum stays flat (no runaway at DC)


def coloured_noise(n: int, fs: float, color: str, seed: int) -> np.ndarray:
    """Gaussian noise of unit RMS with the power spectrum of the colour asked for."""
    alpha = COLORS[color]
    x = np.random.default_rng(seed).standard_normal(n)
    if alpha > 0:
        spec = np.fft.rfft(x)
        f = np.maximum(np.fft.rfftfreq(n, 1.0 / fs), F_FLOOR_HZ)
        spec *= f ** (-alpha / 2.0)
        x = np.fft.irfft(spec, n)
    rms = float(np.sqrt(np.mean(x ** 2)))
    return (x / rms) if rms > 0 else x


def noise_component(signal: np.ndarray, fs: float, color: str, snr_db: float, seed: int = 4321) -> np.ndarray:
    """The noise that `mix_snr` adds: independent in each channel, RMS(signal) / RMS(noise) = `snr_db`.

    The signal level is the RMS over the whole file and both channels, silent stretches included.
    """
    sig_rms = float(np.sqrt(np.mean(signal ** 2)))
    if sig_rms <= 0:
        return np.zeros_like(signal)
    gain = sig_rms / 10 ** (snr_db / 20.0)
    return gain * np.stack([coloured_noise(signal.shape[0], fs, color, seed + ch) for ch in range(signal.shape[1])], axis=1)


def mix_snr(signal: np.ndarray, fs: float, color: str, snr_db: float, seed: int = 4321) -> np.ndarray:
    """Add independent noise to each channel of `signal` (n, 2) so that RMS(signal) / RMS(noise) is `snr_db`."""
    return signal + noise_component(signal, fs, color, snr_db, seed)


THIRD_OCTAVE_CENTRES = np.array([
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150,
    4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000.0])


def third_octave_levels(x: np.ndarray, fs: float) -> tuple:
    """Level of each 1/3-octave band, in dB re the RMS of a full-scale sine (0 dB), for a signal (n,) or (n, channels).

    The power of the channels is averaged. Bands above 0.45 fs are left out. Returns (centres, levels).
    """
    from scipy.signal import welch
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    nper = int(min(8192, max(1024, x.shape[0])))
    f, psd = welch(x, fs=fs, nperseg=nper, window="hann", axis=0, scaling="density")
    psd = psd.mean(axis=1)
    df = f[1] - f[0]
    centres, levels = [], []
    for fc in THIRD_OCTAVE_CENTRES:
        lo, hi = fc / 2 ** (1 / 6), fc * 2 ** (1 / 6)
        if hi > 0.45 * fs:
            break
        sel = (f >= lo) & (f < hi)
        power = float(psd[sel].sum() * df) if np.any(sel) else 0.0
        centres.append(float(fc))
        levels.append(10.0 * np.log10(max(power, 1e-20) / 0.5))
    return np.asarray(centres), np.asarray(levels)
