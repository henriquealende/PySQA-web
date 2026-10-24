"""How often does stationary noise (no impulse at all) get flagged impulsive by the criterion of the thesis?

The thesis (Silveira, 2024, Section 7.1.5) calls a signal impulsive when its MPI is above 5 dB in some critical band, and validated
that on excerpts of about 5 s. This script applies the same criterion to white noise of growing length with the NEW IPM (mpi.py)
and the LEGACY one (mpi_legacy.py). Run with the backend venv from the backend folder (about 3 minutes):

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
from psychoacoustics.mpi_legacy import IPM as IPMLegacy  # noqa: E402

FS = 48000
new, old = IPM(), IPMLegacy()


def noise(dur, seed, rms=0.02):
    return np.random.default_rng(seed).standard_normal(int(dur * FS)) * rms


print("White noise, whole record: flagged impulsive when some band has MPI (= P + weighting) above 5")
print(f"{'length':>8} {'records':>8} {'legacy flagged':>15} {'new flagged':>12}")
for dur, n in ((5, 40), (10, 24), (30, 10), (60, 6), (120, 4)):
    t0 = time.perf_counter()
    f_old = f_new = 0
    for s in range(n):
        x = noise(dur, 500 + s)
        f_old += bool((old.calculateMPI(x, FS)[1] > 5).any())
        f_new += new.analyze(x, FS).impulsive
    print(f"{dur:6d} s {n:8d} {f_old / n * 100:13.0f} % {f_new / n * 100:10.0f} %   ({time.perf_counter() - t0:.0f} s)")
