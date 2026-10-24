"""
IMPULSIVE PROMINENCE METRIC (IPM, in the thesis MPI: "Modelo de Proeminência do Impulso")
==========================================================================================
How much an impulsive event stands out, band by band, on the critical-band (Bark_HMS) scale.

Original work of Henrique Alende da Silveira, developed in the doctoral thesis "Qualidade sonora aplicada na análise de sinais
impulsivos de refrigeradores" (UFSC, 2024) and in the articles listed under References.
Copyright (C) Henrique Alende da Silveira. Part of PySQA Web, licensed under the GNU Affero General Public License v3.0 (see LICENSE).

This is the rewrite of October 2026 that follows the method described in the thesis (Chapter 6, Figure 62); the previous version
is kept in ``mpi_legacy.py``. The steps are:

1. **Filtering.** The signal (resampled to 48 kHz) goes through the 53 auditory filters of ECMA-418-2 (z = 0.5 ... 26.5 Bark_HMS,
   50 % overlap). The envelope of each band is the magnitude of the complex filter output.
2. **Level history.** The envelope power is averaged in blocks of 10 ms and converted to dB: the level history L(t) of the band
   (NT ACOU 112 works on the level history of the signal; 10 ms is also the resolution of its Table 1 in the thesis).
3. **Event.** In each band the highest level is the impulse. Its onset is read from the level history: the level difference
   ``LDI`` between the peak and the level before the onset, and the onset rate ``OR = LDI / rise time`` in dB/s, where the rise time
   is the 10 % to 90 % time of the rise divided by 0.8 (the duration of a linear rise). A peak counts only if it stands out of the
   band's own variations by ``_Z_MIN`` robust standard deviations (a band of steady noise has no event).
4. **Prominence.** ``P = 3*log10(OR/[dB/s]) + 2*log10(LDI/[dB]) - 6`` (Equation 2 of the thesis, NT ACOU 112, with the 6 dB offset
   of its Tables 23 and 30). A band without event has ``P = 0``.
5. **Weighting.** The impulse weighting derived from the JND curve (thesis, Section 6.1.1.3, Table 24) is added: ``MPI = P + w(f)``.
   A value above 5 dB in some band marks the signal as impulsive (Section 7.1.5 of the thesis).

What the thesis does not specify (and what this version decided)
-----------------------------------------------------------------
* The global value of Table 41 has no formula in the thesis; ``IPMResult.global_db`` keeps the energy sum of the previous
  version and is **provisional**.
* How OR and LDI are read from the level history: here, the 10-90 % rise time and the 10th percentile of the 250 ms before the peak.
* How a steady band is told from an impulsive one: the robust z-score above; the previous version took the global maximum of
  every band, which flagged stationary noise more often the longer the record.
* The start of the file, where the filters still settle, is skipped when looking for the onset.

The filter bank is filtered in chunks and the 53 band signals are never held at once.

References
----------
da Silveira, H. A., Vergara, E. F., Lenzi, A., & Santos, G. B. (2024). Psychoacoustic model for
detecting the sensation of impulsivity in acoustic signals from refrigerators.
Applied Acoustics, 225, 110198.

da Silveira, H. A., Brum, R., Doi, R. M., Vergara, E. F., & Lenzi, A. (2026). Discomfort
prediction model for impulsive noise in household refrigerator.
Applied Acoustics, 242, 111068.

NORDTEST (2002). NT ACOU 112: Acoustics: Prominence of impulsive sounds and for adjustment of L_Aeq.
ECMA-418-2 (2025). Psychoacoustic metrics for ITT equipment, Part 2.
"""

from __future__ import annotations

from dataclasses import dataclass
from math import gcd

import numpy as np
from scipy import signal as sp

from psychoacoustics.ecma_fast.auditory_filterbank import (BANDWIDTHS, CENTRE_FREQS, FS as _FS, N_BANDS, Z,
                                                           filter_coefficients)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

#: Critical-band rate of the 53 bands [Bark_HMS] and their centre frequencies [Hz].
BARK_HMS: np.ndarray = Z
CENTRE_FREQUENCIES: np.ndarray = CENTRE_FREQS

