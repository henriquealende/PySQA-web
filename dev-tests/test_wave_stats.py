"""Waveform statistics (_signal_stats): mean/std/min/max and, when calibrated, LZeq, LAeq, LZmax, LAmax, Lpeak.
Run from the backend folder:  .venv/Scripts/python ../dev-tests/test_wave_stats.py"""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
import numpy as np

from services.audio_service import _signal_stats

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:200] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


fs = 48000
t = np.arange(fs * 2) / fs


def sine(f, a):
    return a * np.sin(2 * np.pi * f * t)


# Uncalibrated: plain statistics in full scale, no levels
x = sine(1000, 0.5)
s = _signal_stats(x, fs, None)
check("no levels without calibration", s["levels"] is None)
check("mean of a sine is 0", abs(s["mean"]) < 1e-4, s["mean"])
check("std of a sine is a/sqrt2", abs(s["std"] - 0.5 / np.sqrt(2)) < 1e-3, s["std"])
check("min/max are -a/+a", abs(s["max"] - 0.5) < 1e-3 and abs(s["min"] + 0.5) < 1e-3, (s["min"], s["max"]))

# Calibrated: 1 kHz sine whose peak is 1 Pa -> RMS 0.7071 Pa -> 90.97 dB; peak 93.98 dB
cal = 2.0                                   # peak Pa of full scale
s = _signal_stats(sine(1000, 0.5), fs, cal)
lv = s["levels"]
check("values are in Pa when calibrated", abs(s["max"] - 1.0) < 1e-3, s["max"])
check("LZeq of 1 Pa peak sine = 90.97 dB", abs(lv["lzeq"] - 90.97) < 0.05, lv["lzeq"])
check("Lpeak of 1 Pa peak = 93.98 dB", abs(lv["lpeak"] - 93.98) < 0.05, lv["lpeak"])
check("LAeq at 1 kHz ~ LZeq (A = 0 dB)", abs(lv["laeq"] - lv["lzeq"]) < 0.2, (lv["laeq"], lv["lzeq"]))
check("Fast max of a steady sine ~ its Leq", abs(lv["lzmax"] - lv["lzeq"]) < 0.3, (lv["lzmax"], lv["lzeq"]))

# A-weighting at 100 Hz: -19.1 dB
lv100 = _signal_stats(sine(100, 0.5), fs, cal)["levels"]
check("LAeq - LZeq at 100 Hz = -19.1 dB", abs((lv100["laeq"] - lv100["lzeq"]) + 19.1) < 0.3, lv100["laeq"] - lv100["lzeq"])

# Burst: Fast max sits below the instantaneous peak level and above the Leq
b = np.zeros(fs * 2)
b[fs // 2: fs // 2 + 2400] = sine(1000, 0.5)[: 2400]
lvb = _signal_stats(b, fs, cal)["levels"]
check("burst: LZmax between LZeq and Lpeak", lvb["lzeq"] < lvb["lzmax"] < lvb["lpeak"], (lvb["lzeq"], lvb["lzmax"], lvb["lpeak"]))

# Silence gives None levels, not -inf
lvs = _signal_stats(np.zeros(fs), fs, cal)["levels"]
check("silence -> None levels", all(v is None for v in lvs.values()), lvs)

print("\n%s" % ("ALL PASS" if not fails else "FAILED: " + ", ".join(fails)))
sys.exit(1 if fails else 0)
