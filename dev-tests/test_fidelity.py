"""The audio copy the server keeps is what is played, downloaded and reloaded after a restart: it must not lose quality."""
import http.client
import io
import json
import os
import subprocess
import sys
import tempfile
import time
import uuid
import warnings

warnings.filterwarnings("ignore")
import numpy as np
import soundfile as sf

BACKEND = os.getcwd()
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:230] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


SR = 48000
T = np.arange(SR) / SR
TONE = np.sin(2 * np.pi * 1000 * T)


def make(subtype, amp):
    b = io.BytesIO()
    sf.write(b, amp * TONE, SR, format="WAV", subtype=subtype)
    return b.getvalue()


class Server:
    def __init__(self, port, tmp):
        self.port = port
        e = dict(os.environ)
        for k in ("PYSQA_MEMORY_MB", "RENDER"):
            e.pop(k, None)
        e["PYSQA_TMP_DIR"] = tmp
        e["PYTHONDONTWRITEBYTECODE"] = "1"
        self.proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
                                     cwd=BACKEND, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if self.req("GET", "/api/health")[0] == 200:
                    return
            except Exception:
                time.sleep(1)
        raise RuntimeError("server did not start")

    def req(self, method, path, body=None, headers=None, raw=False):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=300)
        c.request(method, path, body=body, headers={"X-Lang": "en", **(headers or {})})
        r = c.getresponse()
        data = r.read()
        c.close()
        if raw:
            return r.status, data
        try:
            return r.status, json.loads(data)
        except Exception:
            return r.status, data[:100]

    def post(self, path, obj):
        return self.req("POST", path, json.dumps(obj), {"Content-Type": "application/json"})

    def upload(self, session, data, name):
        b = uuid.uuid4().hex
        body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session}\r\n"
                f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
        return self.req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


def decode(raw):
    data, sr = sf.read(io.BytesIO(raw), dtype="float64")
    return data, sr, sf.info(io.BytesIO(raw)).subtype


tmp = tempfile.mkdtemp(prefix="pysqa-fid-")
sess = "fid-" + uuid.uuid4().hex[:8]
ids = {}
originals = {}

print("== first server ==")
s = Server(8331, tmp)
try:
    cases = {"pcm16": ("PCM_16", 0.5), "pcm24": ("PCM_24", 0.5), "pcm32": ("PCM_32", 0.5), "float32": ("FLOAT", 0.5),
             "float32_loud": ("FLOAT", 1.5), "float64": ("DOUBLE", 0.5), "pcm8": ("PCM_U8", 0.5)}
    for key, (sub, amp) in cases.items():
        originals[key] = make(sub, amp)
        st, d = s.upload(sess, originals[key], f"{key}.wav")
        ids[key] = d[0]["audio_id"]
        check(f"{key}: upload accepted", st == 200, (st, d))

    for key in ("pcm16", "pcm24", "pcm32", "float32", "float32_loud", "pcm8"):
        st, down = s.req("GET", f"/api/export/wav/{sess}/{ids[key]}", raw=True)
        st2, stream = s.req("GET", f"/api/audio/{sess}/{ids[key]}/stream", raw=True)
        check(f"{key}: the download is the uploaded file, byte for byte", st == 200 and down == originals[key], f"{len(down)} vs {len(originals[key])} bytes")
        check(f"{key}: playback gets the same bytes", st2 == 200 and stream == originals[key])

    data, sr, sub = decode(s.req("GET", f"/api/export/wav/{sess}/{ids['float64']}", raw=True)[1])
    ref, _, _ = decode(originals["float64"])
    check("float64: converted to 32-bit float for browsers, values unchanged to 1e-7", sub == "FLOAT" and np.max(np.abs(data - ref)) < 1e-7, (sub, np.max(np.abs(data - ref))))

    st, wf = s.req("GET", f"/api/audio/{sess}/{ids['float32_loud']}/waveform")
    check("a peak above full scale is kept in the analysis (1.5)", abs(wf["peak"] - 1.5) < 1e-6, wf["peak"])
    st, wf8 = s.req("GET", f"/api/audio/{sess}/{ids['pcm8']}/waveform")
    check("8-bit file is read with the right scale (peak 0.5, not 192)", abs(wf8["peak"] - 0.5) < 0.02, wf8["peak"])
    st, wf16 = s.req("GET", f"/api/audio/{sess}/{ids['pcm16']}/waveform")
    st, wf24 = s.req("GET", f"/api/audio/{sess}/{ids['pcm24']}/waveform")
    check("16-bit and 24-bit files read to the same level", abs(wf16["peak"] - wf24["peak"]) < 1e-3, (wf16["peak"], wf24["peak"]))

    # processed file: gain pushes samples past full scale
    st, d = s.post("/api/processing/filter", {"session_id": sess, "audio_id": ids["float32"], "filter_type": "1/3-Octave band",
                                              "octave_gains_db": [24.0] * 31})
    check("1/3-octave EQ with +24 dB is accepted", st == 200, (st, d))
    derived = d["audio_id"]
    ids["derived"] = derived
    st, down = s.req("GET", f"/api/export/wav/{sess}/{derived}", raw=True)
    data, sr, sub = decode(down)
    st, wfd = s.req("GET", f"/api/audio/{sess}/{derived}/waveform")
    check("processed file is stored as 32-bit float", sub == "FLOAT", sub)
    check("processed file keeps samples above full scale (not clipped at 1.0)", float(np.max(np.abs(data))) > 3.0, float(np.max(np.abs(data))))
    check("what is downloaded matches what is analysed", abs(float(np.max(np.abs(data))) - wfd["peak"]) < 1e-3, (float(np.max(np.abs(data))), wfd["peak"]))
    derived_peak = wfd["peak"]

    s.post(f"/api/audio/{sess}/{ids['float32_loud']}/calibrate", {"sensitivity_mv_pa": 50})     # makes the server write the session file
    time.sleep(1.5)
finally:
    s.stop()

print("== second server, same folder (a restart) ==")
s = Server(8332, tmp)
try:
    st, lst = s.req("GET", f"/api/audio/list/{sess}")
    check("every file came back after the restart", st == 200 and {x["audio_id"] for x in lst} == set(ids.values()), (st, len(lst) if isinstance(lst, list) else lst))
    st, wf = s.req("GET", f"/api/audio/{sess}/{ids['float32_loud']}/waveform")
    check("after the restart the loud file still peaks at 1.5", abs(wf["peak"] - 1.5) < 1e-6, wf["peak"])
    st, wfd = s.req("GET", f"/api/audio/{sess}/{ids['derived']}/waveform")
    check("after the restart the processed file keeps its peak", abs(wfd["peak"] - derived_peak) < 1e-3, (wfd["peak"], derived_peak))
    st, wf8 = s.req("GET", f"/api/audio/{sess}/{ids['pcm8']}/waveform")
    check("after the restart the 8-bit file is still at the right scale", abs(wf8["peak"] - 0.5) < 0.02, wf8["peak"])
    st, down = s.req("GET", f"/api/export/wav/{sess}/{ids['pcm24']}", raw=True)
    check("after the restart the 24-bit download is still the original", down == originals["pcm24"])
finally:
    s.stop()

print("FAILS:", len(fails), fails)
sys.exit(1 if fails else 0)
