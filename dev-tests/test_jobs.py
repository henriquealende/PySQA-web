"""The compute queue: its state in /api/health, requests that are skipped when the browser leaves, and typical timings."""
import http.client
import io
import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
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


def wav(seconds=10, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    x = np.where(t < seconds / 2, 0.5 * np.sin(2 * np.pi * 1000 * t), 0.1 * np.sin(2 * np.pi * 3000 * t))
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


class Server:
    def __init__(self, port, **env):
        self.port = port
        e = dict(os.environ)
        for k in ("PYSQA_MEMORY_MB", "RENDER"):
            e.pop(k, None)
        e.update({k: str(v) for k, v in env.items()})
        e["PYSQA_TMP_DIR"] = tempfile.mkdtemp(prefix="pysqa-job-")
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

    def conn(self):
        return http.client.HTTPConnection("127.0.0.1", self.port, timeout=300)

    def req(self, method, path, body=None, headers=None):
        c = self.conn()
        c.request(method, path, body=body, headers=headers or {})
        r = c.getresponse()
        data = r.read()
        c.close()
        try:
            return r.status, json.loads(data)
        except Exception:
            return r.status, data[:100]

    def metric(self, base, **body):
        return self.req("POST", f"{base}/metrics", json.dumps(body), {"Content-Type": "application/json"})

    def heavy(self):
        return self.req("GET", "/api/health")[1]["limits"]["heavy"]

    def upload(self, session, data):
        b = uuid.uuid4().hex
        body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session}\r\n"
                f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"t.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
        return self.req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


class Pending:
    """A metric request in its own thread whose socket can be closed from outside, like a browser abort."""
    def __init__(self, server, base, **body):
        self.c = server.conn()
        self.result = None
        self.done_at = None
        self.started = time.time()
        self.t = threading.Thread(target=self._run, args=(base, json.dumps(body)))
        self.t.start()
        time.sleep(0.15)       # let the request leave before the caller goes on

    def _run(self, base, payload):
        try:
            self.c.request("POST", f"{base}/metrics", payload, {"Content-Type": "application/json"})
            r = self.c.getresponse()
            self.result = (r.status, r.read()[:80])
        except Exception as e:
            self.result = ("aborted", str(e)[:60])
        self.done_at = time.time()

    def abort(self):
        try:
            self.c.sock.shutdown(socket.SHUT_RDWR)
            self.c.sock.close()
        except Exception:
            pass

    def join(self):
        self.t.join()
        return self.result


print("== hosted mode (512 MB): the compute slot is on ==")
s = Server(8341, PYSQA_MEMORY_MB=512)
try:
    sess = "job-" + uuid.uuid4().hex[:8]
    st, d = s.upload(sess, wav())
    aid = d[0]["audio_id"]
    base = f"/api/audio/{sess}/{aid}"

    h = s.heavy()
    check("health reports an idle queue", h["running_job"] is None and h["queue"] == [], h)
    check("no timing is known before the first calculation",
          s.req("GET", "/api/health")[1]["limits"]["timing_s_per_audio_s"] == {})

    # A runs; B and C wait behind it
    A = Pending(s, base, metric_key="loudness_zwk", t0=0, t1=3, job="jobA")
    time.sleep(0.5)
    h = s.heavy()
    check("the running calculation is named in /api/health", h["running_job"] == "jobA" and h["running_kind"] == "loudness_zwk", h)
    B = Pending(s, base, metric_key="loudness_zwk", t0=1, t1=4, job="jobB")
    C = Pending(s, base, metric_key="loudness_zwk", t0=2, t1=5, job="jobC")
    time.sleep(0.4)
    h = s.heavy()
    check("the waiting ones are listed in order", h["queue"] == ["jobB", "jobC"], h)
    check("how long the running one has been going is reported", h["running_for_s"] is not None and h["running_for_s"] >= 0.3, h.get("running_for_s"))

    B.abort()                               # the user dragged the section somewhere else
    time.sleep(0.8)
    h = s.heavy()
    check("a cancelled request leaves the queue", "jobB" not in h["queue"], h)
    a = A.join()
    c = C.join()
    b = B.join()
    check("the running calculation finished normally", a[0] == 200, a)
    check("the one behind the cancelled one finished normally", c[0] == 200, c)
    t_a = A.done_at - A.started
    t_c = C.done_at - C.started
    # B was skipped, so C ran right after A: about two calculations long, not three
    check("the cancelled calculation was skipped (C took about 2 calculations, not 3)", t_c < t_a * 2.7, f"A {t_a:.1f}s, C {t_c:.1f}s")

    t0 = time.time()
    st, again = s.metric(base, metric_key="loudness_zwk", t0=1, t1=4)
    t_b = time.time() - t0
    check("asking for the cancelled one again calculates it now (it was never cached)", st == 200 and t_b > 0.4 * (t_a - 0.4), f"{t_b:.1f}s vs one calculation ~{t_a:.1f}s")
    t0 = time.time()
    s.metric(base, metric_key="loudness_zwk", t0=2, t1=5)
    check("the one that did run is cached", time.time() - t0 < 0.3, f"{time.time() - t0:.2f}s")

    h = s.heavy()
    check("the queue is empty at the end", h["running_job"] is None and h["queue"] == [], h)
    timing = s.req("GET", "/api/health")[1]["limits"]["timing_s_per_audio_s"]
    check("the server now knows how long loudness takes per second of audio", timing.get("loudness_zwk", 0) > 0, timing)

    # aborting the one that is already running: it finishes in the background and its result is kept
    R = Pending(s, base, metric_key="loudness_zwk", t0=6, t1=9, job="jobR")
    time.sleep(0.5)
    R.abort()
    time.sleep(t_a + 2)
    t0 = time.time()
    st, kept = s.metric(base, metric_key="loudness_zwk", t0=6, t1=9)
    check("a calculation already running when the browser leaves still finishes and is kept", st == 200 and time.time() - t0 < 0.3, f"{time.time() - t0:.2f}s")

    st, d = s.metric(base, metric_key="loudness_zwk", t0=7, t1=10, job="bad id!")
    check("a job name with odd characters is ignored, the request still works", st == 200, (st, str(d)[:60]))
    st, h = s.req("GET", "/api/health")
    check("the server is healthy after all of it", st == 200 and h["status"] == "ok")
finally:
    s.stop()

print("== local mode: no slot, no queue, but timings still work ==")
s = Server(8342)
try:
    sess = "job-" + uuid.uuid4().hex[:8]
    st, d = s.upload(sess, wav(6))
    base = f"/api/audio/{sess}/{d[0]['audio_id']}"
    st, r = s.metric(base, metric_key="loudness_zwk", t0=0, t1=3, job="x1")
    h = s.req("GET", "/api/health")[1]["limits"]
    check("local mode answers and reports an idle queue", st == 200 and h["heavy"]["queue"] == [] and h["heavy"]["running_job"] is None, h["heavy"])
    check("local mode records timings as well", h["timing_s_per_audio_s"].get("loudness_zwk", 0) > 0, h["timing_s_per_audio_s"])
finally:
    s.stop()

print("FAILS:", len(fails), fails)
sys.exit(1 if fails else 0)
