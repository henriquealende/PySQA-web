"""
IMPULSIVE PROMINENCE METRIC (IPM): LEGACY VERSION (until October 2026)
====================================================================
This is the implementation the app used before the rewrite in `mpi.py` (which follows the thesis: ECMA-418-2 filter
bank, level history, onset rate and level difference of NT ACOU 112). It is kept so that numbers computed with it can be
reproduced and compared; `dev-tests/test_ipm_legacy.py` describes its behaviour. Do not use it for new work.

Original description
--------------------
Computes a per-band impulsiveness metric across 21 one-third-octave bands
(100 Hz - 10 kHz) following the NT ACOU 112 formulation.

Original work of Henrique Alende da Silveira, developed in the doctoral thesis "Qualidade sonora aplicada na análise de sinais
impulsivos de refrigeradores" (UFSC, 2024) and in the articles listed under References.
Copyright (C) Henrique Alende da Silveira. Part of PySQA Web, licensed under the GNU Affero General Public License v3.0 (see LICENSE).

Algorithm overview
------------------
1. The signal is band-pass filtered into 21 one-third-octave bands
   (centre frequencies 100 Hz ... 10 kHz, 6th-order Butterworth, +-1/6 octave).
2. For each band the highest-prominence peak is located.  A 200 ms analysis
   window is positioned around that peak.
3. Inside the window, band energy is converted to dB SPL
   (ref. 20 uPa).  The *prominence* P is computed from the
   onset-rate OR and the level-difference index LDI:

       OR  = (L_max - L_mean) / (15 * T_event)
       LDI = L_max - L_mean
       P   = 3*log10(OR) + 2*log10(LDI)

4. A psychoacoustic frequency-weighting curve (derived from JND data)
   is added to the per-band prominence values to yield the final IPM
   spectrum.

The bands are filtered and measured one at a time, so the memory needed is that of one
band signal (about 8 bytes per sample) and not of all 21 together.

References
----------
da Silveira, H. A., Vergara, E. F., Lenzi, A., & Santos, G. B. (2024). Psychoacoustic model for
detecting the sensation of impulsivity in acoustic signals from refrigerators.
Applied Acoustics, 225, 110198.

da Silveira, H. A., Brum, R., Doi, R. M., Vergara, E. F., & Lenzi, A. (2026). Discomfort
prediction model for impulsive noise in household refrigerator.
Applied Acoustics, 242, 111068.
"""

from __future__ import annotations

from functools import lru_cache
from typing import TYPE_CHECKING

import numpy as np
from scipy import signal as sp

if TYPE_CHECKING:
    from numpy.typing import ArrayLike

# ---------------------------------------------------------------------------
# Module-level constants
# ---------------------------------------------------------------------------

#: One-third-octave centre frequencies [Hz] used for band analysis.
CENTRE_FREQUENCIES: np.ndarray = np.array([
    100, 125, 160, 200, 250, 315, 400, 500, 630, 800,
    1000, 1250, 1600, 2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000,
], dtype=float)

#: Bark-scale values corresponding to each centre frequency.
BARK_SCALE: np.ndarray = np.linspace(0.9867, 21.7292, len(CENTRE_FREQUENCIES))

#: Duration of the analysis window around an impulsive peak [s].
_EVENT_DURATION_S: float = 0.200

#: Minimum peak prominence expressed as a multiple of the band std-dev.
_MIN_PROMINENCE_FACTOR: float = 5.0

#: Butterworth filter order for the one-third-octave band-pass filters.
_FILTER_ORDER: int = 6

#: One-third-octave bandwidth factor: f_upper / f_centre = 2^(1/6).
_BAND_FACTOR: float = 2.0 ** (1.0 / 6.0)

#: Reference sound pressure [Pa].
_P_REF: float = 2e-5

#: Shortest signal the zero-phase filter accepts (its padding is 39 samples long).
_MIN_SAMPLES: int = 40

#: Weighting-function frequency support and JND values.
_JND_FREQS: np.ndarray = np.array([250, 500, 1000, 2000, 3000, 4000, 8000], dtype=float)
_JND_VALUES: np.ndarray = np.array([0.0276, 0.0139, 0.0093, 0.0072, 0.0053, 0.0072, 0.0159])

#: The weighting curve is evaluated on 1981 points from 100 to 10 080 Hz (5.04 Hz apart); these
#: sparse indices pick the point nearest to each centre frequency (up to 4 % above it, which
#: changes the weighting by at most 0.06 dB).
_WEIGHTING_INDICES: np.ndarray = np.array([
    0, 6, 13, 21, 31, 44, 61, 81, 107, 141, 181, 231,
    301, 381, 481, 611, 781, 981, 1241, 1581, 1980,
])


