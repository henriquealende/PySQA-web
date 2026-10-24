"""Statistics of a metric over time. Run with the backend venv from the backend folder."""
import os
import sys
import warnings

warnings.filterwarnings("ignore")
import numpy as np

sys.path.insert(0, os.getcwd())
from utils.series_stats import series_statistics

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail) if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


print("== series_statistics ==")
t = np.arange(0, 10, 0.01)
ramp = np.linspace(0, 100, len(t))
s = series_statistics(t, ramp)
check("mean, min and max of a ramp", abs(s["mean"] - 50) < 0.1 and s["min"] == 0 and abs(s["max"] - 100) < 1e-9, f"{s['mean']:.2f} {s['min']} {s['max']}")
check("N5 is the value exceeded in 5 % of the time (95th percentile)", abs(s["exceeded"]["5"] - 95) < 0.2, s["exceeded"]["5"])
check("N95 is exceeded in 95 % of the time (5th percentile)", abs(s["exceeded"]["95"] - 5) < 0.2, s["exceeded"]["95"])
check("N50 is the median", abs(s["exceeded"]["50"] - 50) < 0.2)
ex = [s["exceeded"][k] for k in ("5", "10", "50", "90", "95")]
check("the exceeded values fall as the share of time grows", ex == sorted(ex, reverse=True), ex)
check("time of the maximum is the end of the ramp", abs(s["t_max"] - t[-1]) < 1e-9 and s["t_min"] == t[0])
check("duration is the span of the series", abs(s["duration_s"] - (t[-1] - t[0])) < 1e-9)
check("a constant series has no spread", series_statistics(t, np.full(len(t), 3.0))["std"] == 0)

peak = np.full(len(t), 1.0)
peak[500] = 20.0
sp = series_statistics(t, peak)
check("one short peak sets the max and its time but not N5", sp["max"] == 20.0 and abs(sp["t_max"] - t[500]) < 1e-9 and sp["exceeded"]["5"] == 1.0)

dirty = ramp.copy()
dirty[[3, 40, 700]] = [np.nan, np.inf, -np.inf]
sd = series_statistics(t, dirty)
check("points that are not finite are left out", sd is not None and sd["n"] == len(t) - 3 and np.isfinite(sd["mean"]), sd and sd["n"])
check("too few points give no statistics", series_statistics([0, 1], [1, 2]) is None and series_statistics([], []) is None)
check("mismatched lengths use the shorter one", series_statistics(t[:50], ramp)["n"] == 50)
check("everything is plain float / int (JSON friendly)", all(isinstance(v, (int, float)) for k, v in s.items() if k != "exceeded") and all(isinstance(v, float) for v in s["exceeded"].values()))

print("\n== inside the metric result ==")
from services import audio_service as svc
r = {"time_data": {"t": t.tolist(), "values": ramp.tolist()}}
svc._add_statistics(r)
check("a result with a time series gets stats", "stats" in r and r["stats"]["n"] == len(t))
r2 = {"global": 3.0}
svc._add_statistics(r2)
check("a result without a time series gets none", "stats" not in r2)
r3 = {"time_data": {"t": [0, 1], "values": [1, 2]}}
svc._add_statistics(r3)
check("a series that is too short gets none", "stats" not in r3)

# a real metric on a real signal: loudness of noise whose level steps up halfway
fs = 48000
rng = np.random.default_rng(1)
x = rng.standard_normal(fs * 4) * 0.02
x[fs * 2:] *= 4
try:
    mono = x.astype("float32")
    res = svc._dispatch_metric(mono, fs, "loudness_zwk")
    svc._add_statistics(res)
    st = res.get("stats")
    check("loudness ZWK of a noise that gets 12 dB louder: stats present", st is not None, list(res.keys()))
    if st:
        check("N5 above N95 (the level changes)", st["exceeded"]["5"] > st["exceeded"]["95"] * 1.5, f"N5 {st['exceeded']['5']:.2f}  N95 {st['exceeded']['95']:.2f}")
        check("the maximum is in the louder half", st["t_max"] > 2.0, f"t_max {st['t_max']:.2f}")
        check("max is not below the global value", st["max"] >= res["global"] * 0.99, f"max {st['max']:.2f} global {res['global']:.2f}")
except Exception as e:
    check("loudness ZWK runs (mosqito installed)", False, repr(e))

print(f"\n{'ALL PASSED' if not fails else 'FAILED: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
