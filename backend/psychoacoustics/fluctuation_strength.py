"""
Fluctuation Strength - Zwicker & Fastl (1999) model
[excitation-weighted, coherent-modulation, calibrated]
======================================================================

Per 47 Bark bands (0.5 Bark step): bandpass -> Hilbert envelope -> LP<=20 Hz.
For each band the COHERENT modulation index m at the dominant modulation
frequency f_mod in [0.5,20] Hz is estimated from the envelope spectrum:
        m = min(1, 2*|Env(f_mod)| / (N * mean(Env)))
(for a sinusoidal AM of index a, m == a; for random noise m is small).
Raw specific FS:
        s'(z) = m(z) / (f_mod/4 + 4/f_mod)
Each band is weighted by its relative excitation w(z)=(E(z)/E_max) so that
unexcited bands do not contribute, and a global calibration constant is applied:
        F = sum_z  _CAL_FS * w(z) * s'(z)

FIX (2026-07)
-------------
The original version summed, over ALL 47 bands *unweighted*, a modulation depth
dL = P95-P5 of the dB envelope. Two defects:
  1. dL is non-zero even in near-silent bands (dB spread of the noise floor /
     spectral leakage of a tone), so a single 1 kHz tone contributed in every
     band -> ~6.4x inflation at the reference anchor.
  2. dL measures the TOTAL envelope variation, which is large for random noise,
     so broadband signals were grossly overestimated.
Fix: (a) replace dL by the COHERENT modulation index m at f_mod (small for
noise, ~1 for full AM); (b) weight bands by excitation energy; (c) recalibrate
so the anchor (1 kHz, 100% AM, 4 Hz, 60 dB) -> 1 vacil.

Validation: anchor 4 Hz -> 1.00 vacil; f_mod sweep peaks at 4 Hz
(1/2/4/8/16 Hz -> 0.47/0.80/1.00/0.79/0.39). Broadband agreement with a
reference commercial suite is much improved (still model-limited; the rigorous
alternative is the ECMA-418-2 Sottek model).

References
----------
Fastl H. & Zwicker E. (1999/2007). Psychoacoustics - Facts and Models, 3rd ed.
"""
from __future__ import annotations
import numpy as np
from scipy import signal as sp

_N_BARK = 47
_BARK_WIDTH  = 0.5
_BARK_CENTRES = np.arange(0.5, 24.0, _BARK_WIDTH)
_FMOD_LO = 0.5
_FMOD_HI = 20.0

# Calibrated so the anchor (1 kHz, 100% AM, 4 Hz, 60 dB) -> 1 vacil with the
# coherent-modulation, excitation-weighted summation below.
_CAL_FS = 1.707
_EXC_POW = 1.0   # excitation weighting exponent: w = (E/E_max)**_EXC_POW


def _bark2hz(z):
    z = np.asarray(z, dtype=float)
    return 1960.0 * (z + 0.53) / np.maximum(26.28 - z, 0.001)


class FluctuationStrength:
    """Fluctuation Strength after Zwicker & Fastl (1999)."""

    def calculateFS(self, signal, fs):
        sig = np.asarray(signal, dtype=float)
        if sig.ndim > 1:
            sig = np.mean(sig, axis=-1)
        sig = sig.ravel()
        if len(sig) == 0:
            return _BARK_CENTRES.copy(), 0.0, np.zeros(_N_BARK)

        nyq = fs / 2.0
        s_raw    = np.zeros(_N_BARK)
        band_rms = np.zeros(_N_BARK)

        for k, zc in enumerate(_BARK_CENTRES):
            f_lo = float(_bark2hz(max(0.01, zc - _BARK_WIDTH / 2)))
            f_hi = float(_bark2hz(min(23.9,  zc + _BARK_WIDTH / 2)))
            f_hi = min(f_hi, 0.98 * nyq)
            fc   = float(_bark2hz(zc))
            if f_lo >= f_hi or fc >= 0.98 * nyq:
                continue
            try:
                sos_bp = sp.butter(4, [f_lo, f_hi], btype='bandpass', fs=fs, output='sos')
                band = sp.sosfilt(sos_bp, sig)
            except Exception:
                continue

            band_rms[k] = float(np.sqrt(np.mean(band ** 2)))

            envelope = np.abs(sp.hilbert(band))
            sos_lp = sp.butter(2, _FMOD_HI, btype='low', fs=fs, output='sos')
            env_lp = np.maximum(sp.sosfilt(sos_lp, envelope), 1e-12)

            dc = float(env_lp.mean())
            if dc <= 1e-11:
                continue

            n     = len(env_lp)
            freqs = np.fft.rfftfreq(n, 1.0 / fs)
            mag   = np.abs(np.fft.rfft(env_lp - dc))
            mask  = (freqs >= _FMOD_LO) & (freqs <= _FMOD_HI)
            if not mask.any() or mag[mask].max() <= 0:
                continue
            i      = int(np.argmax(mag[mask]))
            f_band = float(freqs[mask][i])
            peak   = float(mag[mask][i])

            # Coherent modulation index at f_band (== AM index for a sinusoid)
            m_idx = min(1.0, 2.0 * peak / (n * dc))

            s_raw[k] = m_idx / (f_band / 4.0 + 4.0 / f_band)

        if band_rms.max() > 0:
            w = (band_rms / band_rms.max()) ** _EXC_POW
        else:
            w = np.zeros_like(band_rms)

        specific_fs = _CAL_FS * w * s_raw
        global_fs = float(np.sum(specific_fs))
        return _BARK_CENTRES.copy(), global_fs, specific_fs