class IPMInputError(ValueError):
    """The signal cannot be analysed. ``reason`` is ``too_short``, ``sample_rate`` or ``not_finite``;
    ``info`` carries the numbers a message needs (the server turns them into a translated text)."""

    def __init__(self, reason: str, **info) -> None:
        self.reason = reason
        self.info = info
        super().__init__({
            "too_short": "The signal is too short for the IPM: it needs at least {min_samples} samples (got {samples}).",
            "sample_rate": "The IPM needs a sample rate above {min_hz:.0f} Hz (its 10 kHz band reaches {top_hz:.0f} Hz); got {fs} Hz.",
            "not_finite": "The signal has {count} invalid values (NaN or infinity); the IPM cannot be computed.",
        }[reason].format(**info))


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class IPM:
    """
    Impulsive Prominence Metric (IPM) calculator.

    Usage
    -----
    >>> ipm = IPM()
    >>> bark, values = ipm.calculateMPI(signal, fs)

    ``calculateMPI`` keeps the name the method had when the metric was first called MPI.
    """

    # ------------------------------------------------------------------ API

    def calculateMPI(
        self,
        time_data: np.ndarray,
        sampling_rate: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Compute the IPM spectrum for *time_data*.

        Parameters
        ----------
        time_data : ndarray, shape (N,) or (N, channels)
            Input signal.  Multi-channel arrays use only the first channel.
        sampling_rate : int
            Sample rate in Hz.

        Returns
        -------
        bark : ndarray, shape (21,)
            Bark-scale axis corresponding to each centre frequency.
        ipm  : ndarray, shape (21,)
            IPM value [dB-like] per one-third-octave band.

        Raises
        ------
        IPMInputError
            Too few samples, a sample rate too low for the 10 kHz band, or NaN / infinity in the signal.
        """
        time_data = np.asarray(time_data, dtype=float)

        if time_data.size == 0:
            return BARK_SCALE.copy(), np.zeros(len(CENTRE_FREQUENCIES))

        mono = time_data[:, 0] if time_data.ndim > 1 else time_data
        self._validate(mono, sampling_rate)

        # One band at a time: filter, measure, drop (the 21 band signals are never all in memory)
        half_win = int(_EVENT_DURATION_S * sampling_rate) // 2
        prominence = np.zeros(len(CENTRE_FREQUENCIES))
        for k, sos in enumerate(_band_sos(sampling_rate)):
            prominence[k] = self._band_prominence(sp.sosfiltfilt(sos, mono), half_win)

        return BARK_SCALE.copy(), prominence + self._frequency_weighting()

    # -------------------------------------------------------- private helpers

    @staticmethod
    def _validate(mono: np.ndarray, sampling_rate: int) -> None:
        """Refuse, with a clear reason, what the filters or the peak search cannot handle."""
        if len(mono) < _MIN_SAMPLES:
            raise IPMInputError("too_short", min_samples=_MIN_SAMPLES, samples=len(mono))
        top_hz = float(CENTRE_FREQUENCIES[-1] * _BAND_FACTOR)
        if sampling_rate / 2.0 <= top_hz:
            raise IPMInputError("sample_rate", fs=sampling_rate, top_hz=top_hz, min_hz=2.0 * top_hz)
        bad = int(np.size(mono) - np.count_nonzero(np.isfinite(mono)))
        if bad:
            raise IPMInputError("not_finite", count=bad)

    @staticmethod
    def _bandpass_filter(
        time_data: np.ndarray,
        sampling_rate: int,
    ) -> np.ndarray:
        """
        Filter *time_data* into all 21 one-third-octave band signals at once.

        This holds 21 copies of the signal; ``calculateMPI`` does not use it (it goes band by band). It is
        kept for diagnostics and for the tests that compare the two paths.

        Returns
        -------
        band_signals : ndarray, shape (n_bands, N)
        """
        mono = time_data[:, 0] if time_data.ndim > 1 else time_data
        band_signals = np.empty((len(CENTRE_FREQUENCIES), len(mono)))
        for k, sos in enumerate(_band_sos(sampling_rate)):
            band_signals[k] = sp.sosfiltfilt(sos, mono)
        return band_signals

    @staticmethod
    def _band_prominence(band: np.ndarray, half_win: int) -> float:
        """
        Prominence P of one band signal (0 when the band has no event).

        The highest peak among those standing out by 5 standard deviations is found, a window of
        ``2 * half_win`` samples is centred on it, and P is computed from the level difference inside it.
        """
        # 1. Peak detection
        min_prom = _MIN_PROMINENCE_FACTOR * np.std(band)
        peaks, _ = sp.find_peaks(band, prominence=min_prom)

        if peaks.size == 0:
            return 0.0

        # 2. Analysis window centred on the highest peak
        peak_idx = peaks[int(np.argmax(band[peaks]))]
        i_start = max(0, peak_idx - half_win)
        i_end = min(len(band), peak_idx + half_win)
        window = band[i_start:i_end]

        if window.size == 0:
            return 0.0

        # 3. Convert to dB SPL (ref. 20 uPa)
        with np.errstate(divide="ignore"):
            spl = 20.0 * np.log10(np.abs(window) / _P_REF)
        spl = np.where(np.isneginf(spl), 0.0, spl)

        l_max = float(spl.max())
        l_mean = float(spl.mean())
        delta = l_max - l_mean

        if delta <= 0.0:
            return 0.0

        # 4. Prominence: P = 3*log10(OR) + 2*log10(LDI)
        onset_rate = delta / (15.0 * _EVENT_DURATION_S)
        p_value = 3.0 * np.log10(onset_rate) + 2.0 * np.log10(delta)

        return float(p_value) if np.isfinite(p_value) else 0.0

    @staticmethod
    def _compute_prominence(
        band_signals: np.ndarray,
        sampling_rate: int,
    ) -> np.ndarray:
        """
        Prominence P of each row of *band_signals* (shape (n_bands, N)), without the weighting.

        Same numbers as the band-by-band path of ``calculateMPI``; used with ``_bandpass_filter``.
        """
        half_win = int(_EVENT_DURATION_S * sampling_rate) // 2
        return np.array([IPM._band_prominence(band, half_win) for band in band_signals])

    @staticmethod
    def _frequency_weighting() -> np.ndarray:
        """
        Evaluate the JND-based psychoacoustic weighting at each centre
        frequency and return the 21-element weighting vector [dB-like].

        Returns
        -------
        weighting : ndarray, shape (21,)
        """
        _, weighting_curve = _weighting_curve()
        return weighting_curve[_WEIGHTING_INDICES]

    def plot_weighting(self) -> None:  # pragma: no cover
        """
        Display the JND interpolation and the derived weighting curve.

        Requires *matplotlib*.  Intended for diagnostic use only.
        """
        import matplotlib.pyplot as plt

        freq_axis, weighting_curve = _weighting_curve()
        jnd_interp = np.interp(freq_axis, _JND_FREQS, _JND_VALUES)

        fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 4))

        ax1.semilogx(freq_axis, jnd_interp, linestyle="dashed", label="Interpolated")
        ax1.semilogx(_JND_FREQS, _JND_VALUES, "o", markerfacecolor="orange",
                     markersize=8, label="Experimental")
        ax1.set_xlabel("Frequency [Hz]")
        ax1.set_ylabel("Just Noticeable Difference (JND)")
        ax1.set_xticks(_JND_FREQS)
        ax1.set_xticklabels(_JND_FREQS.astype(int))
        ax1.grid(True, which="both")
        ax1.legend()

        ax2.semilogx(freq_axis, weighting_curve)
        ax2.set_xlabel("Frequency [Hz]")
        ax2.set_ylabel("Weighting [dBFS]")
        ax2.set_xticks(_JND_FREQS)
        ax2.set_xticklabels(_JND_FREQS.astype(int))
        ax2.grid(True, which="both")

        fig.tight_layout()
        plt.show()


# ---------------------------------------------------------------------------
# Module helpers
# ---------------------------------------------------------------------------

@lru_cache(maxsize=8)
def _band_sos(sampling_rate: int) -> tuple[np.ndarray, ...]:
    """Second-order sections of the 21 band-pass filters at this sample rate (designed once, then reused)."""
    nyq = sampling_rate / 2.0
    out = []
    for fc in CENTRE_FREQUENCIES:
        wn = np.array([fc / _BAND_FACTOR, fc * _BAND_FACTOR]) / nyq
        out.append(sp.butter(_FILTER_ORDER, wn, btype="bandpass", output="sos"))   # scipy needs them writable; filtering does not change them
    return tuple(out)


def _weighting_curve() -> tuple[np.ndarray, np.ndarray]:
    """The JND-based weighting on its 1981-point frequency axis: ``(freq_axis [Hz], weighting [dB-like])``."""
    freq_axis = np.linspace(100.0, 10_080.0, 1981)
    jnd_interp = np.interp(freq_axis, _JND_FREQS, _JND_VALUES)
    inv = -jnd_interp
    return freq_axis, 3000.0 * np.log10((10.0 + inv) / np.max(10.0 + inv))
