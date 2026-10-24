"""Headphone block: a measured frequency response (a CSV the user brings) turned into a minimum-phase FIR filter.

Two uses:
- compensate: the filter is the inverse of the headphone, so the headphone sounds flat (the listener hears the stimulus
  as prepared). The correction is limited (maximum boost) and fades out at the ends of the audio band, so deep dips
  and the extremes are not chased.
- simulate: the filter is the headphone itself, to hear (or analyse) a sound as that headphone would reproduce it.

Only magnitude is used (measurements of the phase are rare and unreliable); minimum phase is the natural phase of a
transducer response and adds no pre-ringing.
"""
from __future__ import annotations

import io
import re
from dataclasses import dataclass
from typing import Tuple

import numpy as np
from scipy.ndimage import uniform_filter1d

from utils.lang import msg

MAX_ROWS = 20000
NORM_BAND_HZ = (200.0, 4000.0)         # the level of the filter is set to 0 dB on average in this band
FADE_LOW_HZ = (20.0, 60.0)             # correction fades in between these frequencies
SMOOTH_OCT = 1.0 / 6.0


class HeadphoneError(ValueError):
    """The file is not a usable headphone response (HTTP 400)."""


@dataclass
class HeadphoneSet:
    name: str
    freq: np.ndarray            # (n,) Hz, increasing
    db: np.ndarray              # (n,) dB
    builtin: bool = False

    @property
    def n_points(self) -> int:
        return int(len(self.freq))


def read_headphone_csv(data: bytes, name: str) -> HeadphoneSet:
    """Frequency in Hz and level in dB. Accepts a header, comma, semicolon or tab separators and a decimal comma.

    With a header, the column named raw (AutoEq measurement files) is used, else smoothed, else the second column.
    """
    try:
        text = data.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = data.decode("latin-1")
    lines = [ln.strip() for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith(("#", "//"))]
    if len(lines) < 8:
        raise HeadphoneError(msg(f"{name} tem poucas linhas para ser uma resposta de fone.", f"{name} has too few lines to be a headphone response."))
    if len(lines) > MAX_ROWS:
        raise HeadphoneError(msg(f"{name} tem linhas demais (máximo {MAX_ROWS}).", f"{name} has too many rows (maximum {MAX_ROWS})."))

    probe = lines[min(1, len(lines) - 1)]
    # a semicolon means the decimal mark may be a comma; with no separator at all, columns are split on blanks
    sep = ";" if ";" in probe else ("\t" if "\t" in probe else ("," if "," in probe else None))
    def cells(line: str):
        parts = [c.strip() for c in line.split(sep)]
        if sep == ";":
            parts = [c.replace(",", ".") for c in parts]
        return parts

    col = 1
    first = cells(lines[0])
    start = 0
    if not _is_number(first[0]):
        header = [h.lower() for h in first]
        start = 1
        for wanted in ("raw", "smoothed"):
            if wanted in header:
                col = header.index(wanted)
                break
    f, d = [], []
    for ln in lines[start:]:
        c = cells(ln)
        if len(c) <= col or not (_is_number(c[0]) and _is_number(c[col])):
            continue
        f.append(float(c[0]))
        d.append(float(c[col]))
    if len(f) < 8:
        raise HeadphoneError(msg(f"{name}: não achei colunas de frequência (Hz) e nível (dB).", f"{name}: I could not find frequency (Hz) and level (dB) columns."))
    f, d = np.asarray(f), np.asarray(d)
    order = np.argsort(f)
    f, d = f[order], d[order]
    keep = np.concatenate([[True], np.diff(f) > 0]) & (f > 0)
    f, d = f[keep], d[keep]
    if len(f) < 8 or f[0] > 200 or f[-1] < 8000:
        raise HeadphoneError(msg(f"{name} precisa cobrir ao menos de 200 Hz a 8 kHz.", f"{name} must cover at least 200 Hz to 8 kHz."))
    if not np.all(np.isfinite(d)) or np.ptp(d) > 120:
        raise HeadphoneError(msg(f"{name}: os níveis não parecem estar em dB.", f"{name}: the levels do not look like dB."))
    return HeadphoneSet(name=name, freq=f, db=d)