#: Level-history step [s]: the envelope power is averaged in blocks of this length.
_HOP_S: float = 0.010
#: How far before the peak the onset is looked for [s].
_ONSET_SEARCH_S: float = 0.250
#: Shortest signal accepted [s]: the level history needs context around the event.
_MIN_SECONDS: float = 0.5
#: Lowest source sample rate accepted [Hz] (bands above the source Nyquist frequency are left out).
_MIN_SAMPLE_RATE: int = 16000
#: A peak is an event when it is this many robust standard deviations above the median level of its band.
_Z_MIN: float = 6.0
#: Floor of the robust standard deviation [dB], so that a perfectly steady band does not turn tiny wobbles into events.
_MAD_FLOOR_DB: float = 0.5
#: Levels are not allowed to go lower than this below the maximum of the band [dB] (digital silence).
_DYNAMIC_RANGE_DB: float = 120.0
#: Offset of Tables 23 and 30 of the thesis, relative to Equation 2 [dB].
_P_OFFSET_DB: float = -6.0
#: A signal is impulsive when some band has MPI above this value [dB] (thesis, Section 7.1.5; NT ACOU 112).
THRESHOLD_DB: float = 5.0
#: Skip the filter settling at the start of the file: at least this long [s] and 6 / bandwidth.
_GUARD_MIN_S: float = 0.05
#: Samples filtered at a time (a multiple of the block length): limits the memory.
_CHUNK_BLOCKS: int = 200

#: Weighting-function frequency support and JND values (thesis, Figure 61).
_JND_FREQS: np.ndarray = np.array([250, 500, 1000, 2000, 3000, 4000, 8000], dtype=float)
_JND_VALUES: np.ndarray = np.array([0.0276, 0.0139, 0.0093, 0.0072, 0.0053, 0.0072, 0.0159])


class IPMInputError(ValueError):
    """The signal cannot be analysed. ``reason`` is ``too_short``, ``sample_rate`` or ``not_finite``;
    ``info`` carries the numbers a message needs (the server turns them into a translated text)."""

    def __init__(self, reason: str, **info) -> None:
        self.reason = reason
        self.info = info
        super().__init__({
            "too_short": "The signal is too short for the IPM: it needs at least {min_s:.1f} s (got {seconds:.2f} s).",
            "sample_rate": "The IPM needs a sample rate of at least {min_hz} Hz; got {fs} Hz.",
            "not_finite": "The signal has {count} invalid values (NaN or infinity); the IPM cannot be computed.",
        }[reason].format(**info))


@dataclass
class IPMResult:
    """Everything the analysis found. Arrays have one value per band analysed (53 at 44.1 kHz and above)."""

    z: np.ndarray            #: critical-band rate of each band [Bark_HMS]
    freqs: np.ndarray        #: centre frequency [Hz]
    mpi: np.ndarray          #: P + weighting [dB]; a band without event gives the weighting alone
    p: np.ndarray            #: prominence P [dB], 0 when the band has no event
    ldi: np.ndarray          #: level difference of the onset [dB], NaN when no event
    onset_rate: np.ndarray   #: onset rate [dB/s], NaN when no event
    event_time: np.ndarray   #: time of the peak [s], NaN when no event
    detected: np.ndarray     #: True where the band has an event

    @property
    def impulsive(self) -> bool:
        """True when some band has MPI above 5 dB (the criterion of the thesis)."""
        return bool(np.any(self.mpi > THRESHOLD_DB))

    @property
    def bands_over_threshold(self) -> int:
        return int(np.count_nonzero(self.mpi > THRESHOLD_DB))

    @property
    def strongest_event_time(self) -> float:
        """Time of the peak of the band with the highest P [s]; NaN when there is no event at all."""
        if not self.detected.any():
            return float("nan")
        return float(self.event_time[int(np.argmax(np.where(self.detected, self.p, -np.inf)))])

    @property
    def global_db(self) -> float:
        """Energy sum of the bands, in dB. PROVISIONAL: the thesis does not give the formula of its global value."""
        return float(10.0 * np.log10(np.sum(10.0 ** (self.mpi / 10.0))))


# ---------------------------------------------------------------------------
# Public class
# ---------------------------------------------------------------------------

