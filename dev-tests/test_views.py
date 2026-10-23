import json
import sys
import time
import warnings
from pathlib import Path

warnings.filterwarnings("ignore")
sys.path.insert(0, ".")
import numpy as np

from services import audio_service as svc
from services.session_store import AudioEntry

SR = 48000
rng = np.random.default_rng(1)


def entry(x):
    return AudioEntry(audio_id="x", name="t", sample_rate=SR, channels=1,
                      duration_s=len(x) / SR, data=x.astype(np.float64), raw_path=Path("x.wav"))


t = np.arange(10 * SR) / SR
fails = 0


def check(name, ok, detail):
    global fails
    fails += 0 if ok else 1
    print(("PASS " if ok else "FAIL ") + name + " -> " + detail)


# 1) tone in the spectrum
tone = 0.5 * np.sin(2 * np.pi * 3217.3 * t)
n = len(tone)
true_peak = (20 * np.log10(np.abs(np.fft.rfft(tone * np.hanning(n))) / (n / 2) + 1e-12)).max()
sp = svc.compute_spectrum(entry(tone))
shown = max(sp["magnitude_db"])
fpk = sp["freqs"][int(np.argmax(sp["magnitude_db"]))]
check("spectrum tone level", abs(shown - true_peak) < 0.1, f"true {true_peak:.2f} dBFS, plotted {shown:.2f} dBFS")
check("spectrum tone frequency", abs(fpk - 3217.3) < 25, f"plotted at {fpk:.1f} Hz")
check("spectrum size", len(sp["freqs"]) <= 2500 and "channels" not in sp, f"{len(sp['freqs'])} points, one curve for a mono file")
check("spectrum monotonic x", bool(np.all(np.diff(sp["freqs"]) > 0)), "freqs strictly increasing")

# 1b) stereo: one curve per channel, each with its own tone
st2 = entry(tone)
st2.data = np.stack([tone, 0.1 * np.sin(2 * np.pi * 1000.0 * t)], axis=1)
sps = svc.compute_spectrum(st2)
chs = sps.get("channels", [])
fl = np.array(sps["freqs"])
peaks = [fl[int(np.argmax(c["magnitude_db"]))] for c in chs]
check("stereo spectrum has L and R", [c["name"] for c in chs] == ["L", "R"] and abs(peaks[0] - 3217.3) < 25 and abs(peaks[1] - 1000.0) < 25, f"peaks at {peaks} Hz")
check("stereo magnitude_db is the left channel", sps["magnitude_db"] == chs[0]["magnitude_db"], "same curve")

# 2) click and clipping in the waveform
sig = 0.01 * rng.standard_normal(10 * SR)
sig[123457] = 0.95
wf = svc.compute_waveform(entry(sig))
check("waveform click", max(np.abs(wf["amplitude"])) >= 0.95 - 1e-6, f"true 0.95, plotted {max(np.abs(wf['amplitude'])):.2f}")
cl = 0.3 * np.sin(2 * np.pi * 50 * t)
cl[200000:200010] = 1.0
wfc = svc.compute_waveform(entry(cl))
check("waveform clipping", max(wfc["amplitude"]) >= 1.0 - 1e-6 and wfc["peak"] == 1.0, f"true 1.00, plotted {max(wfc['amplitude']):.2f}, peak field {wfc['peak']}")
check("waveform points", len(wfc["t"]) <= 8000 and len(wfc["t"]) == len(wfc["amplitude"]), f"{len(wfc['t'])} points")
check("waveform time order", bool(np.all(np.diff(wfc["t"]) >= 0)), "t non-decreasing")
check("waveform span", abs(wfc["t"][-1] - 10.0) < 0.01 and wfc["t"][0] < 0.01, f"t from {wfc['t'][0]:.4f} to {wfc['t'][-1]:.4f}")

# short signal path (no reduction)
short = entry(0.1 * np.sin(2 * np.pi * 440 * np.arange(1000) / SR))
ws = svc.compute_waveform(short)
check("short waveform untouched", len(ws["t"]) == 1000, f"{len(ws['t'])} samples")
ss = svc.compute_spectrum(short)
check("short spectrum untouched", len(ss["freqs"]) == 501, f"{len(ss['freqs'])} bins")

# 3) envelope view
env = svc.compute_envelope(entry(cl), smoothing_ms=0)
lens = {k: len(v) for k, v in env.items()}
check("envelope arrays aligned", lens["t"] == lens["signal"] == lens["envelope"], str(lens))
check("envelope keeps clipping", max(env["signal"]) >= 1.0 - 1e-6, f"signal max {max(env['signal']):.2f}")
amp = 0.5 * (1 + 0.8 * np.sin(2 * np.pi * 7 * t)) * np.sin(2 * np.pi * 1000 * t)
env2 = svc.compute_envelope(entry(amp))
fe = np.array(env2["f_env"]); es = np.array(env2["env_spec_db"])
band = (fe > 3) & (fe < 20)
check("envelope spectrum finds 7 Hz modulation", abs(fe[band][np.argmax(es[band])] - 7) < 0.5, f"peak at {fe[band][np.argmax(es[band])]:.2f} Hz")

# payload size
sz = lambda o: len(json.dumps(o)) / 1e3
print(f"payload: waveform {sz(wfc):.0f} KB, spectrum {sz(sp):.0f} KB, envelope {sz(env):.0f} KB")
t0 = time.time(); svc.compute_spectrum(entry(0.3 * rng.standard_normal(60 * SR))); print(f"spectrum of 60 s: {time.time()-t0:.2f} s")
print("FAILS:", fails)
