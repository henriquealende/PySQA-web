"""Audio Preparation (phase 1: HRTF) checks. Run with the backend venv from the backend folder:

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
finally:
    srv.stop()

print("FAILS:", fails)
sys.exit(1 if fails else 0)
