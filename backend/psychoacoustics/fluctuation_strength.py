"""
Fluctuation Strength - Zwicker & Fastl (1999) model
====================================================

Algorithm
---------
For each of 47 Bark bands (0.5 Bark step, centres at 0.5 … 23.5 Bark):
  1. Butterworth bandpass-filter (4th order) into the Bark band.
  2. Hilbert envelope of the filtered signal.
  3. Lowpass-filter the envelope at fmod_hi (20 Hz) to isolate slow modulations.
  4. Modulation depth ΔL (dB) = percentile_95 − percentile_5 of log-envelope.
  5. FFT of the DC-removed lowpass envelope → find dominant f_mod in [0.5, 20] Hz.
  6. Specific FS per band:
         fs'(z) = 0.008 · ΔL / (f_mod/4 + 4/f_mod)

Global f_mod = median across active bands.

Global fluctuation strength:
    F = Σ_z fs'(z)

References
----------
Fastl H. & Zwicker E. (1999/2007). Psychoacoustics - Facts and Models, 3rd ed.
"""
from __future__ import annotations
import numpy as np
from scipy import signal as sp

_N_BARK = 47
_BARK_WIDTH  = 0.5                          # Bark
_BARK_CENTRES = np.arange(0.5, 24.0, _BARK_WIDTH)   # 47 centres

_FMOD_LO = 0.5   # Hz
_FMOD_HI = 20.0  # Hz


def _bark2hz(z):
    z = np.asarray(z, dtype=float)
    return 1960.0 * (z + 0.53) / np.maximum(26.28 - z, 0.001)


class FluctuationStrength:
    """Fluctuation Strength after Zwicker & Fastl (1999)."""

    def calculateFS(self, signal, fs):
        """Compute Fluctuation Strength.

        Parameters
        ----------
        signal : array_like   1-D (or multi-channel, mixed to mono) float signal.
        fs     : int          Sampling rate [Hz].

        Returns
        -------
        bark        : ndarray (47,)  Bark-band centres [Bark].
        global_fs   : float          Global fluctuation strength [vacil].
        specific_fs : ndarray (47,)  Specific fluct. strength [vacil/Bark].
        """
        sig = np.asarray(signal, dtype=float)
        if sig.ndim > 1:
            sig = np.mean(sig, axis=-1)
        sig = sig.ravel()

        if len(sig) == 0:
            return _BARK_CENTRES.copy(), 0.0, np.zeros(_N_BARK)

        nyq         = fs / 2.0
        specific_fs = np.zeros(_N_BARK)
        fmod_active = []

        for k, zc in enumerate(_BARK_CENTRES):
            f_lo = float(_bark2hz(max(0.01, zc - _BARK_WIDTH / 2)))
            f_hi = float(_bark2hz(min(23.9,  zc + _BARK_WIDTH / 2)))
            f_hi = min(f_hi, 0.98 * nyq)
            fc   = float(_bark2hz(zc))

            if f_lo >= f_hi or fc >= 0.98 * nyq:
                continue

            # ── 1. Bandpass filter ────────────────────────────────────────────
            try:
                sos_bp = sp.butter(4, [f_lo, f_hi], btype='bandpass',
                                   fs=fs, output='sos')
                band = sp.sosfilt(sos_bp, sig)
            except Exception:
                continue

            # ── 2. Hilbert envelope ───────────────────────────────────────────
            envelope = np.abs(sp.hilbert(band))

            # ── 3. Lowpass-filter envelope to isolate slow modulations ────────
            sos_lp = sp.butter(2, _FMOD_HI, btype='low', fs=fs, output='sos')
            env_lp = sp.sosfilt(sos_lp, envelope)
            env_lp = np.maximum(env_lp, 1e-12)

            # ── 4. Modulation depth ΔL (dB, P95 − P5) ────────────────────────
            env_db  = 20.0 * np.log10(env_lp)
            delta_L = float(np.percentile(env_db, 95) - np.percentile(env_db, 5))
            delta_L = max(0.0, delta_L)

            if delta_L < 0.1:
                continue

            # ── 5. Dominant modulation frequency (FFT of DC-removed envelope) ─
            n     = len(env_lp)
            freqs = np.fft.rfftfreq(n, 1.0 / fs)
            mag   = np.abs(np.fft.rfft(env_lp - env_lp.mean()))
            mask  = (freqs >= _FMOD_LO) & (freqs <= _FMOD_HI)

            if mask.any() and mag[mask].max() > 0:
                f_band = float(freqs[mask][np.argmax(mag[mask])])
            else:
                f_band = 4.0

            fmod_active.append(f_band)

            # ── 6. Specific FS (Zwicker & Fastl formula) ─────────────────────
            specific_fs[k] = (0.008 * delta_L) / (f_band / 4.0 + 4.0 / f_band)

        # Global f_mod: median of active bands
        f_mod = float(np.median(fmod_active)) if fmod_active else 4.0

        global_fs = float(np.sum(specific_fs))

        return _BARK_CENTRES.copy(), global_fs, specific_fs
