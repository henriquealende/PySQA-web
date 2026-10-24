# -*- coding: utf-8 -*-
"""Tonality ECMA-418-2:2025 (Sottek Hearing Model): same maths as `sottek_hearing_model.shm_tonality_ecma`,
reorganised to need far less memory and time. Results must match the package (see dev-tests/bench_ecma.py).

Derived from sottek_hearing_model (https://github.com/acoustics-code-salford/sottek-hearing-model), itself based on
the RefMap code and on 'SottekTonality.m' by M. Torjussen.
Original copyright (C) Mike JB Lotinga, University of Salford (AGPL-3.0-only).
Modified in October 2026 by Henrique Alende da Silveira for PySQA Web. Copyright (C) 2026 Henrique Alende da Silveira and the PySQA Web contributors.
Licensed under the GNU Affero General Public License v3.0 (see LICENSE), WITHOUT ANY WARRANTY.

The standard's stages are unchanged; only the organisation of the computation differs:

  * the autocorrelation and the lag-window FFT run on slices of time blocks (columns are independent);
  * only the autocorrelation rows that the lag window can read are kept (the rest was discarded anyway);
  * real FFTs (scipy.fft) of just the length needed, on data laid out contiguously along the transform;
  * the tonal frequency is the first bin whose spectrum rounded to 8 decimals is maximal, found from the few
    candidates near the maximum instead of rounding the whole spectrum.
"""
import math
import multiprocessing
import os
from concurrent.futures import ThreadPoolExecutor

import bottleneck as bn
import numpy as np
import scipy.fft as sfft
from scipy.signal import lfilter
from scipy.special import comb
from sottek_hearing_model.shm_subs import (shm_basis_loudness, shm_in_check,
                                           shm_outmid_ear_filter, shm_pre_proc, shm_resample,
                                           shm_signal_segment)
from sottek_hearing_model.shm_tonality_ecma import shm_noise_red_lowpass

def _read(path):
    try:
        with open(path, "r", encoding="ascii") as fh:
            return fh.read().strip()
    except OSError:
        return None


def _cpu_quota():
    """CPUs the container may use (cgroup quota), or None when there is no quota."""
    raw = _read("/sys/fs/cgroup/cpu.max")                       # cgroup v2: "<quota> <period>" or "max <period>"
    if raw:
        parts = raw.split()
        if len(parts) == 2 and parts[0] != "max":
            return float(parts[0]) / float(parts[1])
        return None
    quota, period = _read("/sys/fs/cgroup/cpu/cpu.cfs_quota_us"), _read("/sys/fs/cgroup/cpu/cpu.cfs_period_us")
    if quota and period and float(quota) > 0:                   # cgroup v1: -1 means no quota
        return float(quota) / float(period)
    return None


def thread_count():
    """Worker threads: one per CPU the machine really gives us (leaving one free), PYSQA_ECMA_THREADS overrides.

    Every thread holds its own working arrays, so on a container with a CPU quota (a hosted server with 1 CPU)
    extra threads would only cost memory and gain no speed.
    """
    try:
        forced = int(os.environ.get("PYSQA_ECMA_THREADS", "0"))
    except ValueError:
        forced = 0
    if forced > 0:
        return forced
    n = max(1, multiprocessing.cpu_count() - 1)
    try:
        quota = _cpu_quota()
    except ValueError:
        quota = None
    return max(1, min(n, math.ceil(quota))) if quota else n


_NUM_THREADS = thread_count()
_EPS = 1e-12
_FS = 48e3
_SLICE_ELEMS = 1 << 19            # elements per working slice (~4 MB of float64)
_PAD = 8                          # fast mode: lag-window FFT length = _PAD x the window length
_FFT_COLS = 96                    # columns per lag-window FFT slice (16384 x 96 complex = 25 MB)

