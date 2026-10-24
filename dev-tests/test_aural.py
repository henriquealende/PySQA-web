"""Audio Preparation (phases 1 to 3: HRTF, room responses, quick scenes, headphone, level) checks. Run with the backend venv from the backend folder:

    cd backend
    .venv\\Scripts\\python.exe ..\\dev-tests\\test_aural.py

The first part needs no server; the API part starts its own on port 8350 with a temporary session folder.
"""
import io
import os
import sys
import tempfile
import warnings

warnings.filterwarnings("ignore")
os.environ["PYSQA_TMP_DIR"] = tempfile.mkdtemp(prefix="pysqa_aural_")
sys.path.insert(0, os.getcwd())

import h5py
import numpy as np
import soundfile as sf

fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail) if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


def make_sofa(fs=48000, taps=64, dirs=((0, 0), (90, 0), (-90, 0)), lag=None, delay_field=None):
    """A SimpleFreeFieldHRIR file in memory. `dirs` are SOFA azimuths (counter-clockwise, to the LEFT), elevation.
    The ear nearer to the source gets a unit impulse at sample 0, the other ear at sample `lag`."""
    lag = lag or {}
    m = len(dirs)
    ir = np.zeros((m, 2, taps))
    for i, (az, el) in enumerate(dirs):
        late = lag.get(az, 0)
        left_near = az > 0                                 # SOFA +90 = left
        ir[i, 0, late if (not left_near and az != 0) else 0] = 1.0
        ir[i, 1, late if (left_near and az != 0) else 0] = 0.5 if az != 0 else 1.0
        if az > 0:
            ir[i, 0, 0] = 1.0
    buf = io.BytesIO()
    with h5py.File(buf, "w") as f:
        f.attrs["SOFAConventions"] = "SimpleFreeFieldHRIR"
        f.create_dataset("Data.IR", data=ir)
        f.create_dataset("Data.SamplingRate", data=np.array([float(fs)]))
        pos = f.create_dataset("SourcePosition", data=np.array([[a, e, 1.5] for a, e in dirs], dtype=float))
        pos.attrs["Type"] = "spherical"
        if delay_field is not None:
            f.create_dataset("Data.Delay", data=np.array([delay_field], dtype=float))
    return buf.getvalue()


from auralization import chain as C, hrtf as H
from auralization.sofa_io import read_sofa, SofaError

# ── The model (spherical head) ────────────────────────────────────────────────
fs = 48000
hr90 = H.spherical_head_hrir(90, 0, fs)
hr0 = H.spherical_head_hrir(0, 0, fs)
hrm90 = H.spherical_head_hrir(-90, 0, fs)
woodworth = 0.0875 / 343.0 * (np.pi / 2 + 1.0) * 1000
check("model: ITD at +90 deg close to Woodworth", abs(H.itd_ms(hr90, fs) - woodworth) < 0.05, f"{H.itd_ms(hr90, fs):.3f} ms vs {woodworth:.3f}")
check("model: ITD > 0 for a source on the right, < 0 on the left", H.itd_ms(hr90, fs) > 0.3 and H.itd_ms(hrm90, fs) < -0.3)
check("model: ITD ~ 0 in front", abs(H.itd_ms(hr0, fs)) < 0.01, f"{H.itd_ms(hr0, fs):.4f}")
f, db = H.magnitude_db(hr90, fs)
hf = (f > 4000) & (f < 10000)
check("model: near (right) ear louder than far ear above 4 kHz", db[1][hf].mean() - db[0][hf].mean() > 6, f"{db[1][hf].mean() - db[0][hf].mean():.1f} dB")
lf = f < 200
check("model: both ears equal at low frequency (0 dB at DC)", abs(db[0][lf].mean() - db[1][lf].mean()) < 1.5)
f0, db0 = H.magnitude_db(hr0, fs)
check("model: left and right equal in front", np.max(np.abs(db0[0] - db0[1])) < 0.05)

# ── SOFA reader and the direction convention ──────────────────────────────────
hs = read_sofa(make_sofa(), "t.sofa")
check("sofa: shape and rate", hs.ir.shape == (3, 2, 64) and hs.fs == 48000, hs.ir.shape)
check("sofa: SOFA +90 (left) is -90 in the app (right is positive)", sorted(np.round(hs.azimuth).tolist()) == [-90.0, 0.0, 90.0] and hs.azimuth[1] == -90)
ir, az, el = H.pick(hs, 80, 5)
check("pick: app +80 deg (right) chooses the right-side measurement", az == 90.0, az)
check("pick: right side -> right ear has the earlier impulse", np.argmax(np.abs(ir[1])) <= np.argmax(np.abs(ir[0])))
try:
    read_sofa(b"not a sofa", "bad.sofa")
    check("sofa: garbage rejected", False)
except SofaError:
    check("sofa: garbage rejected", True)

# a delay field is applied as a shift
hd = read_sofa(make_sofa(dirs=((0, 0),), delay_field=[10, 20]), "d.sofa")
check("sofa: Data.Delay shifts each ear", np.argmax(hd.ir[0, 0]) == 10 and np.argmax(hd.ir[0, 1]) == 20, (np.argmax(hd.ir[0, 0]), np.argmax(hd.ir[0, 1])))

# ── Sample rate: the interaural delay survives resampling ─────────────────────
lagged = read_sofa(make_sofa(fs=44100, taps=128, dirs=((90, 0),), lag={90: 20}), "r.sofa")
ir441, _, _ = H.hrir_for(lagged, -90, 0, 44100)
ir48, _, _ = H.hrir_for(lagged, -90, 0, 48000)
check("resample: ITD kept between 44.1 and 48 kHz", abs(abs(H.itd_ms(ir441, 44100)) - abs(H.itd_ms(ir48, 48000))) < 0.05,
      (H.itd_ms(ir441, 44100), H.itd_ms(ir48, 48000)))

# ── Chain ─────────────────────────────────────────────────────────────────────
rng = np.random.default_rng(1)
x = 0.1 * rng.standard_normal(4800)
delta = read_sofa(make_sofa(dirs=((0, 0),)), "delta.sofa")
res = C.render(x, 48000, C.Chain(hrtf=C.HrtfStep(asset="a", azimuth=0)), lambda a: delta)
check("chain: length = signal + taps - 1", res.data.shape == (4800 + 64 - 1, 2), res.data.shape)
check("chain: unit impulse HRIR gives back the signal (both ears)", np.allclose(res.data[:4800, 0], x, atol=1e-6) and np.allclose(res.data[:4800, 1], x, atol=1e-6))
res2 = C.render(x, 48000, C.Chain(hrtf=C.HrtfStep(asset="a", distance_m=2.0)), lambda a: delta)
check("chain: 2 m = -6 dB relative to 1 m", abs(20 * np.log10(np.std(res2.data[:4800, 0]) / np.std(x)) + 6.02) < 0.1)
res3 = C.render(x, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False)), lambda a: None)
check("chain: HRTF off gives identical channels", np.array_equal(res3.data[:, 0], res3.data[:, 1]) and res3.data.shape == (4800, 2))
loud = C.render(5.0 * x / np.max(np.abs(x)), 48000, C.Chain(hrtf=C.HrtfStep(enabled=False)), lambda a: None)
check("chain: peak above 0 dBFS is reported, not hidden", loud.peak_dbfs > 13 and len(loud.notes) == 1 and np.max(np.abs(loud.data)) > 4.9)
try:
    C.render(x, 48000, C.Chain(hrtf=C.HrtfStep(asset="gone")), lambda a: None)
    check("chain: missing asset raises", False)
