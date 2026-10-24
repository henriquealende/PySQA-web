"""Characterisation tests of the LEGACY IPM (backend/psychoacoustics/mpi_legacy.py, the version used until October 2026).

The app now uses the rewrite in mpi.py (tests in test_ipm.py). These tests keep describing the old behaviour.

Run with the backend venv from the backend folder:

    python ../dev-tests/test_ipm_legacy.py

Two kinds of line:

  PASS / FAIL    what the metric must do today (contract, formulas, invariances, a golden vector). A FAIL means a change in
                 behaviour: either a bug, or an intended change that needs the golden vector and the thresholds updated.
  KNOWN ISSUE    a limitation found in the audit (see docs/IPM_AUDITORIA.md); the ones about memory, error messages and invalid input
                 were fixed without changing a value and are plain checks now (sections 5 and 7). The test asserts that the limitation is still
                 there, so the suite stays green; when a fix removes it the line becomes FIXED and tells you to turn it into a
                 plain check. Nothing here changes the metric: the numbers are the thesis' implementation as it is.
"""
import os
import sys
import time
import tracemalloc
import warnings

import numpy as np
from scipy import signal as sp

warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
from psychoacoustics import mpi_legacy as mpi  # noqa: E402
from psychoacoustics.mpi_legacy import BARK_SCALE, CENTRE_FREQUENCIES as F, IPM  # noqa: E402

FS = 48000
WEIGHT = IPM._frequency_weighting()
fails, still_open, fixed = [], [], []


def _has(detail):
    return not (detail is None or (isinstance(detail, str) and detail == ""))


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" -> {detail}" if _has(detail) else ""))
    if not ok:
        fails.append(name)


def known(name, defect_present, detail=""):
    if defect_present:
        print(f"KNOWN ISSUE {name}" + (f" -> {detail}" if _has(detail) else ""))
        still_open.append(name)
    else:
        print(f"FIXED {name}: the limitation is gone, turn this into a plain check" + (f" -> {detail}" if _has(detail) else ""))
        fixed.append(name)


# ── helpers ───────────────────────────────────────────────────────────────────

def noise(dur, seed, rms=0.02, fs=FS):
    return np.random.default_rng(seed).standard_normal(int(dur * fs)) * rms


def click(x, peak, t=None, ms=1.0, seed=5, fs=FS, sign=1):
    """x plus a short Hann-shaped noise burst of the given peak (Pa) at t seconds (default: the middle)."""
    x = x.copy()
    n = int(ms * 1e-3 * fs)
    b = np.random.default_rng(seed).standard_normal(n) * np.hanning(n)
    b *= peak / np.max(np.abs(b))
    i = int((len(x) / fs / 2 if t is None else t) * fs)
    x[i:i + n] += sign * b
    return x


def prom(x, fs=FS):
    """Prominence P per band, before the weighting."""
    return IPM._compute_prominence(IPM._bandpass_filter(np.asarray(x, float), fs), fs)


def total(p):
    """Energy sum in dB of the 21 values: what the server reports as the global IPM."""
    return float(10 * np.log10(np.sum(10 ** (np.asarray(p) / 10))))


t0 = time.perf_counter()
BASE = noise(4, 1)                                  # 60 dB SPL white noise
CLICKED = click(BASE, 2.0)                          # + a 1 ms click 40 dB above its RMS
P_BASE, P_CLICK = prom(BASE), prom(CLICKED)