_DELTA_F0, _C = 81.9289, 0.1618
_HALF_BARK = np.arange(0.5, 27, 0.5)
_N_BANDS = len(_HALF_BARK)
_BAND_FREQS = (_DELTA_F0 / _C) * np.sinh(_C * _HALF_BARK)
_DFZ = np.sqrt(_DELTA_F0 ** 2 + (_C * _BAND_FREQS) ** 2)

_BLOCK = np.hstack((8192 * np.ones(3), 4096 * np.ones(13), 2048 * np.ones(9), 1024 * np.ones(28))).astype(int)
_MAX_BLOCK = int(_BLOCK.max())
_OVERLAP = 0.75
_HOP_MIN = int(((1 - _OVERLAP) * _BLOCK).astype(int).min())

# duplicated bands: the ACF of neighbouring bands is averaged (Section 6.2.3)
_BLOCK_DUPE = np.hstack((8192 * np.ones(5), 4096 * np.ones(17), 2048 * np.ones(11), 1024 * np.ones(28))).astype(int)
_SRC_COL = np.hstack((np.arange(0, 5), np.arange(1, 18), np.arange(15, 26), np.arange(25, 53)))
_FREQ_DUPE = _BAND_FREQS[_SRC_COL]
_AVG = np.vstack((np.hstack(([0, 0, 0], np.arange(5, 18), np.arange(22, 31), np.arange(33, 61))),
                  np.hstack(([2, 3, 5], np.arange(10, 23), np.arange(25, 34), np.arange(34, 62)))))

_CSZ = np.hstack((18.21 * np.ones(3), 12.14 * np.ones(13), 417.54 * np.ones(9), 962.68 * np.ones(28)))
_DSZ = np.hstack((0.36 * np.ones(3), 0.36 * np.ones(13), 0.71 * np.ones(9), 0.69 * np.ones(28)))
_I_INTERP = _BLOCK / _BLOCK.min()


def _filterbank(signal, n_threads):
    """Auditory filter bank, Section 5.1.4.2: the 53 half-Bark filters of the package, one band per thread."""
    k = 5
    e_i = [0, 1, 11, 11, 1]
    out = np.zeros((signal.size, _N_BANDS), order='F')

    def one(z):
        tau = (1 / (2 ** (2 * k - 1))) * comb(2 * k - 2, k - 1) * (1 / _DFZ[z])
        d = np.exp(-1. / (_FS * tau))
        bp = np.exp((1j * 2 * np.pi * _BAND_FREQS[z] * np.arange(0, k + 2)) / _FS)
        m_a = range(1, k + 1)
        a_m = np.append(1, ((-d) ** m_a) * comb(k, m_a)) * bp[0:k + 1]
        m_b = range(0, k)
        i = range(1, k)
        b_m = ((((1 - d) ** k) / np.sum(e_i[1:] * (d ** i))) * (d ** m_b) * e_i) * bp[0:k]
        out[:, z] = 2 * np.real(lfilter(b_m, a_m, signal, axis=0))

    with ThreadPoolExecutor(max_workers=n_threads) as ex:
        list(ex.map(one, range(_N_BANDS)))
    return out


def _lag_window(z):
    """Lag window of band z, Section 6.2.4 (Equations 31-34): (m_start, m_end, M)."""
    t_start = max(0.5 / _DFZ[z], 2e-3)
    t_end = max(4 / _DFZ[z], t_start + 1e-3)
    m_start = int(np.ceil(t_start * _FS) - 1)
    m_end = int(np.floor(t_end * _FS) - 1)
    return m_start, m_end, m_end - m_start + 1


def _rows_kept():
    """ACF rows each duplicated band must keep: the largest lag window among the bands that average it."""
    rows = np.ones(61, dtype=int)
    for z in range(_N_BANDS):
        h = min(_lag_window(z)[1] + 1, int(_BLOCK[z]))
        for d in range(_AVG[0, z], _AVG[1, z]):
            rows[d] = max(rows[d], h)
    return rows