except C.ChainError:
    check("chain: missing asset raises", True)

# ── Phase 2: room responses ───────────────────────────────────────────────────
from auralization import rir as R
from auralization.rir import RirError, read_rir


def exp_rir(rt60=0.6, secs=1.5, fs=48000, seed=3, floor_db=None):
    rng = np.random.default_rng(seed)
    t = np.arange(int(secs * fs)) / fs
    h = rng.standard_normal(len(t)) * np.exp(-np.log(1000.0) * t / rt60)
    if floor_db is not None:
        h = h + rng.standard_normal(len(t)) * 10 ** (floor_db / 20) * np.max(np.abs(h))
    return (h / np.max(np.abs(h)) * 0.9).astype("float32")


def wav_of(x, fs=48000):
    b = io.BytesIO()
    sf.write(b, x, fs, format="WAV", subtype="FLOAT")
    return b.getvalue()


rs = read_rir(wav_of(exp_rir(0.6)), "exp.wav")
m = rs.metrics
check("rir: T20 close to the true 0.6 s", abs(m["rt60_t20"] - 0.6) < 0.06, m["rt60_t20"])
check("rir: T30 close to the true 0.6 s", abs(m["rt60_t30"] - 0.6) < 0.06, m["rt60_t30"])
check("rir: EDT close to the true 0.6 s", abs(m["edt"] - 0.6) < 0.09, m["edt"])
d50_true = 100 * (1 - np.exp(-13.8155 * 0.05 / 0.6))
check("rir: D50 matches the exponential decay", abs(m["d50"] - d50_true) < 4, (m["d50"], d50_true))
c50_true = 10 * np.log10((d50_true / 100) / (1 - d50_true / 100))
check("rir: C50 matches the exponential decay", abs(m["c50"] - c50_true) < 1.2, (m["c50"], c50_true))
check("rir: octave bands of a flat decay are all near 0.6 s", all(v is not None and abs(v - 0.6) < 0.12 for v in rs.bands.values()) and len(rs.bands) == 6, rs.bands)
check("rir: decay curve starts at 0 dB and falls", rs.decay["db"][0] > -1 and rs.decay["db"][-1] < -50 and len(rs.decay["t"]) <= 410)
noisy = read_rir(wav_of(exp_rir(0.6, secs=2.0, floor_db=-65)), "noisy.wav")
check("rir: a noise floor 65 dB down does not wreck T20", abs(noisy.metrics["rt60_t20"] - 0.6) < 0.1, noisy.metrics["rt60_t20"])
check("rir: longer room, longer T20", read_rir(wav_of(exp_rir(1.2, secs=3.0)), "l.wav").metrics["rt60_t20"] > 1.0)
for label, payload in (("3 channels", wav_of(np.ones((4800, 3), dtype="float32") * 0.1)),
                       ("31 s", wav_of(np.ones(48000 * 31, dtype="float32") * 0.1)),
                       ("silence", wav_of(np.zeros(4800, dtype="float32"))),
                       ("garbage", b"nope")):
    try:
        read_rir(payload, "bad.wav")
        check(f"rir: {label} rejected", False)
    except RirError:
        check(f"rir: {label} rejected", True)

# decorrelation keeps spectrum and decay, changes the waveform
tailx = exp_rir(0.5, secs=1.0).astype(np.float64)
dl, dr = R.decorrelate(tailx, 11, 10.0, 48000), R.decorrelate(tailx, 12, 10.0, 48000)
cc = float(np.corrcoef(dl, dr)[0, 1])
check("decorrelate: the two ears get different reverberation", abs(cc) < 0.35, cc)
check("decorrelate: energy kept within 1 dB", abs(10 * np.log10(np.sum(dl ** 2) / np.sum(tailx ** 2))) < 1.0)
h1, h2 = np.sum(dl[:24000] ** 2), np.sum(dl[24000:] ** 2)
o1, o2 = np.sum(tailx[:24000] ** 2), np.sum(tailx[24000:] ** 2)
check("decorrelate: decay envelope kept", abs(10 * np.log10(h1 / h2) - 10 * np.log10(o1 / o2)) < 1.0)

# chain with a room
from auralization.rir import RirSet
fs = 48000
xs = 0.1 * np.random.default_rng(5).standard_normal(4800)


def mk(ir2d, name="r"):
    ir2d = np.asarray(ir2d, dtype=np.float32)
    ir2d = ir2d if ir2d.ndim == 2 else ir2d[:, None]
    return RirSet(name=name, fs=48000.0, ir=ir2d, channels=ir2d.shape[1], duration_s=len(ir2d) / 48000.0)


delta1 = np.zeros(2400)
delta1[0] = 1.0
env_off = C.Chain(hrtf=C.HrtfStep(enabled=False), environment=C.EnvironmentStep(type="rir", asset="r"))
res = C.render(xs, fs, env_off, lambda a: None, lambda a: mk(delta1))
check("chain room: a delta RIR leaves the signal as it is", np.allclose(res.data[:4800, 0], xs, atol=1e-5) and np.allclose(res.data[:4800, 1], xs, atol=1e-5))

bir = np.zeros((2400, 2))
bir[0, 0] = 1.0
bir[20, 1] = 0.5
res = C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(enabled=True), environment=C.EnvironmentStep(type="brir", asset="b")), lambda a: delta, lambda a: mk(bir))
k_en = (1.0 / ((1.0 + 0.25) / 2.0)) ** 0.5            # energy kept equal to a unit impulse: the level difference between the ears stays 2:1
check("chain BRIR: right = half the left, 20 samples later, level scaled to keep the energy",
      np.allclose(res.data[:4800, 0], k_en * xs, atol=1e-5) and np.allclose(res.data[20:4820, 1], 0.5 * k_en * xs, atol=1e-5))
check("chain BRIR: warns that the HRTF was ignored", len(res.notes) == 1)

room = np.zeros(24000)
room[100] = 1.0
room[3000:] = 0.2 * np.random.default_rng(9).standard_normal(21000) * np.exp(-np.arange(21000) / 6000)
res0 = C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(asset="a"), environment=C.EnvironmentStep(type="rir", asset="r", reverb_gain_db=0)), lambda a: delta, lambda a: mk(room))
res20 = C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(asset="a"), environment=C.EnvironmentStep(type="rir", asset="r", reverb_gain_db=-20)), lambda a: delta, lambda a: mk(room))
late0, late20 = res0.data[5000:, 0], res20.data[5000:, 0]       # after the source has ended: reverberation only
check("chain room: reverberation level -20 dB lowers the late part by 20 dB", abs(10 * np.log10(np.sum(late20 ** 2) / np.sum(late0 ** 2)) + 20) < 0.5)
check("chain room: the direct part is untouched by the reverberation gain", np.allclose(res0.data[:100, 0], res20.data[:100, 0], atol=1e-6))
check("chain room: the two ears differ in the reverberant part", abs(float(np.corrcoef(res0.data[3000:9000, 0], res0.data[3000:9000, 1])[0, 1])) < 0.5)
e_in = float(np.sum(xs ** 2))
check("chain room: loudness kept (output energy about the input energy, within 2 dB, white source)", abs(10 * np.log10(np.sum(res0.data[:, 0] ** 2) / e_in)) < 2.0, 10 * np.log10(np.sum(res0.data[:, 0] ** 2) / e_in))
check("chain room: the output holds the whole tail", res0.data.shape[0] > 4800 + 15000, res0.data.shape)
try:
    C.render(xs, fs, C.Chain(environment=C.EnvironmentStep(type="rir", asset="gone")), lambda a: delta, lambda a: None)
    check("chain room: missing response raises", False)
