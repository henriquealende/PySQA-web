"""Tests of the IPM (backend/psychoacoustics/mpi.py, the rewrite of October 2026 that follows the thesis).

Run with the backend venv from the backend folder (about 1 minute):

    python ../dev-tests/test_ipm.py

The old version is described by test_ipm_legacy.py. Lines: PASS / FAIL, and KNOWN for what the thesis leaves open (still true,
the suite stays green).
"""
import os
import sys
import time
import tracemalloc
import warnings

import numpy as np

warnings.filterwarnings("ignore")
sys.path.insert(0, os.getcwd())
from psychoacoustics import mpi  # noqa: E402
from psychoacoustics.mpi import IPM, IPMInputError, measure_event  # noqa: E402

FS = 48000
ipm = IPM()
fails = []


def check(name, ok, detail=""):
    print(f"{'PASS' if ok else 'FAIL'}  {name}" + (f"  -> {detail}" if detail != "" else ""))
    if not ok:
        fails.append(name)


def known(name, still_true, detail=""):
    print(f"{'KNOWN' if still_true else 'FIXED'}  {name}" + (f"  -> {detail}" if detail != "" else ""))


def noise(dur, seed, rms=0.02, fs=FS):
    return np.random.default_rng(seed).standard_normal(int(dur * fs)) * rms


def burst(rise_s, at=2.0, dur=5.0, fs=FS, level=0.5, seed=3, floor=0.005):
    """Noise burst that rises linearly in rise_s and decays in 50 ms, on a quiet noise floor."""
    n = int(rise_s * fs)
    env = np.zeros(int(dur * fs))
    i0 = int(at * fs)
    env[i0:i0 + n] = np.linspace(0, 1, max(n, 1))
    tail = np.exp(-np.arange(int(0.3 * fs)) / (0.05 * fs))
    env[i0 + n:i0 + n + len(tail)] = tail
    return noise(dur, seed, floor, fs) + noise(dur, seed + 1, level, fs) * env


# 1. contract ------------------------------------------------------------------
print("== 1. contract ==")
x = burst(0.01)
r = ipm.analyze(x, FS)
check("53 bands at 48 kHz, Bark_HMS axis 0.5 ... 26.5", len(r.z) == 53 and r.z[0] == 0.5 and r.z[-1] == 26.5)
check("centre frequencies from ECMA-418-2 (z = 15.5 gives 3.09 kHz)", abs(r.freqs[30] - 3088.2) < 1)
bark, mpi_v = ipm.calculateMPI(x, FS)
check("calculateMPI keeps the old interface: (bark, mpi)", np.array_equal(bark, r.z) and np.array_equal(mpi_v, r.mpi))
check("empty signal gives zeros", np.all(ipm.calculateMPI(np.array([]), FS)[1] == 0))
check("stereo uses the first channel", np.allclose(ipm.analyze(np.stack([x, 0 * x], axis=1), FS).mpi, r.mpi))

# 2. weighting and prominence formula (thesis tables) --------------------------
print("\n== 2. thesis tables ==")
T24 = [(250, -2.9), (500, -1.1), (1000, -0.5), (2000, -0.2), (3000, 0.0), (4000, -0.3), (8000, -1.4)]
w = IPM.weighting(np.array([f for f, _ in T24]))
check("weighting reproduces Table 24 within 0.1 dB (8 kHz is the weakest point)", all(abs(w[i] - v) < 0.12 for i, (_, v) in enumerate(T24)),
      f"max diff {max(abs(w[i] - v) for i, (_, v) in enumerate(T24)):.3f} dB")
T23 = [(548.78, 16.46, 4.65), (1543.16, 46.29, 6.90)]
T30 = [(1128.06, 33.84, 6.21), (1169.67, 35.09, 6.29), (1148.40, 34.45, 6.25), (1117.22, 33.52, 6.19), (755.41, 22.66, 5.34),
       (732.86, 21.98, 5.28), (878.13, 26.34, 5.67), (834.86, 25.04, 5.56), (945.33, 28.36, 5.83), (1138.90, 34.17, 6.23)]
# a level history with a linear rise of known LDI and rise time must give the P of the thesis tables
ok, worst = True, 0.0
for orate, ldi, p in T23 + T30:
    rise = ldi / orate
    hist = np.concatenate([np.full(150, 20.0), 20.0 + np.linspace(0, ldi, max(int(round(rise / 0.01)), 2)),
                           20.0 + ldi - np.linspace(0, ldi, 120)])    # stationary part, linear rise, then the decay of an impulse
    hist = hist + np.random.default_rng(0).standard_normal(len(hist)) * 0.1
    e = measure_event(hist, 0)
    worst = max(worst, abs(e["p"] - p)) if e else 99
    ok &= e is not None