def _band_acf(d, signal_bands, rows):
    """Unbiased, normalised ACF of duplicated band d (Section 6.2.2), only its first rows[d] lags."""
    block = int(_BLOCK_DUPE[d])
    keep = int(rows[d])
    seg, _ = shm_signal_segment(signal_bands[:, _SRC_COL[d]], block_size=block, overlap=_OVERLAP,
                                i_start=int(_BLOCK_DUPE[0] - block))
    rect, basis, _ = shm_basis_loudness(signal_segmented=seg, band_centre_freq=_FREQ_DUPE[d])
    n_blocks = rect.shape[1]
    out = np.empty((keep, n_blocks))
    step = max(16, _SLICE_ELEMS // block)
    zero_from = int(0.75 * block)
    # a transform of block + keep points has no wrap-around into the lags that are kept (the package pads to 2 x block)
    n_fft = sfft.next_fast_len(block + keep, real=True)
    for c0 in range(0, n_blocks, step):
        r = np.ascontiguousarray(rect[:, c0:c0 + step].T)             # one block per row: contiguous for the FFT
        spec = sfft.rfft(r, n=n_fft, axis=1)
        unscaled = sfft.irfft(spec.real ** 2 + spec.imag ** 2, n=n_fft, axis=1)[:, :keep]
        sq = r ** 2
        suffix = np.cumsum(sq[:, ::-1], axis=1)[:, ::-1][:, :keep]    # energy from sample m to the end
        prefix = np.cumsum(sq, axis=1)[:, ::-1][:, :keep]             # energy up to sample N-1-m
        acf = unscaled / (np.sqrt(suffix * prefix) + _EPS)
        if zero_from < keep:
            acf[:, zero_from:] = 0
        out[:, c0:c0 + step] = (acf * basis[c0:c0 + step, None]).T
    return out


def _band_components(z, acf_dupe, last_block, fast=False):
    """Tonal loudness, noise loudness and tonal frequency of band z (Sections 6.2.3 to 6.2.8)."""
    m_start, m_end, num_win = _lag_window(z)
    i0, i1 = _AVG[0, z], _AVG[1, z]
    height = min(m_end + 1, int(_BLOCK[z]))

    # average over neighbouring bands (same order of additions as np.mean over the object array)
    acc = acf_dupe[i0][:height]
    for k in range(i0 + 1, i1):
        acc = acc + acf_dupe[k][:height]
    mean_acf = acc / (i1 - i0)

    if z < 16:  # average over adjacent time blocks
        mean_acf = np.asfortranarray(np.roll(np.nan_to_num(bn.move_mean(mean_acf, window=3, min_count=3, axis=1),
                                                           copy=False), shift=-1, axis=1))

    n_blocks = mean_acf.shape[1]
    win = mean_acf[m_start:height]
    win = win - np.mean(win, axis=0)

    # ACF spectrum in the lag window (Equation 36), tonal loudness (Equation 37) and tonal frequency (38, 39)
    peak = np.empty(n_blocks)
    freq_bins = np.empty(n_blocks)
    n_fft = 2 * _MAX_BLOCK
    if fast:
        # the window is short, so the transform only needs _PAD x its length (a shift only changes the phase);
        # the peak is then refined by a parabola through the three bins around it
        n_fft = min(n_fft, sfft.next_fast_len(max(256, _PAD * win.shape[0]), real=True))
    for c0 in range(0, n_blocks, _FFT_COLS):
        part = win[:, c0:c0 + _FFT_COLS]
        if fast:
            x = np.ascontiguousarray(part.T)
        else:                                                  # the package transforms the window at its lag position
            x = np.zeros((part.shape[1], height))
            x[:, m_start:height] = part.T
        mag = np.abs(sfft.rfft(x, n=n_fft, axis=1))
        mag[np.isnan(mag)] = 0.0
        mag[mag <= _EPS] = 0.0
        top = mag.max(axis=1)
        rows_ = np.arange(mag.shape[0])
        if fast:
            first = np.argmax(mag, axis=1)
            lo, hi = np.maximum(first - 1, 0), np.minimum(first + 1, mag.shape[1] - 1)
            a, c = mag[rows_, lo], mag[rows_, hi]
            curv = a - 2 * top + c
            inside = (first > 0) & (first < mag.shape[1] - 1) & (curv < 0)
            delta = np.where(inside, 0.5 * (a - c) / np.where(inside, curv, 1.0), 0.0)
            peak[c0:c0 + _FFT_COLS] = top - np.where(inside, 0.25 * (a - c) * delta, 0.0)
            freq_bins[c0:c0 + _FFT_COLS] = first + delta
            continue
        peak[c0:c0 + _FFT_COLS] = top
        first = np.argmax(mag >= top[:, None] - 2e-8, axis=1)   # first bin that can reach the rounded maximum
        bad = np.round(mag[rows_, first], 8) != np.round(top, 8)
        for c in np.nonzero(bad)[0]:                            # rare: rounding moved the maximum, do it exactly
            first[c] = np.argmax(np.round(mag[c], 8))
        freq_bins[c0:c0 + _FFT_COLS] = first

    band_tonal = mean_acf[0, :].copy()
    cand = 2 * peak / (num_win / 2)
    mask = cand <= mean_acf[0, :]
    band_tonal[mask] = cand[mask]
    band_freqs = freq_bins * (_FS / n_fft)
    band_loud = mean_acf[0, :].copy()

    if _I_INTERP[z] > 1:
        xp = np.linspace(0, n_blocks - 1, n_blocks)
        x = np.linspace(0, n_blocks - 1, int(_I_INTERP[z] * (n_blocks - 1) + 1))
        band_tonal = np.interp(x, xp, band_tonal)
        band_loud = np.interp(x, xp, band_loud)
        band_freqs = np.interp(x, xp, band_freqs)

    band_tonal = band_tonal[:last_block + 1]
    band_loud = band_loud[:last_block + 1]
    band_freqs = band_freqs[:last_block + 1]

    # noise reduction (Section 6.2.7)
    alpha, beta = 20, 0.07
    snr1 = band_tonal / ((band_loud - band_tonal) + _EPS)
    band_tonal = shm_noise_red_lowpass(band_tonal, 187.5)
    snr = shm_noise_red_lowpass(snr1, 187.5)
    gz = _CSZ[z] / (_BAND_FREQS[z] ** _DSZ[z])
    crit = np.exp(-alpha * ((snr / gz) - beta))
    nr = 1 - crit
    nr[crit >= 1] = 0
    band_tonal = nr * band_tonal
    band_noise = shm_noise_red_lowpass(band_loud, 187.5) - band_tonal
    return z, band_tonal, band_noise, band_freqs


def shm_tonality_ecma(p, samp_rate_in, axis=0, soundfield='free_frontal', wait_bar=False, out_plot=False,
                      fast=False):
    """Drop-in replacement for sottek_hearing_model.shm_tonality_ecma (no plotting, no progress bar).

    fast=True trades a little accuracy for speed in the lag-window transform (shorter FFT, interpolated peak).
    """
    p, chans_in, chans = shm_in_check(p, samp_rate_in, axis, soundfield, False, False)
    p_re = shm_resample(p, samp_rate_in)[0] if samp_rate_in != _FS else p
    pn = shm_pre_proc(p_re, _MAX_BLOCK, _HOP_MIN)
    pn_om = shm_outmid_ear_filter(pn, soundfield)
    del pn

    end_block = int(np.ceil(p_re.shape[0] / _FS * (_FS / _HOP_MIN)))
    spec_tonal = np.zeros([end_block + 1, _N_BANDS, chans_in], order='F')
    spec_noise = np.zeros([end_block + 1, _N_BANDS, chans_in], order='F')
    spec_freqs = np.zeros([end_block + 1, _N_BANDS, chans_in], order='F')
    spec_avg = np.zeros([_N_BANDS, chans_in], order='F')
    spec_avg_freqs = np.zeros([_N_BANDS, chans_in], order='F')
    tonality_t = np.zeros([end_block + 1, chans_in], order='F')
    tonality_t_freqs = np.zeros([end_block + 1, chans_in], order='F')
    tonality_avg = np.zeros([chans_in])
    n_threads = min(_N_BANDS, _NUM_THREADS)
    rows = _rows_kept()
    cal_T, cal_Tx, A, B = 2.8758615, 1 / 0.9999043734252, 35, 0.003

    for chan in range(chans_in):
        pn_omz = _filterbank(pn_om[:, chan], n_threads)
        with ThreadPoolExecutor(max_workers=n_threads) as ex:
            acf_dupe = list(ex.map(lambda d: _band_acf(d, pn_omz, rows), range(61)))
        del pn_omz
        with ThreadPoolExecutor(max_workers=n_threads) as ex:
            for z, tl, nl, tf in ex.map(lambda z: _band_components(z, acf_dupe, end_block, fast), range(_N_BANDS)):
                spec_tonal[:, z, chan] = tl
                spec_noise[:, z, chan] = nl
                spec_freqs[:, z, chan] = tf
        del acf_dupe

        spec_tonal[spec_tonal < 0] = 0
        spec_noise[spec_noise < 0] = 0
        snr = np.max(spec_tonal, axis=1) / (np.sum(spec_noise, axis=1) + _EPS)
        crit = np.exp(-A * (snr - B))
        ql = 1 - crit
        ql[crit >= 1] = 0
        spec_tonality = cal_T * cal_Tx * np.swapaxes(np.tile(ql, [53, 1, 1]), 0, 1) * spec_tonal

        for z in range(_N_BANDS):
            mask = spec_tonality[:, z, chan] > 0.02
            mask[0:57] = False
            n = np.count_nonzero(mask) + _EPS
            spec_avg[z, chan] = np.sum(spec_tonality[mask, z, chan], 0) / n
            spec_avg_freqs[z, chan] = np.sum(spec_freqs[mask, z, chan], 0) / n

        time_out = np.arange(0, spec_tonality.shape[0]) / (_FS / _HOP_MIN)
        tonality_t[:, chan] = np.max(spec_tonality[:, :, chan], axis=1)
        zmax = np.argmax(spec_tonality[:, :, chan], axis=1)
        tonality_t_freqs[:, chan] = spec_freqs[np.arange(end_block + 1), zmax, chan]
        mask = tonality_t[:, chan] > 0.02
        mask[0:57] = False
        tonality_avg[chan] = np.sum(tonality_t[mask, chan], axis=0) / (np.count_nonzero(mask) + _EPS)

    if chans_in == 1:
        spec_tonality, spec_avg, spec_freqs = np.squeeze(spec_tonality), np.squeeze(spec_avg), np.squeeze(spec_freqs)
        spec_avg_freqs, tonality_t, tonality_t_freqs = (np.squeeze(spec_avg_freqs), np.squeeze(tonality_t),
                                                        np.squeeze(tonality_t_freqs))
    return {'spec_tonality': spec_tonality, 'spec_tonality_avg': spec_avg, 'spec_tonality_freqs': spec_freqs,
            'spec_tonality_avg_freqs': spec_avg_freqs, 'spec_tonal_loudness': spec_tonal,
            'spec_noise_loudness': spec_noise, 'tonality_t': tonality_t, 'tonality_avg': tonality_avg,
            'tonality_t_freqs': tonality_t_freqs, 'band_centre_freqs': _BAND_FREQS, 'time_out': time_out,
            'soundfield': soundfield}


def shm_tonality_ecma_fast(p, samp_rate_in, axis=0, soundfield='free_frontal', wait_bar=False, out_plot=False):
    """Fast mode (approximate): see shm_tonality_ecma(fast=True)."""
    return shm_tonality_ecma(p, samp_rate_in, axis=axis, soundfield=soundfield, fast=True)
