"""How often does stationary noise (no impulse at all) get flagged impulsive by the criterion of the thesis?

The thesis (Silveira, 2024, Section 7.1.5) calls a signal impulsive when its MPI is above 5 dB in some critical band, and validated
that on excerpts of about 5 s. This script applies the same criterion to white noise of growing length, to the whole record and to
the record cut in 5 s windows. Run with the backend venv from the backend folder (about 2 minutes):

    python ../dev-tests/ipm_noise_study.py
"""
import os
import sys
import time
import warnings

import numpy as np

warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
from psychoacoustics.mpi import IPM  # noqa: E402

FS = 48000
ipm = IPM()
W = IPM._frequency_weighting()


def noise(dur, seed, rms=0.02):
    return np.random.default_rng(seed).standard_normal(int(dur * FS)) * rms


print("White noise, whole record: flagged impulsive when some band has MPI (= P + weighting) above 5")
print(f"{'length':>8} {'records':>8} {'median P':>9} {'mean of the record maximum':>27} {'flagged':>9}")
for dur, n in ((5, 40), (10, 24), (30, 10), (60, 6), (120, 4)):
    t0 = time.perf_counter()
    peak, flagged, med = [], 0, []
    for s in range(n):
        _, m = ipm.calculateMPI(noise(dur, 500 + s), FS)
        peak.append(m.max())
        flagged += bool((m > 5).any())
        med.append(np.median(m - W))
    print(f"{dur:6d} s {n:8d} {np.median(med):9.2f} {np.mean(peak):27.2f} {flagged / n * 100:7.0f} %   ({time.perf_counter() - t0:.0f} s)")

print("\n60 s of noise cut in twelve 5 s windows, flagged if any window has a band above 5")
n, hits = 8, 0
for s in range(n):
    x = noise(60, 900 + s)
    hits += any((ipm.calculateMPI(x[w * 5 * FS:(w + 1) * 5 * FS], FS)[1] > 5).any() for w in range(12))
print(f"  flagged: {hits} of {n} records")
