"""Study of the onset rate (OR) of the IPM: how the OR read from the 10 ms level history compares with the true rise of a burst,
per band group, and what a finer block would change. Run from the backend folder:

    python ../dev-tests/ipm_or_hop_study.py
"""
import os, sys, warnings
import numpy as np
warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
from psychoacoustics.mpi import IPM, measure_event
from psychoacoustics.ecma_fast.auditory_filterbank import BANDWIDTHS, Z
FS = 48000; DUR, AT, FL = 4.0, 2.0, 0.01
g = np.random.default_rng(21); floor = g.standard_normal(int(DUR*FS))*FL; nz = g.standard_normal(int(DUR*FS))
def burst(rise_ms):
    n = int(rise_ms/1000*FS); env = np.zeros(int(DUR*FS)); i0 = int(AT*FS)
    env[i0:i0+n] = np.linspace(0, 1, n)
    tail = np.exp(-np.arange(int(0.4*FS))/(0.05*FS)); env[i0+n:i0+n+len(tail)] = tail
    return floor + nz*env*FL*10**(28/20)
bands = [b for b in range(53) if Z[b] > 16]
mids = [b for b in range(53) if 6 <= Z[b] <= 16]
print("median OR (dB/s) of high bands (>16 Bark) | mid bands (6-16), and P, by block length; true: ideal 1 ms grid = 17497 12618 5893 3145 1637 821")
for hop_ms in (10, 5, 2.5):
    hop = int(round(hop_ms/1000*FS)); out = []
    for rise in (1, 2, 5, 10, 20, 40):
        x = burst(rise)
        row = []
        for sel in (bands, mids):
            ors, ps = [], []
            for b in sel:
                lv = IPM._band_levels(x, b, hop)
                guard = int(np.ceil(max(0.05, 6.0/BANDWIDTHS[b])/(hop_ms/1000)))
                e = measure_event(lv, guard, hop_ms/1000)
                if e: ors.append(e["onset_rate"]); ps.append(e["p"])
            row.append((np.median(ors) if ors else np.nan, np.median(ps) if ps else np.nan, len(ors)))
        out.append(row)
    print(f"hop {hop_ms:4} ms: high OR " + " ".join(f"{r[0][0]:6.0f}" for r in out) + " | P " + " ".join(f"{r[0][1]:5.2f}" for r in out) + " | mid OR " + " ".join(f"{r[1][0]:6.0f}" for r in out) + " | detected(high) " + " ".join(str(r[0][2]) for r in out))
