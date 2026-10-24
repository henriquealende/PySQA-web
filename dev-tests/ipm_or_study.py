"""Study of the onset rate (OR) of the IPM: how the OR read from the 10 ms level history compares with the true rise of a burst,
per band group, and what a finer block would change. Run from the backend folder:

    python ../dev-tests/ipm_or_study.py
"""
import os, sys, warnings
import numpy as np
warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
from psychoacoustics import mpi
from psychoacoustics.mpi import IPM, measure_event, _HOP_S
from psychoacoustics.ecma_fast.auditory_filterbank import BANDWIDTHS, CENTRE_FREQS, N_BANDS

FS = 48000
rng = np.random.default_rng(21)
DUR, AT = 4.0, 2.0
FL = 0.01
floor = rng.standard_normal(int(DUR * FS)) * FL
nz = rng.standard_normal(int(DUR * FS))


def burst(rise_ms, db, shape="amp"):
    n = int(rise_ms / 1000 * FS)
    env = np.zeros(int(DUR * FS)); i0 = int(AT * FS)
    if shape == "amp":
        env[i0:i0 + n] = np.linspace(0, 1, n)                    # amplitude rises linearly
    else:
        env[i0:i0 + n] = 10 ** ((np.linspace(0, 1, n) - 1) * 40 / 20)   # level rises linearly over 40 dB
    tail = np.exp(-np.arange(int(0.4 * FS)) / (0.05 * FS)); env[i0 + n:i0 + n + len(tail)] = tail
    return env, floor + nz * env * FL * 10 ** (db / 20), db


def ideal(env, db):
    """The rise read from the true envelope level on a 1 ms grid (no filter, no noise)."""
    amp = FL * 10 ** (db / 20)
    blocks = len(env) // 48
    p = (env[:blocks * 48].reshape(-1, 48) ** 2).mean(axis=1) * amp ** 2 + FL ** 2
    lv = 10 * np.log10(p)
    e = measure_event(lv, 5, 0.001)
    return e


ipm = IPM()
hop = int(round(_HOP_S * FS))
print("true envelope read on a 1 ms grid vs the pipeline (median over bands), 28 dB above the floor, amplitude ramp")
print(f"{'rise ms':>8} {'ideal OR':>10} {'ideal rise':>10} | {'band OR (low z<6)':>18} {'(mid 6-16)':>11} {'(high >16)':>11} | {'rise from OR: low':>17} {'mid':>6} {'high':>6} | detected")
for rise in (1, 2, 5, 10, 20, 40):
    env, x, db = burst(rise, 28)
    ide = ideal(env, db)
    r = ipm.analyze(x, FS)
    z = r.z
    res = {}
    for name, m in (("low", z < 6), ("mid", (z >= 6) & (z <= 16)), ("high", z > 16)):
        sel = m & r.detected
        res[name] = (np.median(r.onset_rate[sel]), np.median(r.ldi[sel] / r.onset_rate[sel]) * 1000) if sel.any() else (np.nan, np.nan)
    print(f"{rise:8d} {ide['onset_rate']:10.0f} {ide['ldi']/ide['onset_rate']*1000:9.1f}ms | {res['low'][0]:18.0f} {res['mid'][0]:11.0f} {res['high'][0]:11.0f} | "
          f"{res['low'][1]:15.1f}ms {res['mid'][1]:5.1f} {res['high'][1]:5.1f} | {int(r.detected.sum())}")

print("\nsame, level rising linearly in dB over 40 dB (the 'linear rise' of the definition)")
for rise in (2, 5, 10, 20, 40):
    env, x, db = burst(rise, 40, "db")
    ide = ideal(env, db)
    r = ipm.analyze(x, FS)
    sel = r.detected & (r.z > 6)
    print(f"{rise:8d} ms  ideal OR {ide['onset_rate']:7.0f} (true {40/(rise/1000):7.0f})  bands>6 Bark: OR median {np.median(r.onset_rate[sel]):7.0f}  rise {np.median(r.ldi[sel]/r.onset_rate[sel])*1000:5.1f} ms")

print("\nP sensitivity: how much does P change if OR is off by a factor f (P = 3 log10 OR + ...)")
for f in (0.5, 0.8, 1.25, 2.0):
    print(f"  OR x {f}: P changes by {3*np.log10(f):+.2f} dB")

print("\nrepeatability: same click, 12 different noise floors, 5 ms rise, band 20 (about 1.9 kHz) and band 6 (about 400 Hz)")
for b in (6, 20):
    ors, ps = [], []
    for s in range(12):
        g = np.random.default_rng(100 + s)
        fl = g.standard_normal(int(DUR * FS)) * FL
        env = np.zeros(int(DUR * FS)); i0 = int(AT * FS); n = int(0.005 * FS)
        env[i0:i0 + n] = np.linspace(0, 1, n)
        tail = np.exp(-np.arange(int(0.4 * FS)) / (0.05 * FS)); env[i0 + n:i0 + n + len(tail)] = tail
        x = fl + g.standard_normal(int(DUR * FS)) * env * FL * 10 ** (28 / 20)
        lv = IPM._band_levels(x, b, hop)
        ev = measure_event(lv, 8)
        if ev:
            ors.append(ev["onset_rate"]); ps.append(ev["p"])
    print(f"  band {b} ({CENTRE_FREQS[b]:.0f} Hz, BW {BANDWIDTHS[b]:.0f} Hz): OR median {np.median(ors):.0f}, spread (std/mean) {np.std(ors)/np.mean(ors)*100:.0f} %, P std {np.std(ps):.2f} dB, n={len(ors)}")