def _is_number(s: str) -> bool:
    return bool(re.fullmatch(r"[-+]?\d*\.?\d+([eE][-+]?\d+)?", s))


def _on_grid(hp: HeadphoneSet, freq: np.ndarray) -> np.ndarray:
    """The response on `freq`, interpolated against log frequency and held flat outside the measured range."""
    return np.interp(np.log10(np.maximum(freq, 1e-3)), np.log10(hp.freq), hp.db)


def _smooth_log(freq: np.ndarray, db: np.ndarray, octaves: float) -> np.ndarray:
    """Moving average over a fraction of an octave (the grid must be log-spaced)."""
    steps_per_oct = len(freq) / np.log2(freq[-1] / freq[0])
    width = max(int(round(steps_per_oct * octaves)), 1)
    return uniform_filter1d(db, size=width, mode="nearest")


def correction_db(hp: HeadphoneSet, fs: float, mode: str, max_boost_db: float, points: int = 600) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """(frequency grid, measured response smoothed and levelled, correction in dB) on a log grid from 20 Hz to 0.45 fs."""
    top = min(20000.0, 0.45 * fs)
    freq = np.geomspace(20.0, top, points)
    measured = _smooth_log(freq, _on_grid(hp, freq), SMOOTH_OCT)
    band = (freq >= NORM_BAND_HZ[0]) & (freq <= NORM_BAND_HZ[1])
    measured = measured - float(np.mean(measured[band]))             # the level of the headphone is not part of the correction
    if mode == "compensate":
        corr = np.minimum(-measured, max_boost_db)                    # boost limited; cuts are free
    elif mode == "simulate":
        corr = measured
    else:
        raise HeadphoneError(msg("Modo de fone desconhecido.", "Unknown headphone mode."))
    # fade the correction out at the ends of the audio band
    lo = np.clip((np.log10(freq) - np.log10(FADE_LOW_HZ[0])) / (np.log10(FADE_LOW_HZ[1]) - np.log10(FADE_LOW_HZ[0])), 0.0, 1.0)
    hi = np.clip((np.log10(top) - np.log10(freq)) / (np.log10(top) - np.log10(0.8 * top)), 0.0, 1.0)
    corr = corr * lo * hi
    return freq, measured, corr


def min_phase_fir(freq: np.ndarray, gain_db: np.ndarray, fs: float, taps: int = 2048, nfft: int = 32768) -> np.ndarray:
    """Minimum-phase FIR with the magnitude `gain_db` given on `freq` (homomorphic method: fold the real cepstrum)."""
    bins = np.fft.rfftfreq(nfft, 1.0 / fs)
    mag_db = np.interp(np.log10(np.maximum(bins, freq[0])), np.log10(freq), gain_db)   # flat outside the grid
    log_mag = mag_db / 20.0 * np.log(10.0)
    cep = np.fft.irfft(log_mag, nfft)
    fold = np.zeros(nfft)
    fold[0] = cep[0]
    fold[1:nfft // 2] = 2.0 * cep[1:nfft // 2]
    fold[nfft // 2] = cep[nfft // 2]
    h = np.fft.irfft(np.exp(np.fft.rfft(fold)), nfft)[:taps]
    fade = max(taps // 8, 8)                                         # ease the end of the response to zero
    h[-fade:] *= 0.5 * (1 + np.cos(np.linspace(0, np.pi, fade)))
    return h


def design(hp: HeadphoneSet, fs: float, mode: str, max_boost_db: float = 12.0, taps: int = 2048) -> np.ndarray:
    freq, _, corr = correction_db(hp, fs, mode, max_boost_db)
    return min_phase_fir(freq, corr, fs, taps)


def response_db(h: np.ndarray, fs: float, freq: np.ndarray) -> np.ndarray:
    """Magnitude of an FIR on `freq`, in dB."""
    nfft = 1 << int(np.ceil(np.log2(max(len(h), 8) * 8)))
    spec = np.abs(np.fft.rfft(h, nfft))
    bins = np.fft.rfftfreq(nfft, 1.0 / fs)
    return 20 * np.log10(np.maximum(np.interp(freq, bins, spec), 1e-9))
