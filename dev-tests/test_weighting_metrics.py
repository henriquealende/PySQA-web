"""A/C weighting against IEC 61672-1 and the sound-field option of the psychoacoustic metrics.

Run from the backend folder:  .venv\\Scripts\\python.exe ..\\dev-tests\\test_weighting_metrics.py
No server is needed.
"""
import os
import sys
import warnings

import numpy as np

warnings.filterwarnings("ignore")
sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.getcwd())

from processing.filtering import apply_weighting   # noqa: E402
import services.audio_service as svc               # noqa: E402

FAILS = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" -> {detail}" if detail != "" else ""))
    if not ok:
        FAILS.append(name)


# IEC 61672-1:2013, table 3 (nominal values, dB)
A_TABLE = {63: -26.2, 100: -19.1, 250: -8.6, 1000: 0.0, 2000: 1.2, 4000: 1.0, 8000: -1.1, 10000: -2.5}
C_TABLE = {63: -0.8, 100: -0.3, 250: 0.0, 1000: 0.0, 4000: -0.8, 8000: -3.0, 10000: -4.4}

for fs in (44100, 48000, 96000):
    t = np.arange(fs * 3) / fs
    worst = 0.0
    for curve, table in (("A", A_TABLE), ("C", C_TABLE)):
        for f, expect in table.items():
            x = np.sin(2 * np.pi * f * t)
            y = apply_weighting(x, fs, curve)
            sl = slice(fs // 2, -fs // 2)
            gain = 20 * np.log10(np.sqrt(np.mean(y[sl] ** 2)) / np.sqrt(np.mean(x[sl] ** 2)))
            worst = max(worst, abs(gain - expect))
    check(f"A and C weighting at {fs} Hz follow the IEC 61672-1 table within 0.2 dB", worst < 0.2, f"worst {worst:.3f} dB")

x2 = np.random.default_rng(0).standard_normal((48000, 2))
check("weighting keeps the shape of a 2-channel signal", apply_weighting(x2, 48000, "A").shape == (48000, 2))
try:
    apply_weighting(x2, 48000, "B")
    check("an unknown curve is refused", False)
except ValueError:
    check("an unknown curve is refused", True)

# the 1/3-octave analysis with A weighting: a 100 Hz tone must read 19.1 dB lower than without
sr = 48000
t = np.arange(sr * 3) / sr
x = 0.1 * np.sin(2 * np.pi * 100 * t)
from pathlib import Path   # noqa: E402
from services.session_store import AudioEntry   # noqa: E402

entry = AudioEntry(audio_id="x", name="x", sample_rate=sr, channels=1, duration_s=3.0,
                   data=x.astype("float32").reshape(-1, 1), raw_path=Path("x"))
z = svc.compute_octave_bands(entry, "Z")
a = svc.compute_octave_bands(entry, "A")
i100 = z["centres_hz"].index(100)
diff = a["levels_db"][i100] - z["levels_db"][i100]
check("1/3-octave A weighting lowers a 100 Hz tone by 19.1 dB", abs(diff + 19.1) < 0.4, f"{diff:.2f} dB")

# sound field option
rng = np.random.default_rng(0)
noise = 0.02 * rng.standard_normal(sr * 2) + 0.05 * np.sin(2 * np.pi * 1000 * np.arange(sr * 2) / sr)
f_sharp = svc._metric_sharpness(noise, sr, diffuse=False)["global"]
d_sharp = svc._metric_sharpness(noise, sr, diffuse=True)["global"]
check("sharpness DIN 45692 depends on the sound field", f_sharp != d_sharp, f"free {f_sharp} diffuse {d_sharp}")
f_loud = svc._metric_loudness_zwk(noise, sr, diffuse=False, compute_time_varying=False)["global"]
d_loud = svc._metric_loudness_zwk(noise, sr, diffuse=True, compute_time_varying=False)["global"]
check("loudness ISO 532-1 depends on the sound field", f_loud != d_loud, f"free {f_loud} diffuse {d_loud}")

# tonality (ECMA-418-2, Sottek Hearing Model): a 60 dB SPL tone at 1 kHz is about 2 tu_HMS, nowhere near billions
try:
    import sottek_hearing_model  # noqa: F401
    tone = 20e-6 * 10 ** (60 / 20) * np.sqrt(2) * np.sin(2 * np.pi * 1000 * np.arange(sr * 3) / sr)
    tf = svc._metric_tonality(tone, sr, diffuse=False)
    td = svc._metric_tonality(tone, sr, diffuse=True)
    check("tonality of a 60 dB, 1 kHz tone is of the order of 2 tu", 1.0 < tf.get("global", 0) < 4.0, tf.get("global"))
    check("tonality depends on the sound field", tf.get("global") != td.get("global"), f"{tf.get('global')} vs {td.get('global')}")
except ImportError:
    r = svc._metric_tonality(noise, sr)
    check("without the Sottek package tonality answers with a clear message", "error" in r and "sottek" in r["error"].lower(), r)

# loudness adjustment must land on the reference loudness (a plain amplitude ratio left it 32 % short)
tt = np.arange(sr * 2) / sr
src_e = AudioEntry(audio_id="s", name="s", sample_rate=sr, channels=1, duration_s=2.0,
                   data=(0.02 * np.sin(2 * np.pi * 1000 * tt)).astype("float32").reshape(-1, 1), raw_path=Path("s"))
ref_e = AudioEntry(audio_id="r", name="r", sample_rate=sr, channels=1, duration_s=2.0,
                   data=(0.1 * np.sin(2 * np.pi * 1000 * tt)).astype("float32").reshape(-1, 1), raw_path=Path("r"))
adj = svc.apply_loudness_adj_to_entry(src_e, ref_e)


def stationary_n(e):
    return svc._metric_loudness_zwk(svc._mono(e.data), sr, diffuse=False, compute_time_varying=False)["global"]


n_ref, n_adj = stationary_n(ref_e), stationary_n(adj)
check("loudness adjustment reaches the reference loudness within 1 %", abs(n_adj / n_ref - 1) < 0.01, f"ref {n_ref} adjusted {n_adj}")
src_e2 = AudioEntry(audio_id="s2", name="s2", sample_rate=sr, channels=1, duration_s=2.0,
                    data=(0.3 * np.sin(2 * np.pi * 1000 * tt)).astype("float32").reshape(-1, 1), raw_path=Path("s2"))
adj2 = svc.apply_loudness_adj_to_entry(src_e2, ref_e)
check("loudness adjustment also turns a louder file down", abs(stationary_n(adj2) / n_ref - 1) < 0.01, f"{stationary_n(adj2)} vs {n_ref}")

print("FAILS:", len(FAILS), FAILS)
sys.exit(1 if FAILS else 0)
