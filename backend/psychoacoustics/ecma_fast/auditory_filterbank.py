# -*- coding: utf-8 -*-
"""The 53 auditory filters of ECMA-418-2:2025 Section 5.1.4 (half-Bark spacing, z = 0.5 ... 26.5 Bark_HMS).

Shared by the tonality (`tonality_exact.py`) and by the IPM (`psychoacoustics/mpi.py`); it needs only numpy and scipy.

Derived from sottek_hearing_model (https://github.com/acoustics-code-salford/sottek-hearing-model).
Original copyright (C) Mike JB Lotinga, University of Salford (AGPL-3.0-only).
Modified in October 2026 by Henrique Alende da Silveira for PySQA Web. Copyright (C) 2026 Henrique Alende da Silveira and the PySQA Web contributors.
Licensed under the GNU Affero General Public License v3.0 (see LICENSE), WITHOUT ANY WARRANTY.
"""
import numpy as np
from scipy.special import comb

#: Sample rate the standard prescribes for the filter bank [Hz].
FS = 48e3
DELTA_F0 = 81.9289          # Section 5.1.4.1, delta f(f = 0) [Hz]
C = 0.1618                  # Section 5.1.4.1, centre-frequency constant
ORDER = 5                   # filter order, footnote 5
_E = [0, 1, 11, 11, 1]

#: Critical-band rate z of the 53 bands [Bark_HMS].
Z = np.arange(0.5, 27, 0.5)
N_BANDS = len(Z)
#: Centre frequencies F(z) [Hz], Equation 9, and bandwidths delta f(z) [Hz], Equation 10.
CENTRE_FREQS = (DELTA_F0 / C) * np.sinh(C * Z)
BANDWIDTHS = np.sqrt(DELTA_F0 ** 2 + (C * CENTRE_FREQS) ** 2)


def filter_coefficients(band):
    """Numerator and denominator ``(b, a)`` of the complex band-pass filter of band index ``band`` (0 ... 52).

    ``lfilter(b, a, x)`` is the analytic band signal: ``2 * real`` of it is the band-pass signal and ``2 * abs`` of it is
    the envelope of the basilar-membrane excitation.
    """
    k = ORDER
    tau = (1 / (2 ** (2 * k - 1))) * comb(2 * k - 2, k - 1) * (1 / BANDWIDTHS[band])
    d = np.exp(-1. / (FS * tau))
    bp = np.exp((1j * 2 * np.pi * CENTRE_FREQS[band] * np.arange(0, k + 2)) / FS)
    m_a = range(1, k + 1)
    a_m = np.append(1, ((-d) ** m_a) * comb(k, m_a)) * bp[0:k + 1]
    m_b = range(0, k)
    i = range(1, k)
    b_m = ((((1 - d) ** k) / np.sum(_E[1:] * (d ** i))) * (d ** m_b) * _E) * bp[0:k]
    return b_m, a_m