except C.ChainError:
    check("chain room: missing response raises", True)
mono_brir = C.Chain(hrtf=C.HrtfStep(enabled=False), environment=C.EnvironmentStep(type="brir", asset="m"))
try:
    C.render(xs, fs, mono_brir, lambda a: None, lambda a: mk(delta1))
    check("chain room: a 1-channel BRIR is refused", False)
except C.ChainError:
    check("chain room: a 1-channel BRIR is refused", True)
res44 = C.render(xs, fs, env_off, lambda a: None, lambda a: RirSet(name="x", fs=44100.0, ir=np.pad(np.ones((1, 1), dtype=np.float32), ((0, 2000), (0, 0))), channels=1, duration_s=0.05))
check("chain room: a response at another sample rate is resampled (signal comes back)", float(np.corrcoef(res44.data[:4800, 0], xs)[0, 1]) > 0.97 and abs(20 * np.log10(np.std(res44.data[:4800, 0]) / np.std(xs))) < 0.5)

# ── Quick scenes: synthetic rooms and background noise ───────────────────────
from auralization import rir_synth as RS, noise as NZ

flat05 = {125: 0.5, 250: 0.5, 500: 0.5, 1000: 0.5, 2000: 0.5, 4000: 0.5}
sy = RS.synth_rirset("flat", 48000, flat05, 30.0, 2.0)
check("synth: T20 close to the 0.5 s asked for", abs(sy.metrics["rt60_t20"] - 0.5) < 0.06, sy.metrics["rt60_t20"])
check("synth: every octave band close to 0.5 s", all(v is not None and abs(v - 0.5) < 0.1 for v in sy.bands.values()) and len(sy.bands) == 6, sy.bands)
tilt = {125: 0.9, 250: 0.8, 500: 0.6, 1000: 0.5, 2000: 0.35, 4000: 0.25}
st_ = RS.synth_rirset("tilt", 48000, tilt, 30.0, 2.0)
okb = all(st_.bands[str(b)] is not None and abs(st_.bands[str(b)] - tilt[b]) < 0.2 * tilt[b] + 0.03 for b in tilt)
check("synth: a falling reverberation time per band is followed", okb, st_.bands)
h = RS.synth_rir(48000, flat05, 30.0, 2.0)
delay = int(round(2.0 / 343.0 * 48000))
check("synth: the direct impulse arrives after the travel time", int(np.argmax(np.abs(h))) == delay and abs(h[delay] - 1.0) < 0.2, (np.argmax(np.abs(h)), delay))
dc = RS.critical_distance(30.0, 0.5)
ratio = float(np.sum(h[delay + 1:].astype(np.float64) ** 2) / 1.0)
check("synth: tail energy over direct energy equals (r / critical distance)^2", abs(10 * np.log10(ratio / (2.0 / dc) ** 2)) < 0.6, (ratio, (2.0 / dc) ** 2))
near = RS.synth_rir(48000, flat05, 30.0, 0.5)
check("synth: a closer source has a weaker tail relative to the direct sound", np.sum(near[int(round(0.5 / 343 * 48000)) + 1:] ** 2) < ratio)
check("synth: same seed gives the same response, another seed a different one",
      np.array_equal(h, RS.synth_rir(48000, flat05, 30.0, 2.0)) and not np.array_equal(h, RS.synth_rir(48000, flat05, 30.0, 2.0, seed=7)))
car_rt = {125: 0.12, 250: 0.09, 500: 0.07, 1000: 0.06, 2000: 0.05, 4000: 0.045}
carr = RS.synth_rir(48000, car_rt, 3.0, 0.8)
check("synth: a car-cabin response is short (well under half a second)", len(carr) < 0.5 * 48000, len(carr))
check("synth: 44.1 kHz and 16 kHz both work", len(RS.synth_rir(44100, flat05, 30.0, 2.0)) > 0 and len(RS.synth_rir(16000, flat05, 30.0, 2.0)) > 0)

def psd_slope(x, fs, f_lo=100.0, f_hi=10000.0):
    f = np.fft.rfftfreq(len(x), 1 / fs)
    p = np.abs(np.fft.rfft(x)) ** 2
    nb = 40                                         # smooth in log-spaced bins
    edges = np.geomspace(f_lo, f_hi, nb + 1)
    fc, pc = [], []
    for a_, b_ in zip(edges[:-1], edges[1:]):
        sel = (f >= a_) & (f < b_)
        fc.append(np.sqrt(a_ * b_))
        pc.append(p[sel].mean())
    return float(np.polyfit(np.log10(fc), np.log10(pc), 1)[0])

for color, expected in (("white", 0.0), ("pink", -1.0), ("brown", -2.0)):
    nx = NZ.coloured_noise(48000 * 8, 48000, color, 1)
    check(f"noise: {color} has a power slope of {expected:+.0f} per decade", abs(psd_slope(nx, 48000) - expected) < 0.15, psd_slope(nx, 48000))
    check(f"noise: {color} has unit RMS", abs(float(np.sqrt(np.mean(nx ** 2))) - 1.0) < 1e-6)

sg = np.stack([np.sin(2 * np.pi * 440 * np.arange(48000 * 2) / 48000)] * 2, axis=1) * 0.2
mixed = NZ.mix_snr(sg, 48000, "pink", 10.0)
added = mixed - sg
snr = 20 * np.log10(np.sqrt(np.mean(sg ** 2)) / np.sqrt(np.mean(added ** 2)))
check("noise: the mix has the SNR asked for", abs(snr - 10.0) < 0.05, snr)
check("noise: the two ears get different noise", abs(float(np.corrcoef(added[:, 0], added[:, 1])[0, 1])) < 0.05)
check("noise: a silent signal stays silent (no division by zero)", np.array_equal(NZ.mix_snr(np.zeros((100, 2)), 48000, "pink", 10.0), np.zeros((100, 2))))

res_nz = C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(enabled=False), noise=C.NoiseStep(type="brown", snr_db=6.0)), lambda a: None)
res_clean = C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(enabled=False)), lambda a: None)
d = res_nz.data - res_clean.data
check("chain noise: SNR measured on the result", abs(20 * np.log10(np.sqrt(np.mean(res_clean.data ** 2)) / np.sqrt(np.mean(d ** 2))) - 6.0) < 0.1)
check("chain noise: same render twice gives the same file", np.array_equal(res_nz.data, C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(enabled=False), noise=C.NoiseStep(type="brown", snr_db=6.0)), lambda a: None).data))
try:
    C.render(xs, fs, C.Chain(hrtf=C.HrtfStep(enabled=False), noise=C.NoiseStep(type="purple")), lambda a: None)
    check("chain noise: an unknown colour is refused", False)
except C.ChainError:
    check("chain noise: an unknown colour is refused", True)