# ── 1. contract ───────────────────────────────────────────────────────────────
print("== 1. contract ==")
x2 = noise(2, 11)
bark, mp = IPM().calculateMPI(x2, FS)
check("returns two arrays of 21 values", bark.shape == (21,) and mp.shape == (21,) and len(F) == 21, (bark.shape, mp.shape))
check("values are finite floats", np.isfinite(mp).all() and np.isfinite(bark).all() and mp.dtype == float)
check("the Bark axis increases with frequency", bool(np.all(np.diff(bark) > 0)))
b0, m0 = IPM().calculateMPI(np.array([]), FS)
check("empty input gives 21 zeros, not an error", np.array_equal(m0, np.zeros(21)) and b0.shape == (21,))
other = noise(2, 12) * 5
check("a stereo array uses the first channel only", np.array_equal(IPM().calculateMPI(np.c_[x2, other], FS)[1], mp))
check("a Python list and int16 are accepted", np.allclose(IPM().calculateMPI(list(x2[:48000]), FS)[1], IPM().calculateMPI(x2[:48000], FS)[1]))
xc = x2.copy()
IPM().calculateMPI(xc, FS)
check("the input is not modified", np.array_equal(xc, x2))
check("two calls give identical results", np.array_equal(IPM().calculateMPI(x2, FS)[1], mp))
for fs in (24000, 44100, 96000):
    m = IPM().calculateMPI(noise(1.5, 3, fs=fs), fs)[1]
    check(f"{fs} Hz is accepted", m.shape == (21,) and np.isfinite(m).all())

# ── 2. formulas and a golden vector ───────────────────────────────────────────
print("\n== 2. formulas and golden vector ==")
bands = IPM._bandpass_filter(CLICKED, FS)
band = bands[10]
pk, _ = sp.find_peaks(band, prominence=5 * np.std(band))
ip = pk[int(np.argmax(band[pk]))]
win = band[max(0, ip - 4800): ip + 4800]
spl = 20 * np.log10(np.abs(win) / 2e-5)
delta = float(spl.max() - spl.mean())
by_hand = 3 * np.log10(delta / (15 * 0.2)) + 2 * np.log10(delta)
check("P of a band equals 3*log10(OR) + 2*log10(LDI) computed by hand (1 kHz band)", abs(prom(CLICKED)[10] - by_hand) < 1e-12, round(by_hand, 4))
known("the onset-rate term carries no time information: with the fixed T = 0.2 s, P = 5*log10(LDI) - 3*log10(3) exactly",
      abs(by_hand - (5 * np.log10(delta) - 3 * np.log10(3))) < 1e-12, f"LDI {delta:.1f} dB -> P {by_hand:.3f}")

jnd = np.interp(np.linspace(100.0, 10080.0, 1981), mpi._JND_FREQS, mpi._JND_VALUES)
w_formula = (3000.0 * np.log10((10.0 - jnd) / np.max(10.0 - jnd)))[mpi._WEIGHTING_INDICES]
check("weighting equals the documented formula at its sparse indices", np.allclose(WEIGHT, w_formula, atol=1e-12))
check("weighting is never positive, flat (-2.91 dB) up to 200 Hz, mildest near 3 kHz",
      bool((WEIGHT <= 0).all()) and np.allclose(WEIGHT[:4], WEIGHT[0]) and int(np.argmax(WEIGHT)) == 15, f"{WEIGHT.min():.2f}..{WEIGHT.max():.3f} dB")
jnd_c = np.interp(F, mpi._JND_FREQS, mpi._JND_VALUES)
w_exact = 3000.0 * np.log10((10.0 - jnd_c) / np.max(10.0 - jnd))
known("the weighting is read at indices of a 5.04 Hz grid that sit up to 4.2 % above the centre frequencies (effect <= 0.06 dB)",
      float(np.abs(WEIGHT - w_exact).max()) > 0.01 and float(np.abs(WEIGHT - w_exact).max()) < 0.1, f"max {np.abs(WEIGHT - w_exact).max():.3f} dB")

GOLDEN_P = [4.3018, 4.9493, 4.6964, 4.5862, 5.023, 5.3258, 5.4422, 5.573, 5.8232, 5.9454, 6.1144, 6.2415, 6.2522, 6.2815, 6.2633,
            6.3817, 6.3124, 6.2913, 6.24, 6.5165, 6.6782]
