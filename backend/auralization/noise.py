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


def mix_snr(signal: np.ndarray, fs: float, color: str, snr_db: float, seed: int = 4321) -> np.ndarray:
    """Add independent noise to each channel of `signal` (n, 2) so that RMS(signal) / RMS(noise) is `snr_db`.

    The signal level is the RMS over the whole file and both channels, silent stretches included.
    """
    sig_rms = float(np.sqrt(np.mean(signal ** 2)))
    if sig_rms <= 0:
        return signal
    gain = sig_rms / 10 ** (snr_db / 20.0)
    noise = np.stack([coloured_noise(signal.shape[0], fs, color, seed + ch) for ch in range(signal.shape[1])], axis=1)
    return signal + gain * noise
