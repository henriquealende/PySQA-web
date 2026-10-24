"""
IMPULSIVE PROMINENCE METRIC (MPI / IPM)
========================================
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
   is added to the per-band prominence values to yield the final MPI
   spectrum.

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

#: Weighting-function frequency support and JND values.
_JND_FREQS: np.ndarray = np.array([250, 500, 1000, 2000, 3000, 4000, 8000], dtype=float)
_JND_VALUES: np.ndarray = np.array([0.0276, 0.0139, 0.0093, 0.0072, 0.0053, 0.0072, 0.0159])

#: Sparse indices into the 1 Hz-resolution weighting array (100-10080 Hz)
#: that align with the centre frequencies used in the analysis.
_WEIGHTING_INDICES: np.ndarray = np.array([
    0, 6, 13, 21, 31, 44, 61, 81, 107, 141, 181, 231,
    301, 381, 481, 611, 781, 981, 1241, 1581, 1980,
])


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class IPM:
    """
    Impulsiveness / Modulation Prominence Index (MPI) calculator.

    Usage
    -----
    >>> ipm = IPM()
    >>> bark, mpi = ipm.calculateMPI(signal, fs)
    """

    # ------------------------------------------------------------------ API

    def calculateMPI(
        self,
        time_data: np.ndarray,
        sampling_rate: int,
    ) -> tuple[np.ndarray, np.ndarray]:
        """
        Compute the MPI spectrum for *time_data*.

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
        mpi  : ndarray, shape (21,)
            MPI value [dB-like] per one-third-octave band.
        """
        time_data = np.asarray(time_data, dtype=float)

        if time_data.size == 0:
            return BARK_SCALE.copy(), np.zeros(len(CENTRE_FREQUENCIES))

        band_signals = self._bandpass_filter(time_data, sampling_rate)
        prominence   = self._compute_prominence(band_signals, sampling_rate)
        weighting    = self._frequency_weighting()

        mpi = prominence + weighting
        return BARK_SCALE.copy(), mpi

    # -------------------------------------------------------- private helpers

    @staticmethod
    def _bandpass_filter(
        time_data: np.ndarray,
        sampling_rate: int,
    ) -> np.ndarray:
        """
        Filter *time_data* into one-third-octave band signals.

        Parameters
        ----------
        time_data : ndarray, shape (N,) or (N, channels)
        sampling_rate : int

        Returns
        -------
        band_signals : ndarray, shape (n_bands, N)
            Band-filtered mono signal (multi-channel uses first channel).
        """
        mono = time_data[:, 0] if time_data.ndim > 1 else time_data

        nyq  = sampling_rate / 2.0
        f_lo = CENTRE_FREQUENCIES / _BAND_FACTOR
        f_hi = CENTRE_FREQUENCIES * _BAND_FACTOR

        n_bands   = len(CENTRE_FREQUENCIES)
        n_samples = len(mono)
        band_signals = np.empty((n_bands, n_samples))

        for k in range(n_bands):
            wn  = np.array([f_lo[k], f_hi[k]]) / nyq
            sos = sp.butter(_FILTER_ORDER, wn, btype="bandpass", output="sos")
            band_signals[k] = sp.sosfiltfilt(sos, mono)

        return band_signals

    @staticmethod
    def _compute_prominence(
        band_signals: np.ndarray,
        sampling_rate: int,
    ) -> np.ndarray:
        """
        Compute the impulsiveness prominence P for each frequency band.

        Parameters
        ----------
        band_signals : ndarray, shape (n_bands, N)
        sampling_rate : int

        Returns
        -------
        prominence : ndarray, shape (n_bands,)
            Per-band prominence value P [dB-like].
        """
        n_bands    = band_signals.shape[0]
        half_win   = int(_EVENT_DURATION_S * sampling_rate) // 2
        prominence = np.zeros(n_bands)

        for k in range(n_bands):
            band = band_signals[k]

            # 1. Peak detection
            min_prom = _MIN_PROMINENCE_FACTOR * np.std(band)
            peaks, _ = sp.find_peaks(band, prominence=min_prom)

            if peaks.size == 0:
                continue

            # 2. Analysis window centred on the highest peak
            peak_idx = peaks[int(np.argmax(band[peaks]))]
            i_start  = max(0, peak_idx - half_win)
            i_end    = min(len(band), peak_idx + half_win)
            window   = band[i_start:i_end]

            if window.size == 0:
                continue

            # 3. Convert to dB SPL (ref. 20 uPa)
            with np.errstate(divide="ignore"):
                spl = 20.0 * np.log10(np.abs(window) / _P_REF)
            spl = np.where(np.isneginf(spl), 0.0, spl)

            l_max  = float(spl.max())
            l_mean = float(spl.mean())
            delta  = l_max - l_mean

            if delta <= 0.0:
                continue

            # 4. Prominence: P = 3*log10(OR) + 2*log10(LDI)
            onset_rate = delta / (15.0 * _EVENT_DURATION_S)
            p_value    = 3.0 * np.log10(onset_rate) + 2.0 * np.log10(delta)

            if np.isfinite(p_value):
                prominence[k] = p_value

        return prominence

    @staticmethod
    def _frequency_weighting() -> np.ndarray:
        """
        Evaluate the JND-based psychoacoustic weighting at each centre
        frequency and return the 21-element weighting vector [dB-like].

        Returns
        -------
        weighting : ndarray, shape (21,)
        """
        freq_axis  = np.linspace(100.0, 10_080.0, 1981)
        jnd_interp = np.interp(freq_axis, _JND_FREQS, _JND_VALUES)

        inv = -jnd_interp
        weighting_curve = 3000.0 * np.log10((10.0 + inv) / np.max(10.0 + inv))

        return weighting_curve[_WEIGHTING_INDICES]

    def plot_weighting(self) -> None:  # pragma: no cover
        """
        Display the JND interpolation and the derived weighting curve.

        Requires *matplotlib*.  Intended for diagnostic use only.
        """
        import matplotlib.pyplot as plt

        freq_axis  = np.linspace(100.0, 10_080.0, 1981)
        jnd_interp = np.interp(freq_axis, _JND_FREQS, _JND_VALUES)
        inv        = -jnd_interp
        weighting_curve = 3000.0 * np.log10((10.0 + inv) / np.max(10.0 + inv))

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