g = np.random.default_rng(123).standard_normal(3 * FS) * 0.02
nb = np.random.default_rng(123)
nb.standard_normal(3 * FS)
burst = nb.standard_normal(48) * np.hanning(48)
burst *= 2.0 / np.max(np.abs(burst))
g[72000:72048] += burst
check("golden vector: prominence of a seeded click in noise (regression guard for any refactor)",
      np.allclose(prom(g), GOLDEN_P, atol=2e-3), np.round(np.abs(prom(g) - GOLDEN_P).max(), 5))

# ── 3. invariances ────────────────────────────────────────────────────────────
print("\n== 3. invariances ==")
for gain in (1000.0, 0.001):
    check(f"gain x{gain:g} does not change P (only level differences enter)", np.abs(prom(CLICKED * gain) - P_CLICK).max() < 1e-9)
check("polarity: an inverted click changes P by less than 0.3", np.abs(prom(click(BASE, 2.0, sign=-1)) - P_CLICK).max() < 0.3,
      round(float(np.abs(prom(click(BASE, 2.0, sign=-1)) - P_CLICK).max()), 3))
glob = [total(prom(click(BASE, 2.0, t=tc))) for tc in (0.05, 0.3, 2.0, 3.7, 3.95)]
check("the position of the click in the file moves the global by less than 0.3 dB (window truncated at the edges)", max(glob) - min(glob) < 0.3,
      np.round(glob, 2))
gfs = [total(prom(click(noise(4, 1, fs=fs), 2.0, fs=fs), fs)) for fs in (44100, 48000, 96000)]
check("44.1, 48 and 96 kHz agree within 0.6 dB", max(gfs) - min(gfs) < 0.6, np.round(gfs, 2))
x_two = CLICKED.copy()
b2 = np.random.default_rng(9).standard_normal(48) * np.hanning(48)
x_two[int(2.05 * FS):int(2.05 * FS) + 48] += b2 * 2.0 / np.max(np.abs(b2))
check("a second click 50 ms after the first does not change the global (one event per band)", abs(total(prom(x_two)) - total(P_CLICK)) < 0.2)
levels = [total(prom(click(BASE, 0.02 * 10 ** (c / 20)))) for c in (30, 40, 60, 80)]
check("the global grows with the height of the click", all(np.diff(levels) > 0), np.round(levels, 2))

# ── 5. band by band: same numbers, a fraction of the memory ───────────────────
print("\n== 5. band by band: same numbers, a fraction of the memory ==")
x10 = click(noise(10, 2), 2.0)
all_bands = IPM._compute_prominence(IPM._bandpass_filter(x10, FS), FS) + WEIGHT         # the 21 band signals at once
check("calculateMPI (one band at a time) is bit-identical to filtering all 21 bands at once", np.array_equal(IPM().calculateMPI(x10, FS)[1], all_bands))
check("the same holds for 44.1 kHz and for a stereo array", np.array_equal(
    IPM().calculateMPI(click(noise(4, 7, fs=44100), 2.0, fs=44100), 44100)[1],
    IPM._compute_prominence(IPM._bandpass_filter(click(noise(4, 7, fs=44100), 2.0, fs=44100), 44100), 44100) + WEIGHT))
tracemalloc.start()
IPM._compute_prominence(IPM._bandpass_filter(x10, FS), FS)
mem_all = tracemalloc.get_traced_memory()[1] / 1e6
tracemalloc.stop()
tracemalloc.start()
IPM().calculateMPI(x10, FS)
mem_now = tracemalloc.get_traced_memory()[1] / 1e6
tracemalloc.stop()
check("and calculateMPI needs at least 4x less memory for 10 s of audio", mem_all > 4 * mem_now, f"{mem_all:.0f} MB -> {mem_now:.0f} MB")
check("the filters are designed once per sample rate (cached)", mpi._band_sos(FS) is mpi._band_sos(FS) and len(mpi._band_sos(FS)) == 21)

