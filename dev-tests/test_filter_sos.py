"""Live filter preview: the sections from filter_sos, run `passes` times, must give the same level per frequency as the real
apply_filter (the zero-phase result that ends up in the file).
Run from the backend folder:  .venv/Scripts/python ../dev-tests/test_filter_sos.py"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
import numpy as np
from scipy import signal as sp

from processing.filtering import apply_filter, filter_sos

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:200] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


fs = 48000
t = np.arange(fs * 2) / fs


def level_db(x):
    mid = x[fs // 2: -fs // 2]            # leave out the edges
    return 20 * np.log10(np.sqrt(np.mean(mid ** 2)) / np.sqrt(0.5) + 1e-12)


def real_gain(freq, ftype, cutoff, design="Butterworth", **kw):
    x = np.sin(2 * np.pi * freq * t)
    y = apply_filter(x, fs, ftype, cutoff, 4, design, **kw)
    return level_db(y)


def preview_gain(freq, ftype, cutoff, design="Butterworth", **kw):
    sos, passes = filter_sos(fs, ftype, cutoff, 4, design, **kw)
    w, h = sp.sosfreqz(sos, worN=[2 * np.pi * freq / fs])
    return passes * 20 * np.log10(abs(h[0]) + 1e-12)


cases = [
    ("Low-pass", 1000.0, "Butterworth", {}),
    ("High-pass", 200.0, "Butterworth", {}),
    ("Band-pass", (300.0, 3000.0), "Butterworth", {}),
    ("Band-reject", (800.0, 1200.0), "Butterworth", {}),
    ("Low-pass", 1000.0, "Linkwitz", {}),
    ("Harmonic Notch", None, "Butterworth", {"fundamental": 500.0, "q_factor": 30.0}),
]
freqs = [100, 400, 700, 1000, 1500, 2500, 6000]
for ftype, cut, design, kw in cases:
    worst = 0.0
    for f in freqs:
        r = real_gain(f, ftype, cut, design, **kw)
        p = preview_gain(f, ftype, cut, design, **kw)
        if r > -60 and p > -60:               # compare where the signal is still measurable
            worst = max(worst, abs(r - p))
    check(f"{ftype} {design}: preview level = real level (max diff {worst:.2f} dB)", worst < 0.5, worst)

# Passes: zero-phase Butterworth runs twice, Linkwitz four times
check("Butterworth -> 2 passes", filter_sos(fs, "Low-pass", 1000.0)[1] == 2)
check("Linkwitz -> 4 passes", filter_sos(fs, "Low-pass", 1000.0, 4, "Linkwitz")[1] == 4)

# Errors
for name, args in [
    ("octave EQ has no preview", ("1/3-Octave band", None)),
    ("cutoff above Nyquist", ("Low-pass", 30000.0)),
    ("band with low >= high", ("Band-pass", (3000.0, 300.0))),
    ("missing cutoff", ("High-pass", None)),
]:
    try:
        filter_sos(fs, *args)
        check(name + " is refused", False)
    except ValueError:
        check(name + " is refused", True)
try:
    filter_sos(fs, "Harmonic Notch", None, 4, "Butterworth", 1.0, 30.0)
    check("too many harmonics is refused", False)
except ValueError:
    check("too many harmonics is refused", True)

print("\n%s" % ("ALL PASS" if not fails else "FAILED: " + ", ".join(fails)))
sys.exit(1 if fails else 0)