import json as _json
_cat = _json.loads(open(os.path.join("auralization", "catalog.json"), encoding="utf-8").read())
check("catalog: four scenes with room, head position and a note that they are not measurements",
      [s["id"] for s in _cat["scenes"]] == ["kitchen", "living", "car", "aircraft"] and "pt" in _cat["scenes_note"] and all(len(s["room"]["rt60"]) == 6 for s in _cat["scenes"]))
check("catalog: scenes keep the head distance at 1 m (the room already sets the direct-to-reverberant ratio)", all(s["hrtf"]["distance_m"] == 1.0 for s in _cat["scenes"]))

# ── Headphone block ──────────────────────────────────────────────────────────
from auralization import headphone as HP

_f = np.geomspace(20, 20000, 300)
_bass = 6.0 / (1.0 + (_f / 150.0) ** 2)
_peak = 8.0 * np.exp(-0.5 * ((np.log10(_f) - np.log10(3000.0)) / 0.12) ** 2)
_roll = -3.0 / (1.0 + (12000.0 / _f) ** 4)
_db = _bass + _peak + _roll                                    # a headphone with bass boost, a presence peak and a treble roll-off


def hp_text(freq, db, header=None, sep=",", decimal="."):
    rows = ([header] if header else []) + [f"{a:.3f}{sep}{b:.3f}".replace(".", decimal) if decimal != "." else f"{a:.3f}{sep}{b:.3f}" for a, b in zip(freq, db)]
    return ("\n".join(rows)).encode("utf-8")


hpa = HP.read_headphone_csv(hp_text(_f, _db, header="frequency,raw"), "a.csv")
check("headphone csv: header with frequency and raw", hpa.n_points == 300 and abs(hpa.db[0] - _db[0]) < 0.01)
multi = "frequency,raw,error,smoothed\n" + "\n".join(f"{a:.3f},{b:.3f},0,{b + 5:.3f}" for a, b in zip(_f, _db))
hpm = HP.read_headphone_csv(multi.encode(), "m.csv")
check("headphone csv: the raw column is used when there are several", abs(hpm.db[100] - _db[100]) < 0.01)
hps = HP.read_headphone_csv(hp_text(_f, _db, sep=";", decimal=","), "s.csv")
check("headphone csv: semicolons and decimal comma", abs(hps.db[50] - _db[50]) < 0.01 and hps.n_points == 300)
hpt = HP.read_headphone_csv(hp_text(_f, _db, sep="\t"), "t.txt")
check("headphone csv: tab separated without header", hpt.n_points == 300)
shuf = np.random.default_rng(2).permutation(300)
hpu = HP.read_headphone_csv(hp_text(_f[shuf], _db[shuf], header="f,db"), "u.csv")
check("headphone csv: unsorted rows are put in order", bool(np.all(np.diff(hpu.freq) > 0)))
for label, payload in (("too few lines", b"1,2\n3,4\n"), ("not numbers", b"a,b\n" + b"x,y\n" * 20),
                       ("range too narrow", hp_text(np.geomspace(500, 2000, 40), np.zeros(40))),
                       ("levels that are not dB", hp_text(_f, _db * 1000.0))):
    try:
        HP.read_headphone_csv(payload, "bad.csv")
        check(f"headphone csv: {label} rejected", False)
    except HP.HeadphoneError:
        check(f"headphone csv: {label} rejected", True)

fs = 48000
freq, measured, corr = HP.correction_db(hpa, fs, "compensate", 12.0)
fir = HP.design(hpa, fs, "compensate", 12.0)
flt = HP.response_db(fir, fs, freq)
res = measured + flt
band = (freq >= 100) & (freq <= 10000)
check("headphone: compensation makes the response flat within 1 dB from 100 Hz to 10 kHz", float(np.max(np.abs(res[band]))) < 1.0, float(np.max(np.abs(res[band]))))
nb = (freq >= 200) & (freq <= 4000)
check("headphone: the filter leaves the mid-band level alone (mean 0 dB)", abs(float(np.mean(flt[nb]))) < 0.7, float(np.mean(flt[nb])))
sim = HP.response_db(HP.design(hpa, fs, "simulate"), fs, freq)
check("headphone: simulation follows the measured response within 1 dB", float(np.max(np.abs((sim - measured)[band]))) < 1.0, float(np.max(np.abs((sim - measured)[band]))))
notch = _db - 30.0 * np.exp(-0.5 * ((np.log10(_f) - np.log10(5000.0)) / 0.05) ** 2)
hpn = HP.read_headphone_csv(hp_text(_f, notch, header="f,db"), "n.csv")
_, _, cn = HP.correction_db(hpn, fs, "compensate", 12.0)
check("headphone: the boost is limited (a deep dip is not chased)", float(np.max(cn)) <= 12.0 + 1e-6, float(np.max(cn)))
_, _, c6 = HP.correction_db(hpn, fs, "compensate", 6.0)
check("headphone: a lower boost limit gives a lower maximum correction", float(np.max(c6)) <= 6.0 + 1e-6)
check("headphone: the correction fades to zero at 20 Hz and at the top of the band", abs(corr[0]) < 0.01 and abs(corr[-1]) < 0.01, (corr[0], corr[-1]))
e = fir ** 2
check("headphone: the FIR is minimum phase (energy in front, no pre-ringing)", int(np.argmax(np.abs(fir))) < 120 and float(e[:1024].sum() / e.sum()) > 0.95, (int(np.argmax(np.abs(fir))), float(e[:1024].sum() / e.sum())))
flat = HP.read_headphone_csv(hp_text(_f, np.zeros(300), header="f,db"), "flat.csv")
fflat = HP.design(flat, fs, "compensate")
check("headphone: a flat headphone gives a filter that does nothing", float(np.max(np.abs(HP.response_db(fflat, fs, freq)[band]))) < 0.05)
for sr_ in (44100, 96000, 16000):
    fr, _, cr = HP.correction_db(hpa, sr_, "compensate", 12.0)
    check(f"headphone: works at {sr_} Hz (grid stops at 0.45 fs or 20 kHz)", fr[-1] <= 0.45 * sr_ + 1 and len(HP.design(hpa, sr_, "compensate")) == 2048)
try:
    HP.correction_db(hpa, fs, "wrong", 12.0)
    check("headphone: an unknown mode is refused", False)
except HP.HeadphoneError:
    check("headphone: an unknown mode is refused", True)

xs_h = 0.1 * np.random.default_rng(8).standard_normal(9600)
store_hp = {"h": hpa}
out_off = C.render(xs_h, fs, C.Chain(hrtf=C.HrtfStep(enabled=False)), lambda a: None, None, lambda a: store_hp.get(a))
out_hp = C.render(xs_h, fs, C.Chain(hrtf=C.HrtfStep(enabled=False), headphone=C.HeadphoneStep(mode="compensate", asset="h")), lambda a: None, None, lambda a: store_hp.get(a))
check("chain headphone: off leaves the signal alone, on adds the filter's tail", out_off.data.shape == (9600, 2) and out_hp.data.shape == (9600 + 2048 - 1, 2))
sp_in = np.abs(np.fft.rfft(xs_h * np.hanning(9600)))
sp_out = np.abs(np.fft.rfft(out_hp.data[:9600, 0] * np.hanning(9600)))
f_axis = np.fft.rfftfreq(9600, 1 / fs)
sel = (f_axis > 2000) & (f_axis < 4500)
gain_at_peak = 20 * np.log10(np.mean(sp_out[sel]) / np.mean(sp_in[sel]))
check("chain headphone: the presence peak of the headphone is taken down (about -5 dB at 2-4.5 kHz)", -9.0 < gain_at_peak < -2.0, gain_at_peak)
try:
    C.render(xs_h, fs, C.Chain(hrtf=C.HrtfStep(enabled=False), headphone=C.HeadphoneStep(mode="compensate", asset="gone")), lambda a: None, None, lambda a: None)
    check("chain headphone: a missing response raises", False)