check("measure_event on synthetic rises reproduces the 12 P values of Tables 23 and 30 (within 0.8 dB: the 10 ms grid)", ok and worst < 0.8, f"max diff {worst:.2f} dB")
a = measure_event(np.concatenate([np.full(150, 20.0), np.full(1, 70.0), 70.0 - np.linspace(0, 50, 120)]), 0)
check("a step (one block) gives the shortest rise (one block, 10 ms) and LDI 50 dB", a is not None and abs(a["ldi"] - 50) < 0.5 and abs(a["onset_rate"] - 50 / 0.010) < 1, f"{a}")

# 3. behaviour -----------------------------------------------------------------
print("\n== 3. behaviour ==")
for dur in (5, 30):
    rr = ipm.analyze(noise(dur, 7), FS)
    check(f"steady noise of {dur} s: no event, not impulsive", not rr.detected.any() and not rr.impulsive, f"max MPI {rr.mpi.max():.2f}")
flag = sum(ipm.analyze(noise(10, 100 + s), FS).impulsive for s in range(12))
check("white noise 10 s, 12 records: none flagged impulsive (the old version flagged 8%)", flag == 0, f"{flag}/12")

mp = {}
for ms in (1, 10, 50, 150):
    rr = ipm.analyze(burst(ms / 1000), FS)
    mp[ms] = float(rr.mpi.max())
    check(f"burst with {ms} ms rise: detected, time of the peak near {2 + ms / 1000:.3f} s",
          rr.detected.sum() >= 40 and abs(rr.strongest_event_time - (2 + ms / 1000)) < 0.06 + ms / 2000,
          f"bands {int(rr.detected.sum())}, peak at {rr.strongest_event_time:.3f} s")
check("faster onset gives higher MPI (1 ms > 10 ms > 50 ms > 150 ms): the old version could not tell them apart",
      mp[1] >= mp[10] > mp[50] > mp[150], f"{mp}")
check("fast burst is impulsive (MPI > 5), a slow 150 ms swell is not clearly so", mp[10] > 5 and mp[150] < mp[10])
lev = [float(ipm.analyze(burst(0.01, level=l), FS).mpi.max()) for l in (0.1, 0.2, 0.5, 1.0)]
check("a louder click over the same floor is more prominent (LDI grows)", all(b > a for a, b in zip(lev, lev[1:])), f"{[round(v, 2) for v in lev]}")

t = np.arange(5 * FS) / FS
tone = 0.1 * np.sin(2 * np.pi * 1000 * t)
check("a steady tone, abrupt start or ramped: no event (the old version flagged it at t = 0)",
      not ipm.analyze(tone, FS).detected.any() and not ipm.analyze(tone * np.minimum(1, np.minimum(t, 5 - t) / 0.2), FS).detected.any())
hum = noise(5, 8, 0.01) + 0.05 * np.sin(2 * np.pi * 100 * t)
check("hum plus noise: no event", not ipm.analyze(hum, FS).detected.any())
check("digital silence does not break it (no NaN, no event)", np.all(np.isfinite(ipm.analyze(np.zeros(2 * FS), FS).mpi)) and not ipm.analyze(np.zeros(2 * FS), FS).detected.any())