class IPM:
    """
    Impulsive Prominence Metric (IPM) calculator.

    Usage
    -----
    >>> result = IPM().analyze(signal, fs)
    >>> result.mpi, result.impulsive, result.strongest_event_time

    ``calculateMPI`` keeps the name and the return of the old interface: ``(bark, mpi)``.
    """

    def analyze(self, time_data: np.ndarray, sampling_rate: int) -> IPMResult:
        """
        Analyse *time_data* (any level: only level differences matter) and return the full result.

        Parameters
        ----------
        time_data : ndarray, shape (N,) or (N, channels)
            Input signal; multi-channel arrays use the first channel.
        sampling_rate : int
            Sample rate in Hz (at least 16 kHz); the signal is resampled to the 48 kHz of the ECMA filter bank.

        Raises
        ------
        IPMInputError
            Too short (under 0.5 s), sample rate under 16 kHz, or NaN / infinity in the signal.
        """
        x = np.asarray(time_data, dtype=float)
        mono = x[:, 0] if x.ndim > 1 else x
        self._validate(mono, sampling_rate)

        x48 = self._to_48k(mono, sampling_rate)
        hop = int(round(_HOP_S * _FS))
        nyquist = sampling_rate / 2.0

        keep = [k for k in range(N_BANDS) if CENTRE_FREQS[k] + BANDWIDTHS[k] / 2 <= 0.95 * nyquist]   # bands above the source Nyquist frequency are noise
        p = np.zeros(len(keep))
        ldi = np.full(len(keep), np.nan)
        orate = np.full(len(keep), np.nan)
        t_peak = np.full(len(keep), np.nan)
        for i, band in enumerate(keep):
            levels = self._band_levels(x48, band, hop)
            guard = int(np.ceil(max(_GUARD_MIN_S, 6.0 / BANDWIDTHS[band]) / _HOP_S))
            event = measure_event(levels, guard)
            if event is not None:
                p[i], ldi[i], orate[i], t_peak[i] = event["p"], event["ldi"], event["onset_rate"], event["t_peak"]

        freqs = CENTRE_FREQS[keep]
        return IPMResult(z=Z[keep], freqs=freqs, mpi=p + self.weighting(freqs), p=p, ldi=ldi, onset_rate=orate,
                         event_time=t_peak, detected=~np.isnan(ldi))

    def calculateMPI(self, time_data: np.ndarray, sampling_rate: int) -> tuple[np.ndarray, np.ndarray]:
        """The old interface: ``(bark, mpi)`` with one value per band (53 at 44.1 kHz and above). An empty signal gives zeros."""
        if np.size(time_data) == 0:
            return Z.copy(), np.zeros(N_BANDS)
        result = self.analyze(time_data, sampling_rate)
        return result.z, result.mpi

    # -------------------------------------------------------- helpers

    @staticmethod
    def weighting(freqs: np.ndarray) -> np.ndarray:
        """Impulse weighting [dB] at the given frequencies: the JND curve inverted and put on a log scale, 0 dB at 3 kHz
        (thesis, Section 6.1.1.3); constant below 250 Hz and above 8 kHz, where the sensitivity was not measured."""
        jnd = np.interp(np.asarray(freqs, float), _JND_FREQS, _JND_VALUES)
        return 3000.0 * np.log10((10.0 - jnd) / (10.0 - _JND_VALUES.min()))

    @staticmethod
    def _validate(mono: np.ndarray, sampling_rate: int) -> None:
        if sampling_rate < _MIN_SAMPLE_RATE:
            raise IPMInputError("sample_rate", fs=sampling_rate, min_hz=_MIN_SAMPLE_RATE)
        if len(mono) < _MIN_SECONDS * sampling_rate:
            raise IPMInputError("too_short", min_s=_MIN_SECONDS, seconds=len(mono) / sampling_rate)
        bad = int(np.size(mono) - np.count_nonzero(np.isfinite(mono)))
        if bad:
            raise IPMInputError("not_finite", count=bad)

    @staticmethod
    def _to_48k(mono: np.ndarray, sampling_rate: int) -> np.ndarray:
        """The ECMA-418-2 filter bank is defined at 48 kHz."""
        if int(sampling_rate) == int(_FS):
            return mono
        g = gcd(int(_FS), int(sampling_rate))
        return sp.resample_poly(mono, int(_FS) // g, int(sampling_rate) // g)

    @staticmethod
    def _band_levels(x48: np.ndarray, band: int, hop: int) -> np.ndarray:
        """Level history [dB, arbitrary reference] of one band: envelope power in blocks of 10 ms, filtered in chunks."""
        b, a = filter_coefficients(band)
        zi = np.zeros(max(len(a), len(b)) - 1, dtype=complex)
        n_blocks = len(x48) // hop
        energy = np.empty(n_blocks)
        step = _CHUNK_BLOCKS * hop
        for c0 in range(0, n_blocks * hop, step):
            chunk = x48[c0:min(c0 + step, n_blocks * hop)]
            y, zi = sp.lfilter(b, a, chunk, zi=zi)
            power = y.real ** 2 + y.imag ** 2
            energy[c0 // hop:c0 // hop + len(chunk) // hop] = power.reshape(-1, hop).mean(axis=1)
        return 10.0 * np.log10(np.maximum(energy, 1e-30))


# ---------------------------------------------------------------------------
# Event measurement (works on one level history, so it can be tested alone)
# ---------------------------------------------------------------------------

def measure_event(level_db: np.ndarray, guard_blocks: int = 0, hop_s: float = _HOP_S):
    """
    Find the impulse in a level history and measure its onset.

    Parameters
    ----------
    level_db : 1-D array
        Level of one band, one value per block of ``hop_s`` seconds.
    guard_blocks : int
        Blocks at the start where the filter has not settled: the onset may not start there.
    hop_s : float
        Block length [s].

    Returns
    -------
    dict with ``p``, ``ldi``, ``onset_rate``, ``t_peak``, ``t_start``, ``z`` or ``None`` when the band has no event.
    """
    level = np.asarray(level_db, dtype=float)
    n = len(level)
    if n < guard_blocks + 4:
        return None
    level = np.maximum(level, level.max() - _DYNAMIC_RANGE_DB)

    median = np.median(level)
    spread = max(1.4826 * np.median(np.abs(level - median)), _MAD_FLOOR_DB)

    first = guard_blocks + 1
    peak = first + int(np.argmax(level[first:]))
    z_score = (level[peak] - median) / spread
    if z_score < _Z_MIN:
        return None

    lo = max(guard_blocks, peak - int(round(_ONSET_SEARCH_S / hop_s)))
    before = level[lo:peak]
    if before.size == 0:
        return None
    start_level = float(np.percentile(before, 10))          # the level before the onset, robust to the wobble of a noisy background
    ldi = float(level[peak] - start_level)
    if ldi <= 0:
        return None

    lo10, hi90 = start_level + 0.1 * ldi, start_level + 0.9 * ldi
    # 10 % crossing: the last block at or under it before the peak, then the first block at or over 90 %
    below = np.nonzero(level[lo:peak + 1] <= lo10)[0]
    i10 = lo + int(below[-1]) if below.size else lo
    above = np.nonzero(level[i10:peak + 1] >= hi90)[0]
    i90 = i10 + int(above[0]) if above.size else peak

    def crossing(i: int, target: float) -> float:
        """Time [blocks] at which the history crosses ``target`` between block i and i + 1 (linear interpolation)."""
        if i + 1 > peak or level[i + 1] == level[i]:
            return float(i)
        return i + float(np.clip((target - level[i]) / (level[i + 1] - level[i]), 0.0, 1.0))

    t10 = crossing(i10, lo10)
    t90 = crossing(i90 - 1, hi90) if i90 > i10 else float(i90)
    rise = max((t90 - t10) * hop_s / 0.8, hop_s)               # duration of a linear rise from 0 to 100 %
    onset_rate = ldi / rise
    p = 3.0 * np.log10(onset_rate) + 2.0 * np.log10(ldi) + _P_OFFSET_DB
    return {"p": float(p), "ldi": ldi, "onset_rate": float(onset_rate), "t_peak": (peak + 0.5) * hop_s,
            "t_start": (t10 + 0.5) * hop_s, "z": float(z_score)}
