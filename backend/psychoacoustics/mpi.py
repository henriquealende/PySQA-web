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
3. **Event.** Several candidate peaks of the level history are examined in each band (the six highest, at least 0.1 s apart) and the
   one with the highest prominence is kept. For each candidate the **stationary part** of the band is estimated first: the median
   of the level history in the 3 s around the peak, leaving out the event itself (from 0.25 s before to 1 s after the peak).
   The level difference ``LDI`` is the peak minus that stationary level, and the onset rate ``OR = LDI / rise time`` in dB/s, where the
   rise time is the 10 % to 90 % time of the rise (measured from the stationary level) divided by 0.8. A candidate is an event only
   when it passes these criteria:
   * it stands ``_Z_MIN`` robust standard deviations (of the stationary part itself) above the stationary level, and LDI is at least 3 dB;
   * it **decays**: within 1 s after the peak the level falls by at least 30 % of LDI (and 3 dB). A rise that stays up (a machine switched
     on, a tone that starts) is a step, not an impulse. When the record ends less than 0.2 s after the peak this cannot be checked and
     the event is marked as not reliable;
   * it **starts from the stationary level**: within 0.5 s before the peak the level must have been back near it (a bump on the shoulder of
     a longer sound is not an impulse);
   * **the bands agree**: the peak times of the bands that have an event must be within 0.15 s of their median, otherwise the band is
     treated as having no event (a lone band that peaked somewhere else is noise, not part of the impulse).
   Each event also carries a ``reliable`` flag (stationary part found around it, decay checked, 10 or more deviations above it).
4. **Prominence.** ``P = 3*log10(OR/[dB/s]) + 2*log10(LDI/[dB]) - 6`` (Equation 2 of the thesis, NT ACOU 112, with the 6 dB offset
   of its Tables 23 and 30). A band without event has ``P = 0``.
5. **Weighting.** The impulse weighting derived from the JND curve (thesis, Section 6.1.1.3, Table 24) is added: ``MPI = P + w(f)``.
   A value above 5 dB in some band marks the signal as impulsive (Section 7.1.5 of the thesis).

What the thesis does not specify (and what this version decided)
-----------------------------------------------------------------
* The global value of Table 41 has no formula in the thesis. ``IPMResult.global_db`` is a proposal of this version: the bands
  that have an event and an MPI above 0 add up like amplitudes, 20*log10(sum of 10^(MPI/20)), and a signal without such a band gives 0 dB. The amplitude
  sum is the only form that reproduces a number printed in the thesis (32.5 dB for Figure 68, from the plotted values); counting
  only the bands with an event keeps the quiet bands from adding a level of their own. It grows with how much of the spectrum
  the impulse takes (one band with MPI 8 dB gives 8 dB, all 53 bands give about 42 dB). The scale is NOT the one of Table 41.