# ── 6. known limitations found in the audit ───────────────────────────────────
print("\n== 6. known limitations (docs/IPM_AUDITORIA.md) ==")
zw = 13 * np.arctan(0.00076 * F) + 3.5 * np.arctan((F / 7500) ** 2)
hms = (1 / 0.1618) * np.arcsinh(F * 0.1618 / 81.9289)
known("the Bark axis is a straight line between two values, not the Bark of the centre frequencies (up to 3.5 Bark off)",
      bool(np.allclose(np.diff(BARK_SCALE), np.diff(BARK_SCALE)[0])) and float(np.abs(BARK_SCALE - zw).max()) > 3.0,
      f"max |axis - Zwicker| {np.abs(BARK_SCALE - zw).max():.2f} Bark, vs HMS {np.abs(BARK_SCALE - hms).max():.2f}")

det = np.mean([(prom(noise(4, 20 + s)) != 0).mean() for s in range(5)])
known("steady white noise passes the 5-sigma detector in every band (the global maximum of a band always has a large prominence)", det > 0.99,
      f"{det * 100:.1f} % of bands")
known("stationary noise sets a floor of P ~ 4.8 per band and a global of ~16.8 dB; digital silence gives 12.0 dB",
      4.5 < float(np.median(P_BASE)) < 5.1 and 16.3 < total(P_BASE + WEIGHT) < 17.3 and abs(total(WEIGHT) - 12.0227) < 1e-3,
      f"noise: median P {np.median(P_BASE):.2f}, global {total(P_BASE + WEIGHT):.2f} dB; silence: {total(WEIGHT):.2f} dB")
known("a click 20 dB above the noise is invisible and +80 dB moves the global by under 3.5 dB (log of a dB difference compresses it)",
      total(prom(click(BASE, 0.2)) + WEIGHT) - total(P_BASE + WEIGHT) < 0.2 and total(prom(click(BASE, 200.0)) + WEIGHT) - total(P_BASE + WEIGHT) < 3.5,
      f"+20 dB: {total(prom(click(BASE, 0.2)) + WEIGHT) - total(P_BASE + WEIGHT):+.2f} dB, +80 dB: {total(prom(click(BASE, 200.0)) + WEIGHT) - total(P_BASE + WEIGHT):+.2f} dB")

over = [(prom(noise(2, 300 + s)) > 5).any() for s in range(24)]
known("the threshold of 5 is crossed by stationary noise: a quarter or more of 2 s noise records have a band with P above 5",
      np.mean(over) >= 0.25, f"{np.mean(over) * 100:.0f} % of records")

tone = 0.05 * np.sin(2 * np.pi * 1000.3 * np.arange(4 * FS) / FS + 0.7)
tn = np.random.default_rng(3).standard_normal(4 * FS) * 1e-4
edge = np.ones(4 * FS)
ramp = np.sin(np.linspace(0, np.pi / 2, 9600)) ** 2
edge[:9600], edge[-9600:] = ramp, ramp[::-1]
p_abrupt, p_ramped = prom(tone + tn), prom(tone * edge + tn)
bands_ab = IPM._bandpass_filter(tone + tn, FS)[9]
pk9, _ = sp.find_peaks(bands_ab, prominence=5 * np.std(bands_ab))
at_start = pk9.size and (pk9[np.argmax(bands_ab[pk9])] / FS) < 0.01
known("the abrupt start of a file is detected as an impulse: a steady 1 kHz tone gives P ~ 7 in the neighbour bands, ~ 4.5 with 200 ms ramps",
      bool(at_start) and p_abrupt[[9, 11]].min() > 6.0 and p_ramped[[9, 11]].max() < 5.5,
      f"abrupt {np.round(p_abrupt[[9, 11]], 2)}, ramped {np.round(p_ramped[[9, 11]], 2)}, analysed peak at t = {pk9[np.argmax(bands_ab[pk9])] / FS:.3f} s")

