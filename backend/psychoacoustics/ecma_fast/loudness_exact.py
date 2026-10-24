# -*- coding: utf-8 -*-
"""Loudness ECMA-418-2:2025 (Sottek Hearing Model) on top of the lean tonality of this package.

The loudness of the Sottek Hearing Model is computed from the tonal and noise loudness components that its
tonality function returns, followed by a cheap combination (Equations 113 and 114). The package's own
`shm_loudness_ecma` calls its original tonality, which needs about 0.5 GB per second of audio, so here the same
components come from `tonality_exact.shm_tonality_ecma` (same results, about a sixth of the memory) and the final
step is the package's own `shm_loudness_ecma_from_comp`.

Derived from sottek_hearing_model (https://github.com/acoustics-code-salford/sottek-hearing-model).
Original copyright (C) Mike JB Lotinga, University of Salford (AGPL-3.0-only).
Modified in October 2026 by Henrique Alende da Silveira for PySQA Web. Copyright (C) 2026 Henrique Alende da Silveira and the PySQA Web contributors.
Licensed under the GNU Affero General Public License v3.0 (see LICENSE), WITHOUT ANY WARRANTY.
"""
from sottek_hearing_model.shm_loudness_ecma import shm_loudness_ecma_from_comp
from sottek_hearing_model.shm_subs import shm_in_check, shm_resample

from psychoacoustics.ecma_fast.tonality_exact import shm_tonality_ecma

_FS = 48e3


def shm_loudness_ecma(p, samp_rate_in, axis=0, soundfield='free_frontal', wait_bar=False, out_plot=False,
                      binaural=True):
    """Drop-in replacement for sottek_hearing_model.shm_loudness_ecma (no plotting, no progress bar)."""
    p, chans_in, chans = shm_in_check(p, samp_rate_in, axis, soundfield, False, False)
    p_re = shm_resample(p, samp_rate_in)[0] if samp_rate_in != _FS else p
    tonality = shm_tonality_ecma(p_re, _FS, axis=0, soundfield=soundfield)
    loudness = shm_loudness_ecma_from_comp(tonality['spec_tonal_loudness'], tonality['spec_noise_loudness'],
                                           out_plot=False, binaural=binaural)
    loudness.setdefault('band_centre_freqs', tonality['band_centre_freqs'])
    loudness.setdefault('time_out', tonality['time_out'])
    loudness.setdefault('soundfield', soundfield)
    return loudness