* How OR and LDI are read from the level history: here, the 10-90 % rise time and the stationary level (median of the surroundings of the event).
* How an impulse is told from steady noise, from a step and from a stray peak: the criteria of step 3 (the previous version took the
  global maximum of every band, which flagged stationary noise more often the longer the record).
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
from scipy.ndimage import median_filter

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
_ONSET_SEARCH_S: float = 0.500
#: Shortest signal accepted [s]: the level history needs context around the event.
_MIN_SECONDS: float = 0.5
#: Lowest source sample rate accepted [Hz] (bands above the source Nyquist frequency are left out).
_MIN_SAMPLE_RATE: int = 16000
#: A peak is an event when it is this many robust standard deviations (of the stationary part) above the stationary level.
_Z_MIN: float = 6.0
#: ... and its LDI is at least this many dB.
_LDI_MIN_DB: float = 3.0
#: The stationary level is the median of the level history within this span around the peak [s], without the event zone:
#: from _BG_BEFORE_S before to _BG_AFTER_S after the peak.
_BG_SPAN_S: float = 3.0
_BG_BEFORE_S: float = 0.25
_BG_AFTER_S: float = 1.0
#: Fewest blocks of stationary part that count as context (0.3 s); with less the older reading of the level before the onset is used.
_BG_MIN_BLOCKS: int = 30
#: An impulse decays: within _DECAY_WINDOW_S after the peak the level falls by at least max(3 dB, _DECAY_FRACTION * LDI).
_DECAY_WINDOW_S: float = 1.0
_DECAY_FRACTION: float = 0.3
_DECAY_MIN_DB: float = 3.0
#: Fewest blocks after the peak needed to judge the decay (0.2 s).
_DECAY_MIN_BLOCKS: int = 20
#: Candidate peaks examined per band, and their minimum spacing [s].
_CANDIDATES: int = 6
_CANDIDATE_GAP_S: float = 0.100
#: Peak times of the bands with an event must be within this of their median [s].
_COHERENCE_TOL_S: float = 0.150
#: An event is reliable when it stands out of the stationary part by at least this many deviations.
_Z_RELIABLE: float = 10.0
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
    reliable: np.ndarray | None = None   #: True where the event also passed the reliability checks

    @property
    def impulsive(self) -> bool:
        """True when some band has MPI above 5 dB (the criterion of the thesis)."""
        return bool(np.any(self.mpi > THRESHOLD_DB))

    @property
    def reliable_bands(self) -> int:
        """Bands whose event passed the reliability checks."""
        return 0 if self.reliable is None else int(np.count_nonzero(self.reliable & self.detected))

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
        """Global impulsive prominence [dB]: the bands with an event and MPI above 0 add up as amplitudes, 20*log10(sum 10^(MPI/20)); 0 when none.
        A proposal of this version (the thesis gives no formula for its global value); see the module notes."""
        used = self.detected & (self.mpi > 0)
        if not used.any():
            return 0.0
        return float(20.0 * np.log10(np.sum(10.0 ** (self.mpi[used] / 20.0))))

    @property
    def energy_sum_db(self) -> float:
        """Energy sum of all the bands (the global value of the previous version), kept for comparison."""
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
        reliable = np.zeros(len(keep), dtype=bool)
        for i, band in enumerate(keep):
            levels = self._band_levels(x48, band, hop)
            guard = int(np.ceil(max(_GUARD_MIN_S, 6.0 / BANDWIDTHS[band]) / _HOP_S))
            event = measure_event(levels, guard)
            if event is not None:
                p[i], ldi[i], orate[i], t_peak[i], reliable[i] = event["p"], event["ldi"], event["onset_rate"], event["t_peak"], event["reliable"]

        # the bands of one impulse peak together: a band that peaked elsewhere is not part of it
        found = ~np.isnan(ldi)
        if found.sum() > 1:
            stray = found & (np.abs(t_peak - np.median(t_peak[found])) > _COHERENCE_TOL_S)
            p[stray], ldi[stray], orate[stray], t_peak[stray], reliable[stray] = 0.0, np.nan, np.nan, np.nan, False

        freqs = CENTRE_FREQS[keep]
        return IPMResult(z=Z[keep], freqs=freqs, mpi=p + self.weighting(freqs), p=p, ldi=ldi, onset_rate=orate,
                         event_time=t_peak, detected=~np.isnan(ldi), reliable=reliable)

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
    Find the impulse in a level history and measure its onset, with the criteria described in the module notes.

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
    dict with ``p``, ``ldi``, ``onset_rate``, ``t_peak``, ``t_start``, ``z``, ``background``, ``decay_db``, ``reliable``, ``rise_limited``
    for the candidate with the highest prominence, or ``None`` when the band has no event.
    """
    level = np.asarray(level_db, dtype=float)
    n = len(level)
    if n < guard_blocks + 4:
        return None
    level = np.maximum(level, level.max() - _DYNAMIC_RANGE_DB)

    gap = max(int(round(_CANDIDATE_GAP_S / hop_s)), 1)
    first = guard_blocks + 1
    smooth = np.convolve(level, np.ones(3) / 3.0, mode="same")
    # candidates are ranked by how far they rise above the local level (median of 3 s), not by the raw level: a louder steady
    # section elsewhere in the record must not crowd the real event out
    excess = smooth - median_filter(smooth, size=2 * int(round(_BG_SPAN_S / hop_s / 2)) + 1, mode="nearest")
    best = None
    taken: list[int] = []
    for i in np.argsort(excess[first:])[::-1] + first:
        if len(taken) >= _CANDIDATES:
            break
        if any(abs(int(i) - j) <= gap for j in taken):
            continue
        lo, hi = max(first, int(i) - gap), min(n, int(i) + gap + 1)
        if level[i] < level[lo:hi].max() - 1e-9:          # not a local maximum
            continue
        taken.append(int(i))
        event = _evaluate_peak(level, int(i), guard_blocks, hop_s)
        if event is not None and (best is None or event["p"] > best["p"]):
            best = event
    return best


def _evaluate_peak(level: np.ndarray, peak: int, guard: int, hop_s: float):
    """The criteria of one candidate peak; None when it is not an impulse."""
    n = len(level)
    # 1. the stationary part: the surroundings of the event, without the event
    span = int(round(_BG_SPAN_S / hop_s))
    cut_lo, cut_hi = max(0, peak - int(round(_BG_BEFORE_S / hop_s))), min(n, peak + int(round(_BG_AFTER_S / hop_s)) + 1)
    lo, hi = max(guard, peak - span), min(n, peak + span + 1)
    surround = np.concatenate([level[lo:max(lo, cut_lo)], level[min(hi, cut_hi):hi]])
    context = len(surround) >= _BG_MIN_BLOCKS
    if context:
        background = float(np.median(surround))
        sigma = max(1.4826 * float(np.median(np.abs(surround - background))), _MAD_FLOOR_DB)
    else:                                                   # a very short record: the level just before the onset
        before = level[max(guard, peak - int(round(_ONSET_SEARCH_S / hop_s))):peak]
        if len(before) < 3:
            return None
        background = float(np.percentile(before, 10))
        sigma = max(1.4826 * float(np.median(np.abs(before - np.median(before)))), _MAD_FLOOR_DB)

    ldi = float(level[peak] - background)
    z_score = ldi / sigma
    if ldi < _LDI_MIN_DB or z_score < _Z_MIN:
        return None

    # 2. it decays (an impulse), it does not stay up (a step)
    after = level[peak + 1:peak + 1 + int(round(_DECAY_WINDOW_S / hop_s))]
    decay_checked = len(after) >= _DECAY_MIN_BLOCKS
    decay = float("nan")
    if decay_checked:
        decay = float(level[peak] - np.convolve(after, np.ones(3) / 3.0, mode="valid").min())
        if decay < max(_DECAY_MIN_DB, _DECAY_FRACTION * ldi):
            return None

    # 3. the onset, read from the stationary level up to the peak
    lo_on = max(guard, peak - int(round(_ONSET_SEARCH_S / hop_s)))
    lo10, hi90 = background + 0.1 * ldi, background + 0.9 * ldi
    below = np.nonzero(level[lo_on:peak + 1] <= lo10)[0]
    if not below.size:        # the level never came back near the stationary one before the peak: a bump on the shoulder of something else
        return None
    i10 = lo_on + int(below[-1])
    above = np.nonzero(level[i10:peak + 1] >= hi90)[0]
    i90 = i10 + int(above[0]) if above.size else peak

    def crossing(i: int, target: float) -> float:
        """Time [blocks] at which the history crosses ``target`` between block i and i + 1 (linear interpolation)."""
        if i + 1 > peak or level[i + 1] == level[i]:
            return float(i)
        return i + float(np.clip((target - level[i]) / (level[i + 1] - level[i]), 0.0, 1.0))

    t10 = crossing(i10, lo10)
    t90 = crossing(i90 - 1, hi90) if i90 > i10 else float(i90)
    rise_raw = (t90 - t10) * hop_s / 0.8                     # duration of a linear rise from 0 to 100 %
    rise = max(rise_raw, hop_s)
    onset_rate = ldi / rise
    p = 3.0 * np.log10(onset_rate) + 2.0 * np.log10(ldi) + _P_OFFSET_DB
    return {"p": float(p), "ldi": ldi, "onset_rate": float(onset_rate), "t_peak": (peak + 0.5) * hop_s,
            "t_start": (t10 + 0.5) * hop_s, "z": float(z_score), "background": background, "decay_db": decay,
            "reliable": bool(context and decay_checked and z_score >= _Z_RELIABLE), "rise_limited": bool(rise_raw <= hop_s)}