# ── 7. edge cases that work ───────────────────────────────────────────────────
print("\n== 7. edge cases ==")
check("digital silence gives the weighting alone (P = 0 in every band)", np.allclose(IPM().calculateMPI(np.zeros(FS), FS)[1], WEIGHT))
check("100 samples and 42 ms are accepted", all(IPM().calculateMPI(np.random.default_rng(0).standard_normal(n), FS)[1].shape == (21,) for n in (100, 2000)))
check("a DC offset of 1 Pa does not matter", np.abs(prom(noise(2, 1) + 1.0) - prom(noise(2, 1))).max() < 0.05,
      round(float(np.abs(prom(noise(2, 1) + 1.0) - prom(noise(2, 1))).max()), 4))

# invalid input: a clear reason instead of a scipy message, nothing swallowed
def reason(fn):
    try:
        fn()
    except mpi.IPMInputError as e:
        return e.reason
    except Exception as e:  # any other exception is a bug of the validation
        return f"unexpected {type(e).__name__}"
    return "no error"


check("39 samples are refused as too short, 40 are accepted",
      reason(lambda: IPM().calculateMPI(np.ones(39), FS)) == "too_short" and IPM().calculateMPI(np.random.default_rng(0).standard_normal(40), FS)[1].shape == (21,))
check("16 and 22.05 kHz are refused for the sample rate, 22.5 kHz is accepted",
      reason(lambda: IPM().calculateMPI(noise(2, 1, fs=16000), 16000)) == "sample_rate" and reason(lambda: IPM().calculateMPI(noise(2, 1, fs=22050), 22050)) == "sample_rate"
      and IPM().calculateMPI(noise(1, 1, fs=22500), 22500)[1].shape == (21,))
check("NaN and infinity are refused instead of swallowed",
      reason(lambda: IPM().calculateMPI(np.r_[noise(1, 1), np.nan, noise(1, 2)], FS)) == "not_finite" and reason(lambda: IPM().calculateMPI(np.r_[noise(1, 1), np.inf], FS)) == "not_finite")
check("IPMInputError is a ValueError (older callers keep working)", issubclass(mpi.IPMInputError, ValueError))

# ── 8. the thesis as reference (numbers printed in it; no audio needed) ──────
print("\n== 8. thesis tables as reference (Silveira, 2024) ==")
# Table 23 and Table 30: (OR [dB/s], LDI [dB], P [dB]) of the MPI per critical band; Table 1: the same for NT ACOU 112 (the standard, whole signal)
T23 = [(548.78, 16.46, 4.65), (1543.16, 46.29, 6.90)]
T30 = [(1128.06, 33.84, 6.21), (1169.67, 35.09, 6.29), (1148.40, 34.45, 6.25), (1117.22, 33.52, 6.19), (755.41, 22.66, 5.34),
       (732.86, 21.98, 5.28), (878.13, 26.34, 5.67), (834.86, 25.04, 5.56), (945.33, 28.36, 5.83), (1138.90, 34.17, 6.23)]
T1 = [(1117.3, 78.2, 12.9), (2417.3, 72.5, 13.8), (2457.0, 73.7, 13.9)]
p_code = lambda ldi: 3 * np.log10(ldi / (15 * mpi._EVENT_DURATION_S)) + 2 * np.log10(ldi)     # what _band_prominence computes
check("Table 1 (NT ACOU 112): P = 3*log10(OR) + 2*log10(LDI), no offset (the thesis truncates 13.87 to 13.8)", all(abs(3 * np.log10(o) + 2 * np.log10(l) - p) < 0.1 for o, l, p in T1))
check("Tables 23 and 30: the code's P(LDI) reproduces all 12 values printed in the thesis (within the rounding)",
      all(abs(p_code(l) - p) < 0.015 for _, l, p in T23 + T30), f"max |diff| {max(abs(p_code(l) - p) for _, l, p in T23 + T30):.4f} dB")