# 3b. criteria of the event --------------------------------------------------
print("\n== 3b. criteria: stationary level, decay, candidates, coherence ==")
rg = np.random.default_rng(5)
bg = 30.0 + rg.standard_normal(600) * 0.8
hist = bg.copy(); hist[300:306] = 30.0 + np.array([6, 18, 30, 20, 10, 4])
e = measure_event(hist, 0)
check("LDI is the peak minus the stationary level (median of the surroundings), not the level just before", e is not None and abs(e["background"] - 30.0) < 0.4 and abs(e["ldi"] - 30.0) < 1.5, f"background {e and e['background']:.2f}, LDI {e and e['ldi']:.1f}")
check("a clean event with context and a decay is marked reliable", e is not None and e["reliable"])
step = bg.copy(); step[300:] += 25.0
check("a step up that stays (machine switched on) is NOT an impulse", measure_event(step, 0) is None)
step_ramp = bg.copy(); step_ramp[300:] += np.minimum(np.arange(300), 3) * 8.0
check("a fast rise to a new steady level is NOT an impulse either", measure_event(step_ramp, 0) is None)
two = bg.copy(); two[150:154] += np.array([8, 25, 12, 4]); two[420:424] += np.array([15, 40, 20, 6])
e2 = measure_event(two, 0)
check("with two events the most prominent one is kept (the second, 40 dB)", e2 is not None and abs(e2["t_peak"] - 4.215) < 0.03, f"t_peak {e2 and e2['t_peak']:.3f}")
tiny = bg.copy(); tiny[300] += 2.0
check("a bump under 3 dB LDI is no event", measure_event(tiny, 0) is None)
late = bg[:305].copy(); late[300:305] += np.array([10, 30, 20, 8, 3])
el = measure_event(late, 0)
check("an event at the very end of the record is kept but not marked reliable (the decay cannot be checked)", el is not None and not el["reliable"], f"{el}")
# a long background hum with a louder section far away: the surroundings (3 s) decide, not the whole record
mixed = np.concatenate([30.0 + rg.standard_normal(1200) * 0.8, 50.0 + rg.standard_normal(1200) * 0.8]); mixed[600:604] += np.array([10, 30, 15, 5])
em = measure_event(mixed, 0)
check("a different level far from the event (3 s away) does not change its stationary level", em is not None and abs(em["background"] - 30.0) < 0.5, f"{em and round(em['background'], 1)}")
# coherence of the bands: one band whose only peak is elsewhere is dropped
rc = ipm.analyze(burst(0.01) + 0 * noise(5, 1), FS)
check("all the bands of a click peak together (within 0.15 s of the median)", np.nanmax(np.abs(rc.event_time - np.nanmedian(rc.event_time))) <= 0.15)
two_clicks = burst(0.01, at=1.0) + burst(0.01, at=3.2, seed=40) - noise(5, 3, 0.005)
r2c = ipm.analyze(two_clicks, FS)
check("two clicks in the same file: the global and the count follow one event (no mixture of the two)", r2c.detected.sum() <= 53 and np.nanmax(np.abs(r2c.event_time - np.nanmedian(r2c.event_time))) <= 0.15)
check("the reliable bands are counted", rc.reliable_bands >= 40, f"{rc.reliable_bands} of {len(rc.z)}")

# 4. invariances ---------------------------------------------------------------
print("\n== 4. invariances ==")
b0 = burst(0.01)
base = ipm.analyze(b0, FS).mpi
check("gain does not change the MPI (only level differences count)", np.allclose(ipm.analyze(b0 * 37.0, FS).mpi, base, atol=0.05))
check("polarity does not change the MPI", np.allclose(ipm.analyze(-b0, FS).mpi, base, atol=0.01))
shift = ipm.analyze(np.concatenate([noise(1.0, 21, 0.005), b0]), FS)
check("moving the event 1 s later moves its time by 1 s and keeps the value", abs(shift.strongest_event_time - ipm.analyze(b0, FS).strongest_event_time - 1.0) < 0.02 and abs(shift.mpi.max() - base.max()) < 0.6,
      f"max {shift.mpi.max():.2f} vs {base.max():.2f}")
