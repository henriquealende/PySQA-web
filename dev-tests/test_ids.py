"""Client-chosen ids: restored files must come back under the same id, and nothing unsafe may get through."""
import http.client
import io
import json
import os
import re
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
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:200] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


def wav(seconds, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    x = 0.2 * np.sin(2 * np.pi * 440 * t) + 0.01 * np.random.default_rng(1).standard_normal(t.size)
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


def multipart(session, files, ids):
    b = uuid.uuid4().hex
    parts = [f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session}\r\n".encode()]
    for i in ids:
        parts.append(f"--{b}\r\nContent-Disposition: form-data; name=\"audio_ids\"\r\n\r\n{i}\r\n".encode())
    for name, data in files:
        parts.append(f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n".encode() + data + b"\r\n")
    parts.append(f"--{b}--\r\n".encode())
    return b"".join(parts), {"Content-Type": f"multipart/form-data; boundary={b}"}


class Server:
    def __init__(self, port, **env):
        self.port = port
        self.tmp = tempfile.mkdtemp(prefix="pysqa-ids-")
        e = dict(os.environ)
        for k in ("PYSQA_MEMORY_MB", "RENDER"):
            e.pop(k, None)
        e.update({k: str(v) for k, v in env.items()})
        e["PYSQA_TMP_DIR"] = self.tmp
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

    def req(self, method, path, body=None, headers=None):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=300)
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse()
        raw = r.read()
        c.close()
        try:
            return r.status, json.loads(raw)
        except Exception:
            return r.status, raw[:100]

    def upload(self, session, files, ids):
        body, h = multipart(session, files, ids)
        return self.req("POST", "/api/audio/upload", body, h)

    def post(self, path, obj):
        return self.req("POST", path, json.dumps(obj), {"Content-Type": "application/json"})

    def wavs(self):
        return sorted(f for f in os.listdir(self.tmp) if f.endswith(".wav"))

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


print("== local mode ==")
s = Server(8201)
try:
    sess = "ids-" + uuid.uuid4().hex[:8]
    st, d = s.upload(sess, [("a.wav", wav(1)), ("b.wav", wav(1))], ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"])
    check("hinted ids are honoured, in order", st == 200 and [x["audio_id"] for x in d] == ["aaaaaaaaaaaaaaaa", "bbbbbbbbbbbbbbbb"], [x["audio_id"] for x in d] if st == 200 else d)
    check("wav files on disk are not named after client input", all(re.fullmatch(r"[0-9a-f]{32}\.wav", n) for n in s.wavs()), s.wavs())
    st, d = s.req("GET", f"/api/audio/{sess}/aaaaaaaaaaaaaaaa/stream")
    check("stream works under the hinted id", st == 200, st)

    st, d = s.upload(sess, [("c.wav", wav(1)), ("d.wav", wav(1)), ("e.wav", wav(1))], ["../../evil", "short", "has space and ! symbols"])
    ids = [x["audio_id"] for x in d] if st == 200 else []
    check("unsafe or malformed hints are ignored", st == 200 and len(ids) == 3 and all(re.fullmatch(r"[0-9a-f]{12}", i) for i in ids), ids or d)
    escaped = [f for f in os.listdir(os.path.dirname(s.tmp)) if "evil" in f]
    check("nothing was written outside the session folder", not escaped, escaped)

    st, d = s.upload(sess, [("a2.wav", wav(2))], ["aaaaaaaaaaaaaaaa"])
    st2, lst = s.req("GET", f"/api/audio/list/{sess}")
    same = [x for x in lst if x["audio_id"] == "aaaaaaaaaaaaaaaa"]
    check("re-uploading an id replaces it", st == 200 and len(same) == 1 and abs(same[0]["duration_s"] - 2.0) < 0.01 and len(lst) == 5, [(x["audio_id"][:6], x["duration_s"]) for x in lst])
    check("the replaced file's WAV is deleted", len(s.wavs()) == 5, len(s.wavs()))

    for bad in ("../../x", "short", "a b c d e f g h", ""):
        st, d = s.upload(bad, [("z.wav", wav(1))], [])
        check(f"unsafe session id {bad!r} is refused", st in (400, 422) , f"{st} {d}")
    check("no session json escaped the folder", not [f for f in os.listdir(os.path.dirname(s.tmp)) if f.endswith(".json") and "x" == f[:1] and f.startswith("x")])

    st, d = s.post("/api/processing/filter", {"session_id": sess, "audio_id": "aaaaaaaaaaaaaaaa", "filter_type": "Low-pass", "cutoff": 500, "new_audio_id": "dddddddddddddddd"})
    check("filter result keeps the requested id", st == 200 and d["audio_id"] == "dddddddddddddddd" and d["name"].endswith("[low-pass].wav"), d)
    st, d = s.post("/api/processing/weighting", {"session_id": sess, "audio_id": "aaaaaaaaaaaaaaaa", "curve": "A", "new_audio_id": "../../bad"})
    check("an unsafe id on a processing call is ignored", st == 200 and re.fullmatch(r"[0-9a-f]{12}", d["audio_id"]), d)
    st, d = s.post("/api/processing/window", {"session_id": sess, "audio_id": "bbbbbbbbbbbbbbbb", "start_sample": 0, "end_sample": 20000, "window_type": "Hanning", "new_audio_id": "wwwwwwwwwwwwwwww"})
    check("window result keeps the requested id", st == 200 and d["audio_id"] == "wwwwwwwwwwwwwwww", d)
    st, d = s.post("/api/processing/loudness_adj", {"session_id": sess, "audio_id": "bbbbbbbbbbbbbbbb", "reference_audio_id": "aaaaaaaaaaaaaaaa", "new_audio_id": "llllllllllllllll"})
    check("loudness adjustment keeps the requested id", st == 200 and d["audio_id"] == "llllllllllllllll", d)
finally:
    s.stop()

print("== hosted mode: loudness adjustment is guarded ==")
s = Server(8202, PYSQA_MEMORY_MB=512)
try:
    sess = "ids-" + uuid.uuid4().hex[:8]
    st, d = s.upload(sess, [("long1.wav", wav(12)), ("long2.wav", wav(12))], ["1111111111111111", "2222222222222222"])
    st, d = s.post("/api/processing/loudness_adj", {"session_id": sess, "audio_id": "1111111111111111", "reference_audio_id": "2222222222222222"})
    check("loudness_adj on 12 s is refused instead of exhausting memory", st == 413 and "Trim" in str(d), d)
    st, d = s.post("/api/processing/filter", {"session_id": sess, "audio_id": "1111111111111111", "filter_type": "Low-pass", "cutoff": 500, "new_audio_id": "ffffffffffffffff"})
    check("light processing still works", st == 200 and d["audio_id"] == "ffffffffffffffff", st)
finally:
    s.stop()

print("FAILS:", len(fails), fails)
sys.exit(1 if fails else 0)