check("Tables 23 and 30: the thesis' P equals 3*log10(OR) + 2*log10(LDI) - 6 (a 6 dB offset the standard does not have)",
      all(abs(3 * np.log10(o) + 2 * np.log10(l) - 6 - p) < 0.015 for o, l, p in T23 + T30))
ratio = [o / l for o, l, _ in T23 + T30]
known("in every MPI row of the thesis OR/LDI = 33.33 (onset fixed at 30 ms, so P depends on LDI only); in Table 1, measured, it is 14.3, 33.3 and 33.3",
      max(abs(r - 33.333) for r in ratio) < 0.02 and abs(T1[0][0] / T1[0][1] - 14.29) < 0.1, f"{min(ratio):.3f}..{max(ratio):.3f}")

T24 = [(4, -2.9), (7, -1.1), (10, -0.5), (13, -0.2), (15, 0.0), (16, -0.3), (19, -1.4)]    # (band index of 250, 500, 1000, 2000, ~3000, 4000, 8000 Hz; weighting [dB])
check("the weighting reproduces Table 24 of the thesis within 0.1 dB", all(abs(WEIGHT[i] - w) < 0.1 for i, w in T24),
      f"max |diff| {max(abs(WEIGHT[i] - w) for i, w in T24):.3f} dB")

# Figure 68: the MPI of a cracking noise read from the plot (22 critical bands); the text says its global value is 32.5 dB
Y68 = np.array([1.2, 1.7, 2.3, 2.6, 2.8, 3.3, 3.9, 4.7, 5.4, 6.0, 6.3, 6.9, 7.1, 7.2, 7.3, 7.7, 7.9, 7.7, 7.3, 6.8, 6.3, 6.1])
thesis_like = 20 * np.log10(np.sum(10 ** (Y68 / 20)))       # amplitude sum
app_global = total(Y68)                                     # what the server computes (energy sum)
known("the global IPM of the server (energy sum) does not give the 32.5 dB the thesis prints for Figure 68; an amplitude sum of the plotted values gives it",
      abs(thesis_like - 32.5) < 0.5 and app_global < 21, f"amplitude sum {thesis_like:.1f} dB, energy sum {app_global:.1f} dB (values read from the plot)")
spread = [total(P_BASE + WEIGHT), total(P_CLICK + WEIGHT), total(prom(click(BASE, 200.0)) + WEIGHT), total(WEIGHT), total(p_abrupt + WEIGHT)]
known("the thesis' global MPI spans 16.6 to 77.9 dB (Table 41); the server's stays within 8 dB for silence, noise, a tone and clicks up to +80 dB",
      max(spread) - min(spread) < 8.0, f"server: {min(spread):.1f}..{max(spread):.1f} dB")

bp = os.path.join(os.getcwd(), "..", "frontend", "src", "pages", "PostProcessing", "BatchPanel.tsx")
if os.path.exists(bp):
    src = open(bp, encoding="utf-8").read()
    m = __import__("re").search(r"return (-?[\d.]+) \+ ([\d.]+)\*Number\(N\) \+ ([\d.]+)\*Number\(S\) \+ ([\d.]+)\*Number\(R\) \+ ([\d.]+)\*Number\(I\)", src)
    app_sil = tuple(float(v) for v in m.groups()) if m else None
    thesis_eq32 = (-26.86, 5.44, 13.29, 7.75, 0.13)
    known("the SIL model of the Batch panel is not Equation 32 of the thesis (constant -25.95 vs -26.86 and loudness 10.24 vs 5.44); S, R and MPI coefficients are the same",
          app_sil is not None and app_sil != thesis_eq32 and app_sil[2:] == thesis_eq32[2:], f"app {app_sil} vs thesis {thesis_eq32}")

print(f"\n{len(fails)} failed, {len(still_open)} known limitations still present, {len(fixed)} fixed ({time.perf_counter() - t0:.0f} s)")
print("FAILS:", fails)
sys.exit(1 if fails else 0)