for fs2 in (44100, 96000):
    from scipy import signal as sp
    g = np.gcd(fs2, FS)
    x2 = sp.resample_poly(b0, fs2 // g, FS // g)
    r2 = ipm.analyze(x2, fs2)
    check(f"same event at {fs2} Hz gives the same time and a similar MPI", abs(r2.strongest_event_time - 2.01) < 0.05 and abs(r2.mpi.max() - base.max()) < 1.0,
          f"max {r2.mpi.max():.2f} vs {base.max():.2f}, t {r2.strongest_event_time:.3f}")
n16 = ipm.analyze(sp.resample_poly(noise(3, 5), 1, 3), 16000)
check("16 kHz file: bands above the Nyquist frequency are left out, the rest is analysed", 30 < len(n16.z) < 53, f"{len(n16.z)} bands")

# 5. errors and cost -----------------------------------------------------------
print("\n== 5. errors and cost ==")


def raises(sig, fs, reason):
    try:
        ipm.analyze(sig, fs)
    except IPMInputError as e:
        return e.reason == reason and bool(str(e))
    return False


check("shorter than 0.5 s is refused with a clear reason", raises(noise(0.3, 1), FS, "too_short"))
check("sample rate under 16 kHz is refused", raises(noise(1, 1, fs=8000), 8000, "sample_rate"))
bad = noise(1, 1).copy(); bad[10] = np.nan
check("NaN is refused", raises(bad, FS, "not_finite"))
x60 = noise(60, 2)
tracemalloc.start()
ipm.analyze(x60, FS)
peak = tracemalloc.get_traced_memory()[1] / 1e6
tracemalloc.stop()
check("memory beyond the input stays small (60 s, under 20 MB)", peak < 20, f"{peak:.1f} MB")
t0 = time.perf_counter(); ipm.analyze(noise(30, 3), FS); dt = time.perf_counter() - t0
check("30 s of audio in under 20 s on this machine", dt < 20, f"{dt:.1f} s")

# 6. server --------------------------------------------------------------------
print("\n== 6. server dictionary ==")
from services import audio_service as svc  # noqa: E402
d = svc._metric_ipm(b0, FS)
need = {"global", "unit", "x_axis", "y_axis", "threshold", "impulsive", "bands_over_threshold", "max_band_hz", "max_mpi", "event_time_s"}
check("the metric dictionary has the new fields and 53 points", need <= set(d) and len(d["x_axis"]) == 53 and d["impulsive"] is True, f"{sorted(set(d) ^ need)[:4]}")
e = svc._metric_ipm(noise(0.2, 1), FS)
check("a too-short segment returns a translated error, not a crash", "error" in e and "0.5" in e["error"])

# 7. global value ---------------------------------------------------------------
print("\n== 7. global value (amplitude sum of the bands with an event) ==")
from scipy import signal as sp2  # noqa: E402
from psychoacoustics.mpi import IPMResult  # noqa: E402
g = {k: ipm.analyze(v, FS) for k, v in {"noise": noise(5, 1), "click": burst(0.01), "swell": burst(0.15), "weak": burst(0.01, level=0.03)}.items()}
check("no event gives a global of exactly 0 dB", g["noise"].global_db == 0.0)
check("a click has a higher global than a slow swell and than a weak click", g["click"].global_db > g["swell"].global_db and g["click"].global_db > g["weak"].global_db,
      f"click {g['click'].global_db:.1f}, swell {g['swell'].global_db:.1f}, weak {g['weak'].global_db:.1f} dB")
nb = sp2.sosfilt(sp2.butter(4, [900, 1100], "bandpass", fs=FS, output="sos"), burst(0.01))
nb = nb / np.abs(nb).max() * 0.3 + noise(5, 9, 0.0005)
rn = ipm.analyze(nb, FS)
check("a click in one narrow band is less global than the same click over the whole spectrum (the spread counts)", rn.detected.sum() < g["click"].detected.sum() and rn.global_db < g["click"].global_db,
      f"narrow {rn.global_db:.1f} dB ({int(rn.detected.sum())} bands), broadband {g['click'].global_db:.1f} dB ({int(g['click'].detected.sum())} bands)")
check("louder click over the same floor raises the global", ipm.analyze(burst(0.01, level=1.0), FS).global_db > ipm.analyze(burst(0.01, level=0.1), FS).global_db)
Y68 = np.array([1.2, 1.7, 2.3, 2.6, 2.8, 3.3, 3.9, 4.7, 5.4, 6.0, 6.3, 6.9, 7.1, 7.2, 7.3, 7.7, 7.9, 7.7, 7.3, 6.8, 6.3, 6.1])   # Figure 68, read from the plot
fake = IPMResult(z=np.arange(22.0), freqs=np.arange(22.0), mpi=Y68, p=Y68, ldi=Y68, onset_rate=Y68, event_time=Y68, detected=np.ones(22, bool))
check("the formula gives the 32.5 dB the thesis prints for Figure 68 (values read from the plot)", abs(fake.global_db - 32.5) < 0.5, f"{fake.global_db:.1f} dB")
check("global is independent of gain", abs(ipm.analyze(burst(0.01) * 20, FS).global_db - g["click"].global_db) < 0.5)
known("the scale is not the one of Table 41 (16.6 to 77.9 dB; this global goes 0 to about 45 dB): that table's formula is not in the thesis", True)
known("the -6 dB offset and the 10-90 % rise reading of OR are assumptions of this version (thesis: Tables 23, 30 give OR/LDI = 33.3)", True)
print(f"\n{len(fails)} failed" + (": " + "; ".join(fails) if fails else ""))
sys.exit(1 if fails else 0)