except C.ChainError:
    check("chain headphone: a missing response raises", True)

# ── Absolute level ───────────────────────────────────────────────────────────
from auralization import level as LV

_t = np.arange(48000 * 2) / 48000


def _sine(freq, amp=1.0):
    return amp * np.sin(2 * np.pi * freq * _t)


check("level: a full-scale sine reads 0 dB, amplitude 0.1 reads -20 dB (unweighted)",
      abs(LV.digital_level_db(_sine(1000), 48000, "Z")) < 0.01 and abs(LV.digital_level_db(_sine(1000, 0.1), 48000, "Z") + 20) < 0.01)
check("level: A weighting leaves 1 kHz alone", abs(LV.digital_level_db(_sine(1000), 48000, "A")) < 0.1, LV.digital_level_db(_sine(1000), 48000, "A"))
check("level: A weighting takes 19.1 dB off a 100 Hz tone (IEC 61672)", abs(LV.digital_level_db(_sine(100), 48000, "A") + 19.1) < 0.4, LV.digital_level_db(_sine(100), 48000, "A"))
check("level: A weighting takes 2.5 dB off a 10 kHz tone (IEC 61672)", abs(LV.digital_level_db(_sine(10000), 48000, "A") + 2.5) < 0.4, LV.digital_level_db(_sine(10000), 48000, "A"))
one_ear = np.stack([np.zeros_like(_t), _sine(1000)], axis=1)
check("level: the two ears are averaged in energy (one silent ear = -3 dB)", abs(LV.digital_level_db(one_ear, 48000, "Z") + 3.01) < 0.02)
try:
    LV.digital_level_db(np.zeros(4800), 48000, "A")
    check("level: a silent signal is refused", False)
except LV.LevelError:
    check("level: a silent signal is refused", True)
check("level: gain formula (target - equipment level - current level)", LV.gain_db(-20.0, 70.0, 100.0) == -10.0)
check("level: SPL of a calibrated recording (0.1 amplitude, 20 Pa full scale = 97 dB)", abs(LV.calibrated_spl_db(_sine(1000, 0.1), 48000, 20.0, "Z") - 97.0) < 0.05, LV.calibrated_spl_db(_sine(1000, 0.1), 48000, 20.0, "Z"))

tone = _sine(1000, 0.1)
r_off = C.render(tone, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False)), lambda a: None)
check("chain level: off applies no gain", r_off.gain_db is None and r_off.level_db_spl is None)
r70 = C.render(tone, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="spl", target_db_spl=70.0, fs_db_spl=100.0, weighting="Z")), lambda a: None)
check("chain level: 70 dB SPL on a 100 dB equipment takes a -20 dB tone down by 10 dB", abs(r70.gain_db + 10.0) < 0.01 and abs(float(np.std(r70.data[:, 0])) - 0.1 / np.sqrt(2) * 10 ** (-10 / 20)) < 1e-4, r70.gain_db)
r70a = C.render(tone, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="spl", target_db_spl=70.0, fs_db_spl=100.0, weighting="A")), lambda a: None)
check("chain level: at 1 kHz A weighting gives the same gain as no weighting", abs(r70a.gain_db - r70.gain_db) < 0.1)
rsrc = C.render(tone, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="source", fs_db_spl=100.0, weighting="Z")), lambda a: None, None, None, 97.0)
check("chain level: keeping the level of a 97 dB recording on a 100 dB equipment gives a tone of RMS 0.5", abs(float(np.sqrt(np.mean(rsrc.data[:, 0] ** 2))) - 0.5) < 1e-3 and abs(rsrc.level_db_spl - 97.0) < 1e-9)
try:
    C.render(tone, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="source")), lambda a: None)
    check("chain level: 'keep the recording level' without calibration is refused", False)
except C.ChainError:
    check("chain level: 'keep the recording level' without calibration is refused", True)
rclip = C.render(_sine(1000, 0.5), 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="spl", target_db_spl=105.0, fs_db_spl=100.0, weighting="Z")), lambda a: None)
check("chain level: a level that pushes the peak above 0 dBFS is reported", rclip.peak_dbfs > 0 and any("0 dBFS" in n for n in rclip.notes))
try:
    C.render(np.zeros(4800), 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="spl")), lambda a: None)
    check("chain level: a silent signal is refused", False)
except C.ChainError:
    check("chain level: a silent signal is refused", True)
try:
    C.render(tone, 48000, C.Chain(hrtf=C.HrtfStep(enabled=False), level=C.LevelStep(mode="spl", weighting="C")), lambda a: None)
    check("chain level: an unknown weighting is refused", False)
except C.ChainError:
    check("chain level: an unknown weighting is refused", True)

# ── Noise spectrum (1/3-octave levels) and the space-separated CSV ───────────
fc3, lv3 = NZ.third_octave_levels(np.sin(2 * np.pi * 1000 * np.arange(96000) / 48000), 48000)
i1k = int(np.argmin(np.abs(fc3 - 1000)))
check("third-octave: a full-scale 1 kHz sine reads 0 dB in the 1 kHz band and much less elsewhere",
      abs(lv3[i1k]) < 0.4 and float(np.max(np.delete(lv3, [i1k - 1, i1k, i1k + 1]))) < -25, (lv3[i1k], float(np.max(np.delete(lv3, [i1k - 1, i1k, i1k + 1])))))
check("third-octave: the bands stop at 0.45 fs (44.1 kHz gives 20 kHz, 16 kHz gives fewer)", NZ.third_octave_levels(np.random.default_rng(1).standard_normal(48000), 44100)[0][-1] == 16000.0 and NZ.third_octave_levels(np.random.default_rng(1).standard_normal(48000), 16000)[0][-1] <= 6300.0)


def band_slope(color):
    x = NZ.coloured_noise(48000 * 10, 48000, color, 3)
    c, l = NZ.third_octave_levels(x, 48000)
    sel = (c >= 100) & (c <= 10000)
    return float(np.polyfit(np.log2(c[sel]), l[sel], 1)[0])      # dB per octave


check("third-octave: white noise rises 3 dB per octave in 1/3-octave bands", abs(band_slope("white") - 3.0) < 0.5, band_slope("white"))
check("third-octave: pink noise is flat in 1/3-octave bands", abs(band_slope("pink")) < 0.5, band_slope("pink"))
check("third-octave: brown noise falls 3 dB per octave in 1/3-octave bands", abs(band_slope("brown") + 3.0) < 0.5, band_slope("brown"))
wn = NZ.coloured_noise(48000 * 6, 48000, "white", 5)
cw, lw = NZ.third_octave_levels(wn, 48000)
covered = (cw[-1] * 2 ** (1 / 6) - cw[0] / 2 ** (1 / 6)) / 24000.0          # the bands stop at the 16 kHz band at 48 kHz, so the white noise above it is not counted
check("third-octave: the bands of white noise add up to the share of its total level that they cover (0.3 dB)", abs(10 * np.log10(np.sum(10 ** (lw / 10))) - (10 * np.log10(1.0 / 0.5) + 10 * np.log10(covered))) < 0.3, 10 * np.log10(np.sum(10 ** (lw / 10))))
sigx = np.stack([_sine(500, 0.3), _sine(500, 0.3)], axis=1)
nc = NZ.noise_component(sigx, 48000, "pink", 12.0)
check("noise component: its SNR against the signal is the one asked for", abs(20 * np.log10(np.sqrt(np.mean(sigx ** 2)) / np.sqrt(np.mean(nc ** 2))) - 12.0) < 0.01)
check("noise component: mix_snr is the signal plus that component", np.allclose(NZ.mix_snr(sigx, 48000, "pink", 12.0), sigx + nc))

space = ("\n".join(f"{a:.2f} {b:.2f}" for a, b in zip(_f, _db))).encode()
hsp = HP.read_headphone_csv(space, "cEAR32-Test-Headphone-L.txt")
check("headphone csv: two columns separated by spaces, no header (SBAF files)", hsp.n_points == 300 and abs(hsp.db[10] - _db[10]) < 0.01)
hsp2 = HP.read_headphone_csv(("\n".join(f"{a:.2f}   {b:.2f}" for a, b in zip(_f, _db))).encode(), "wide.txt")
check("headphone csv: several blanks between the columns", hsp2.n_points == 300)

# ── API (a real server, like the other dev-tests) ─────────────────────────────
import http.client
import json
import subprocess
import time
import uuid

BACKEND = os.getcwd()
PORT = 8350


class Server:
    def __init__(self):
        e = dict(os.environ)
        e["PYTHONDONTWRITEBYTECODE"] = "1"
        self.proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(PORT)],
                                     cwd=BACKEND, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if self.req("GET", "/api/health")[0] == 200:
                    return
            except Exception:
                time.sleep(1)
        raise RuntimeError("server did not start")

    def req(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", PORT, timeout=120)
        c.request(method, path, body=body, headers={"X-Lang": "en", **(headers or {})})
        r = c.getresponse()
        raw = r.read()
        hdr = {k.lower(): v for k, v in r.getheaders()}
        c.close()
        return r.status, raw, hdr

    def json(self, method, path, obj=None):
        st, raw, _ = self.req(method, path, json.dumps(obj) if obj is not None else None, {"Content-Type": "application/json"})
        try:
            return st, json.loads(raw)
        except Exception:
            return st, raw[:200]

    def form(self, path, fields, fname, fdata, fieldname="file"):
        b = uuid.uuid4().hex
        parts = b"".join(f'--{b}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode() for k, v in fields.items())
        parts += f'--{b}\r\nContent-Disposition: form-data; name="{fieldname}"; filename="{fname}"\r\nContent-Type: application/octet-stream\r\n\r\n'.encode() + fdata + f"\r\n--{b}--\r\n".encode()
        st, raw, _ = self.req("POST", path, parts, {"Content-Type": f"multipart/form-data; boundary={b}"})
        try:
            return st, json.loads(raw)
        except Exception:
            return st, raw[:200]

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


srv = Server()
try:
    S = "aural-session-0001"
    wav = io.BytesIO()
    sine = (0.2 * np.sin(2 * np.pi * 440 * np.arange(48000 * 2) / 48000)).astype("float32")
    sf.write(wav, sine, 48000, format="WAV", subtype="PCM_16")
    st, up = srv.form("/api/audio/upload", {"session_id": S}, "tone.wav", wav.getvalue(), fieldname="files")
    check("api: upload source", st == 200, up)
    aid = up[0]["audio_id"]

    st, cat = srv.json("GET", "/api/auralization/catalog")
    check("api: catalog has the model and the datasets with a licence status",
          st == 200 and cat["builtin"][0]["id"] == "builtin:sphere" and all("license_status" in d for d in cat["datasets"]))

    body = {"session_id": S, "audio_id": aid, "blocks": {"hrtf": {"azimuth": 60, "elevation": 0, "distance_m": 1}}}
    st, raw, hdr = srv.req("POST", "/api/auralization/preview", json.dumps(body), {"Content-Type": "application/json"})
    check("api: preview returns a stereo WAV", st == 200 and sf.info(io.BytesIO(raw)).channels == 2, st)
    check("api: preview carries the peak", "x-peak-dbfs" in hdr)

    st, j = srv.json("POST", "/api/auralization/render", {**body, "new_audio_id": "abcd1234abcd1234"})
    check("api: render makes a stereo audio with the id the browser chose", st == 200 and j["channels"] == 2 and j["audio_id"] == "abcd1234abcd1234", j)
    st, lst = srv.json("GET", f"/api/audio/list/{S}")
    check("api: the new file is in the session list (Post-Processing sees it)", any(a["audio_id"] == "abcd1234abcd1234" and a["channels"] == 2 for a in lst))
    st, raw, _ = srv.req("GET", f"/api/audio/{S}/abcd1234abcd1234/stream")
    info = sf.info(io.BytesIO(raw))
    check("api: the stored file is a 2-channel float WAV of the right length", info.channels == 2 and info.frames > 96000 and "FLOAT" in info.subtype, (info.channels, info.frames, info.subtype))
    st, wf = srv.json("GET", f"/api/audio/{S}/abcd1234abcd1234/waveform")
    check("api: Post-Processing can draw the new file", st == 200, wf if st != 200 else "")

    st, am = srv.form("/api/auralization/assets", {"session_id": S, "kind": "hrtf"}, "mine.sofa", make_sofa())
    check("api: SOFA upload", st == 200 and am["n_directions"] == 3, am)
    asset = am["asset_id"]
    st, r2 = srv.json("POST", "/api/auralization/response", {"session_id": S, "hrtf": {"asset": asset, "azimuth": 90}})
    check("api: response gives both ears and a right-side ITD >= 0", st == 200 and len(r2["freq"]) == len(r2["left_db"]) and r2["itd_ms"] >= 0, r2["itd_ms"])
    st, r2m = srv.json("POST", "/api/auralization/response", {"session_id": S, "hrtf": {"azimuth": 90}})
    check("api: response for the model at +90 deg shows ~0.66 ms", st == 200 and abs(r2m["itd_ms"] - woodworth) < 0.05, r2m["itd_ms"])
    st, rs = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"hrtf": {"asset": asset, "azimuth": 85}}})
    check("api: render with the uploaded set", st == 200, rs)
    st, ls = srv.json("GET", f"/api/auralization/{S}/assets")
    check("api: the uploaded set is listed", st == 200 and len(ls) == 1)
    srv.json("DELETE", f"/api/auralization/{S}/assets/{asset}")
    st, rg = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"hrtf": {"asset": asset}}})
    check("api: a removed set answers 400 with a message", st == 400 and "SOFA" in rg["detail"], rg)
    st, bad = srv.form("/api/auralization/assets", {"session_id": S}, "x.sofa", b"nope")
    check("api: a broken SOFA answers 400", st == 400, bad)
    st, wrong = srv.form("/api/auralization/assets", {"session_id": S}, "x.wav", b"nope")
    check("api: a non-.sofa upload answers 400", st == 400, wrong)
    st, nosrc = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": "nothere", "blocks": {}})
    check("api: unknown audio answers 404", st == 404, nosrc)
    st, badsid = srv.json("POST", "/api/auralization/render", {"session_id": "../x", "audio_id": aid, "blocks": {}})
    check("api: an unsafe session id answers 400", st == 400, badsid)
    st, oob = srv.json("POST", "/api/auralization/render", {**body, "blocks": {"hrtf": {"azimuth": 9999}}})
    check("api: out-of-range azimuth answers 422", st == 422)

    # ── Phase 2 over the API ──
    st, rm = srv.form("/api/auralization/assets", {"session_id": S, "kind": "rir"}, "sala.wav", wav_of(exp_rir(0.6)))
    check("api: RIR upload gives channels, duration and a suggested type", st == 200 and rm["kind"] == "rir" and rm["channels"] == 1 and rm["suggested_type"] == "rir", rm)
    rid = rm["asset_id"]
    st, inf = srv.json("GET", f"/api/auralization/{S}/assets/{rid}/info")
    check("api: info gives T20 near 0.6 s, bands and a decay curve", st == 200 and abs(inf["metrics"]["rt60_t20"] - 0.6) < 0.06 and len(inf["bands"]) == 6 and len(inf["decay"]["t"]) > 20, inf if st != 200 else inf["metrics"])
    st, brm = srv.form("/api/auralization/assets", {"session_id": S, "kind": "rir"}, "binaural.wav", wav_of(np.stack([exp_rir(0.4, seed=1), exp_rir(0.4, seed=2)], axis=1)))
    check("api: a 2-channel file is suggested as BRIR", st == 200 and brm["suggested_type"] == "brir", brm)
    st, bad3 = srv.form("/api/auralization/assets", {"session_id": S, "kind": "rir"}, "x.wav", wav_of(np.ones((4800, 3), dtype="float32") * 0.1))
    check("api: a 3-channel response answers 400", st == 400, bad3)
    st, badx = srv.form("/api/auralization/assets", {"session_id": S, "kind": "rir"}, "x.sofa", b"nope")
    check("api: a RIR with the wrong extension answers 400", st == 400)

    roomblocks = {"hrtf": {"azimuth": 30}, "environment": {"type": "rir", "asset": rid, "reverb_gain_db": -6}}
    st, rr = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": roomblocks})
    check("api: render with a room is longer than the source by about the tail", st == 200 and rr["duration_s"] > 2.0 + 1.0 and "sala" in rr["name"], rr)
    st, rb = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"environment": {"type": "brir", "asset": brm["asset_id"]}}})
    check("api: render with a BRIR works and warns that the HRTF is ignored", st == 200 and "BRIR" in rb["name"] and any("already" in n for n in rb["notes"]), rb)
    st, raw, hdr = srv.req("POST", "/api/auralization/preview", json.dumps({"session_id": S, "audio_id": aid, "blocks": roomblocks}), {"Content-Type": "application/json"})
    check("api: preview with a room is a stereo WAV", st == 200 and sf.info(io.BytesIO(raw)).channels == 2)
    srv.json("DELETE", f"/api/auralization/{S}/assets/{rid}")
    st, gone = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": roomblocks})
    check("api: a removed room response answers 400 with a message", st == 400 and "impulse response" in gone["detail"], gone)
    st, ls = srv.json("GET", f"/api/auralization/{S}/assets")
    check("api: the list holds the remaining BRIR", st == 200 and [a["kind"] for a in ls] == ["rir"], ls)
    st, nf = srv.json("GET", f"/api/auralization/{S}/assets/doesnotexist/info")
    check("api: info of an unknown file answers 404", st == 404)
    st, oob = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"environment": {"type": "rir", "asset": "x", "reverb_gain_db": 99}}})
    check("api: an out-of-range reverberation gain answers 422", st == 422)

    # ── Quick scenes over the API ──
    kit = next(s for s in cat["scenes"] if s["id"] == "kitchen")
    st, sa = srv.json("POST", "/api/auralization/rir/synth", {"session_id": S, "name": "Cozinha (sintética)", "fs": 48000, **kit["room"]})
    check("api: synthesize a kitchen", st == 200 and sa["kind"] == "rir" and sa["channels"] == 1 and sa["suggested_type"] == "rir" and sa["name"].startswith("Cozinha"), sa)
    st, si = srv.json("GET", f"/api/auralization/{S}/assets/{sa['asset_id']}/info")
    check("api: the synthetic kitchen measures about 0.5 s", st == 200 and abs(si["metrics"]["rt60_t20"] - 0.5) < 0.08, si["metrics"] if st == 200 else si)
    blocks_k = {"hrtf": kit["hrtf"], "environment": {"type": "rir", "asset": sa["asset_id"]}, "noise": {"type": "pink", "snr_db": 20}}
    st, rk = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": blocks_k})
    check("api: render the kitchen scene with noise", st == 200 and rk["channels"] == 2 and "sala" in rk["name"] and rk["duration_s"] > 2.0 + 0.5, rk)
    st, raw, hdr = srv.req("POST", "/api/auralization/preview", json.dumps({"session_id": S, "audio_id": aid, "blocks": blocks_k}), {"Content-Type": "application/json"})
    check("api: preview of the scene is a stereo WAV", st == 200 and sf.info(io.BytesIO(raw)).channels == 2)
    st, rn = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"noise": {"type": "brown", "snr_db": 10}}})
    check("api: noise alone (no room, no HRTF change) renders", st == 200 and rn["channels"] == 2, rn)
    st, b1 = srv.json("POST", "/api/auralization/rir/synth", {"session_id": S, "rt60": {"abc": 0.5}})
    check("api: a band that is not a number answers 400", st == 400, b1)
    st, b2 = srv.json("POST", "/api/auralization/rir/synth", {"session_id": S, "rt60": {"1000": 9.0}})
    check("api: a reverberation time out of range answers 400", st == 400, b2)
    st, b3 = srv.json("POST", "/api/auralization/rir/synth", {"session_id": S, "rt60": {}})
    check("api: no reverberation time answers 400", st == 400, b3)
    st, b4 = srv.json("POST", "/api/auralization/rir/synth", {"session_id": S, "rt60": {"1000": 0.5}, "volume_m3": 0})
    check("api: a volume of zero answers 422", st == 422)
    st, b5 = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"noise": {"type": "purple"}}})
    check("api: an unknown noise colour answers 422", st == 422)
    st, b6 = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"noise": {"type": "pink", "snr_db": 99}}})
    check("api: an SNR out of range answers 422", st == 422)

    # ── Inline synthetic rooms (the comparison demo of the Auralize Salas card) ──
    def preview_len(rt):
        blocks = {"hrtf": {"azimuth": 20}, "environment": {"synth": {"volume_m3": 60, "distance_m": 2, "rt60": {str(b): rt for b in (125, 250, 500, 1000, 2000, 4000)}}}}
        st_, raw_, _ = srv.req("POST", "/api/auralization/preview", json.dumps({"session_id": S, "audio_id": aid, "blocks": blocks}), {"Content-Type": "application/json"})
        return st_, sf.info(io.BytesIO(raw_)) if st_ == 200 else raw_
    st, long_i = preview_len(1.2)
    st2, short_i = preview_len(0.3)
    check("api: inline room previews are stereo and the longer room has the longer tail",
          st == 200 and st2 == 200 and long_i.channels == 2 and long_i.frames > short_i.frames + 0.5 * 48000, (st, st2))
    st, listed = srv.json("GET", f"/api/auralization/{S}/assets")
    check("api: inline rooms are not kept as files (the 4-file limit is untouched)", st == 200 and all(a["name"] != "inline" for a in listed))
    st, badi = srv.json("POST", "/api/auralization/preview", {"session_id": S, "audio_id": aid, "blocks": {"environment": {"synth": {"rt60": {}}}}})
    check("api: an inline room with no reverberation time answers 400", st == 400, badi)
    st, badj = srv.json("POST", "/api/auralization/preview", {"session_id": S, "audio_id": aid, "blocks": {"environment": {"synth": {"rt60": {"1000": 0.5}, "volume_m3": 0}}}})
    check("api: an inline room with volume 0 answers 422", st == 422)

    # ── Headphone over the API ──
    st, hm = srv.form("/api/auralization/assets", {"session_id": S, "kind": "headphone"}, "hd600.csv", hp_text(_f, _db, header="frequency,raw"))
    check("api: headphone CSV upload", st == 200 and hm["kind"] == "headphone" and hm["n_points"] == 300 and hm["f_min"] < 30 and hm["f_max"] > 15000, hm)
    hid = hm["asset_id"]
    st, hr_ = srv.json("POST", "/api/auralization/headphone/response", {"session_id": S, "asset": hid, "mode": "compensate", "max_boost_db": 12})
    flat_ok = st == 200 and len(hr_["freq"]) == len(hr_["result_db"]) == len(hr_["measured_db"]) and max(abs(v) for f_, v in zip(hr_["freq"], hr_["result_db"]) if 100 <= f_ <= 10000) < 1.0
    check("api: the headphone response for the plot shows a flat result", flat_ok, hr_ if st != 200 else "")
    st, hr2 = srv.json("POST", "/api/auralization/headphone/response", {"session_id": S, "asset": hid, "mode": "simulate"})
    check("api: simulation has no 'result' curve", st == 200 and hr2["result_db"] is None)
    hblocks = {"headphone": {"mode": "compensate", "asset": hid, "max_boost_db": 12}}
    st, rh = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": hblocks})
    check("api: render with a headphone compensation", st == 200 and rh["channels"] == 2, rh)
    st, raw, hdr = srv.req("POST", "/api/auralization/preview", json.dumps({"session_id": S, "audio_id": aid, "blocks": hblocks}), {"Content-Type": "application/json"})
    check("api: preview with a headphone compensation is a stereo WAV", st == 200 and sf.info(io.BytesIO(raw)).channels == 2)
    st, lsh = srv.json("GET", f"/api/auralization/{S}/assets")
    check("api: the list shows the headphone file with its kind", st == 200 and any(a["kind"] == "headphone" for a in lsh))
    st, badh = srv.form("/api/auralization/assets", {"session_id": S, "kind": "headphone"}, "x.csv", b"a,b\n1,2\n")
    check("api: a broken headphone CSV answers 400", st == 400, badh)
    st, badx = srv.form("/api/auralization/assets", {"session_id": S, "kind": "headphone"}, "x.wav", b"nope")
    check("api: a headphone file with the wrong extension answers 400", st == 400)
    srv.json("DELETE", f"/api/auralization/{S}/assets/{hid}")
    st, goneh = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": hblocks})
    check("api: a removed headphone response answers 400 with a message", st == 400 and "headphone" in goneh["detail"], goneh)
    st, oobh = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"headphone": {"mode": "compensate", "asset": "x", "max_boost_db": 99}}})
    check("api: a boost limit out of range answers 422", st == 422)

    # ── Absolute level over the API ──
    lblocks = {"level": {"mode": "spl", "target_db_spl": 60, "fs_db_spl": 100, "weighting": "A"}}
    st, rl = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": lblocks})
    check("api: render with a target level reports the gain and the level", st == 200 and rl["level_db_spl"] == 60.0 and isinstance(rl["gain_db"], float), rl)
    st, raw, hdr = srv.req("POST", "/api/auralization/preview", json.dumps({"session_id": S, "audio_id": aid, "blocks": lblocks}), {"Content-Type": "application/json"})
    check("api: preview carries the gain in a header", st == 200 and "x-gain-db" in hdr and abs(float(hdr["x-gain-db"]) - rl["gain_db"]) < 3.0, hdr.get("x-gain-db"))
    st, rn_ = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"level": {"mode": "source", "fs_db_spl": 100, "weighting": "Z"}}})
    check("api: 'keep the recording level' without calibration answers 400 with a message", st == 400 and "calibrat" in rn_["detail"], rn_)
    st, cal = srv.json("POST", f"/api/audio/{S}/{aid}/calibrate", {"sensitivity_mv_pa": 50, "fs_voltage": 1})
    st, rs_ = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"level": {"mode": "source", "fs_db_spl": 100, "weighting": "Z"}}})
    # the tone has amplitude 0.2 (RMS 0.1414 = -14 dB re a full-scale sine); 50 mV/Pa and 1 V give 20 Pa at full scale = 117.0 dB: 103.0 dB SPL
    check("api: with the calibration the level of the recording is kept (103 dB SPL)", st == 200 and abs(rs_["level_db_spl"] - 103.0) < 0.3, rs_)
    st, ob1 = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"level": {"mode": "spl", "target_db_spl": 300}}})
    check("api: a target level out of range answers 422", st == 422)
    st, ob2 = srv.json("POST", "/api/auralization/render", {"session_id": S, "audio_id": aid, "blocks": {"level": {"mode": "spl", "weighting": "C"}}})
    check("api: a weighting other than A or Z answers 422", st == 422)

    # ── Noise spectrum over the API ──
    nreq = {"session_id": S, "audio_id": aid, "blocks": {"hrtf": {"azimuth": 30}, "noise": {"type": "pink", "snr_db": 10}}}
    st, nsp = srv.json("POST", "/api/auralization/noise/spectrum", nreq)
    ok_shape = st == 200 and len(nsp["freq"]) == len(nsp["signal_db"]) >= 25 and set(nsp["noises"]) == {"white", "pink", "brown"} and all(len(v) == len(nsp["freq"]) for v in nsp["noises"].values())
    check("api: noise spectrum gives the signal and the three noise colours in 1/3-octave bands", ok_shape and nsp["selected"] == "pink", nsp if st != 200 else "")
    p_sig = 10 * np.log10(np.sum(10 ** (np.array(nsp["signal_db"]) / 10)))
    p_noi = 10 * np.log10(np.sum(10 ** (np.array(nsp["noises"]["pink"]) / 10)))
    check("api: the bands of the selected noise sit about 10 dB under the signal in total (the SNR asked for)", abs((p_sig - p_noi) - 10.0) < 1.5, p_sig - p_noi)
    st, nsp2 = srv.json("POST", "/api/auralization/noise/spectrum", {**nreq, "blocks": {"noise": {"type": "none", "snr_db": 10}}})
    check("api: with no noise chosen the curves are still returned (to compare the colours)", st == 200 and nsp2["selected"] == "none" and len(nsp2["noises"]["brown"]) == len(nsp2["freq"]))
    st, nsp3 = srv.json("POST", "/api/auralization/noise/spectrum", {**nreq, "audio_id": "nothere"})
    check("api: noise spectrum of an unknown audio answers 404", st == 404)
finally:
    srv.stop()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
