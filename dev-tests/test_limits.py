"""End-to-end checks of the hosted-mode limits. Run with the backend venv from the backend folder."""
import http.client
import io
import json
import os
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
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail) if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


def wav_bytes(seconds, sr=48000, ch=1, silent=False):
    n = int(seconds * sr)
    x = np.zeros((n, ch), dtype="float32") if silent else (0.2 * np.random.default_rng(0).standard_normal((n, ch))).astype("float32")
    buf = io.BytesIO()
    sf.write(buf, x if ch > 1 else x[:, 0], sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def multipart(session, name, data):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    return body, {"Content-Type": f"multipart/form-data; boundary={b}"}


class Server:
    def __init__(self, port, **env):
        self.port = port
        e = dict(os.environ)
        for k in ("PYSQA_MEMORY_MB", "RENDER"):
            e.pop(k, None)
        e.update({k: str(v) for k, v in env.items()})
        e["PYTHONDONTWRITEBYTECODE"] = "1"
        e.setdefault("PYSQA_TMP_DIR", tempfile.mkdtemp(prefix="pysqa-test-"))
        self.proc = subprocess.Popen([sys.executable, "-m", "uvicorn", "main:app", "--host", "127.0.0.1", "--port", str(port)],
                                     cwd=BACKEND, env=e, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        for _ in range(60):
            try:
                if self.req("GET", "/api/health")[0] == 200:
                    return
            except Exception:
                time.sleep(1)
        raise RuntimeError("server did not start")

    def req(self, method, path, body=None, headers=None, timeout=300):
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=timeout)
        c.request(method, path, body=body, headers={"X-Lang": "en", **(headers or {})})
        r = c.getresponse()
        raw = r.read()
        try:
            data = json.loads(raw)
        except Exception:
            data = raw[:200]
        c.close()
        return r.status, data

    def upload(self, session, data, name="t.wav"):
        body, h = multipart(session, name, data)
        return self.req("POST", "/api/audio/upload", body, h)

    def metric(self, session, aid, key):
        return self.req("POST", f"/api/audio/{session}/{aid}/metrics", json.dumps({"metric_key": key}), {"Content-Type": "application/json"})

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


# ── 0. startup must never delete session files left by an earlier run ─────────
print("== startup keeps old session files ==")
old_dir = tempfile.mkdtemp(prefix="pysqa-old-")
old_wav = os.path.join(old_dir, "a1.wav")
sf.write(old_wav, np.zeros(4800, dtype="float32"), 48000, subtype="PCM_16")
old_json = os.path.join(old_dir, "oldsess.json")
with open(old_json, "w", encoding="utf-8") as fh:
    json.dump({"session_id": "oldsess", "entries": {"a1": {"audio_id": "a1", "name": "x.wav", "sample_rate": 48000,
               "channels": 1, "duration_s": 0.1, "raw_path": old_wav, "calibration_pa": None, "cache": {}}}}, fh)
five_hours_ago = time.time() - 5 * 3600
os.utime(old_json, (five_hours_ago, five_hours_ago))
s = Server(8100, PYSQA_MEMORY_MB=512, PYSQA_TMP_DIR=old_dir)
try:
    st, d = s.req("GET", "/api/audio/list/oldsess")
    check("stale session is not loaded into RAM", st == 200 and d == [], d)
    check("stale session files are left on disk", os.path.exists(old_json) and os.path.exists(old_wav))
finally:
    s.stop()

# ── 1. hosted mode (512 MB) ───────────────────────────────────────────────────
print("== hosted mode, 512 MB ==")
s = Server(8101, PYSQA_MEMORY_MB=512)
try:
    st, h = s.req("GET", "/api/health")
    lim = h.get("limits", {})
    check("health reports limits", lim.get("enabled") is True and lim.get("memory_limit_mb") == 512, lim)
    sess = "t-" + uuid.uuid4().hex[:6]
    st, d = s.upload(sess, wav_bytes(3))
    check("3 s upload accepted", st == 200, st)
    aid = d[0]["audio_id"] if st == 200 else ""
    st, d = s.upload(sess, wav_bytes(70))
    check("70 s upload refused with 413", st == 413 and "60 s" in str(d), d)
    st, d = s.upload(sess, wav_bytes(90, sr=96000, ch=2, silent=True))
    check("oversized file refused with 413", st == 413 and "30 MB" in str(d), d)
    st, d = s.metric(sess, aid, "ipm")
    check("light metric (ipm, 3 s) runs", st == 200 and "global" in d, st)
    st, d = s.metric(sess, aid, "roughness_ecma")
    check("roughness_ecma refused before it can crash", st == 413 and "needs about" in str(d), d)
    # the lean Loudness ECMA needs about 60 MB per second, so on 512 MB it is a 6 s file that no longer fits (3 s does)
    st, d6 = s.upload(sess, wav_bytes(6))
    aid6 = d6[0]["audio_id"] if st == 200 else ""
    st, d = s.metric(sess, aid6, "loudness_ecma")
    check("loudness_ecma 6 s refused with a section hint", st == 413 and "Select a section" in str(d), d)
    st, d = s.metric(sess, aid, "loudness_ecma")
    check("loudness_ecma 3 s fits on 512 MB now", st == 200 and d.get("global", 0) > 0, d.get("global") if st == 200 else d)
    sess2 = "t-" + uuid.uuid4().hex[:6]
    st, d = s.upload(sess2, wav_bytes(12))
    aid12 = d[0]["audio_id"] if st == 200 else ""
    st, d = s.metric(sess2, aid12, "loudness_zwk")
    check("loudness_zwk on 12 s refused with a section hint", st == 413 and "Select a section" in str(d), d)
    st, d = s.req("POST", f"/api/audio/{sess}/batch", json.dumps({"audio_ids": [aid], "metric_keys": ["ipm", "roughness_ecma"]}), {"Content-Type": "application/json"})
    row = d["rows"][0] if st == 200 else {}
    check("batch skips the heavy metric and says why", st == 200 and row.get("ipm") is not None and row.get("roughness_ecma") is None and len(d.get("skipped", [])) == 1, d.get("skipped"))
    st, d = s.req("GET", f"/api/audio/{sess}/{aid}/waveform")
    check("waveform still served", st == 200 and "peak" in d, st)
    st, h = s.req("GET", "/api/health")
    check("server still healthy", st == 200, h["limits"].get("audio_ram_mb"))
finally:
    s.stop()

# ── 2. tiny caps: file count and audio RAM ────────────────────────────────────
print("== tiny caps ==")
s = Server(8102, PYSQA_MEMORY_MB=512, PYSQA_MAX_FILES_PER_SESSION=2, PYSQA_MAX_AUDIO_RAM_MB=3)
try:
    sess = "t-" + uuid.uuid4().hex[:6]
    codes = [s.upload(sess, wav_bytes(3), f"f{i}.wav")[0] for i in range(3)]
    check("RAM budget stops the third 3 s file", codes[:2] == [200, 200] and codes[2] == 413, codes)
    st, d = s.upload(sess, wav_bytes(3), "again.wav")
    check("message explains the memory is full", st == 413 and "memory is full" in str(d), d)
    st, d = s.req("GET", f"/api/audio/list/{sess}")
    check("refused uploads left no entries behind", st == 200 and len(d) == 2, len(d) if isinstance(d, list) else d)
finally:
    s.stop()
s = Server(8103, PYSQA_MEMORY_MB=512, PYSQA_MAX_FILES_PER_SESSION=2)
try:
    sess = "t-" + uuid.uuid4().hex[:6]
    codes = [s.upload(sess, wav_bytes(1), f"f{i}.wav")[0] for i in range(3)]
    check("file-count cap stops the third file", codes == [200, 200, 413], codes)
finally:
    s.stop()

# ── 3. local mode: nothing is restricted ──────────────────────────────────────
print("== local mode (no limit detected) ==")
s = Server(8104)
try:
    st, h = s.req("GET", "/api/health")
    check("limits are off locally", h["limits"]["enabled"] is False, h["limits"])
    sess = "t-" + uuid.uuid4().hex[:6]
    st, d = s.upload(sess, wav_bytes(70))
    check("70 s upload accepted locally", st == 200, st)
    st, d = s.upload(sess, wav_bytes(3))
    aid = d[0]["audio_id"]
    st, d = s.metric(sess, aid, "loudness_ecma")
    check("loudness_ecma runs locally", st == 200 and d.get("global", 0) > 0, d.get("global") if st == 200 else d)
finally:
    s.stop()

# ── 4. in-process: eviction, idle expiry and the compute slot ─────────────────
print("== in-process ==")
os.environ["PYSQA_MEMORY_MB"] = "512"
os.environ["PYSQA_HEAVY_WAIT_S"] = "1"
os.environ["PYSQA_MAX_AUDIO_RAM_MB"] = "10"
os.environ["PYSQA_TMP_DIR"] = tempfile.mkdtemp(prefix="pysqa-unit-")
sys.path.insert(0, BACKEND)
from pathlib import Path
from services import session_store as ss
from services.session_store import AudioEntry
from utils import limits
from utils.lang import set_lang
set_lang("en")


def fake(aid, mb):
    p = ss.TMP_DIR / f"{aid}.wav"
    p.write_bytes(b"x")
    return AudioEntry(audio_id=aid, name=aid, sample_rate=48000, channels=1, duration_s=mb, data=np.zeros(int(mb * 131072)), raw_path=p)


# time limit of one calculation (MAX_COMPUTE_S, 75 s by default when hosted)
check("time limit is on when hosted", limits.MAX_COMPUTE_S == 75, limits.MAX_COMPUTE_S)
limits.check_time("roughness_dw", 25, 48000)
check("a calculation that fits the time limit passes", True)
try:
    limits.check_time("roughness_dw", 40, 48000)
    check("a calculation expected to take too long is refused", False, "no error raised")
except limits.ResourceLimitError as exc:
    check("a calculation expected to take too long is refused", "single calculation" in str(exc) and "about 30 s" in str(exc), str(exc)[:110])
try:
    limits.check_time("tonality_ecma", 40, 48000, time_kind="tonality_ecma_fast")
    check("Tonality Fast has its own, shorter, time model", limits.estimate_s("tonality_ecma", 40, 48000) > 75 >= limits.estimate_s("tonality_ecma_fast", 40, 48000))
except limits.ResourceLimitError as exc:
    check("Tonality Fast has its own, shorter, time model", False, exc)
limits.check_time("loudness_zwk", 60, 48000, time_kind="")
check("an empty time_kind skips the check (stationary loudness of the match)", True)
check("quick analyses are not time-limited", limits.estimate_s("spectrum", 240, 48000) is None and limits.estimate_s("sharpness_din", 240, 48000) is None)
check("sharpness no longer costs 51 MB per second", limits.COST["sharpness_din"][1] < 5, limits.COST["sharpness_din"])
check("sample rate scales the expected time", abs(limits.estimate_s("roughness_dw", 10, 96000) - (1.0 + 2.5 * 20)) < 1e-6)
check("/api/health data carries the new fields", {"max_compute_s", "peak_rss_mb"} <= set(limits.describe()))

ss.add_entry("old-session", fake("o1", 4)); ss.add_entry("recent-session", fake("r1", 4))
ss._last_seen["old-session"] = time.time() - 600
ss._last_seen["recent-session"] = time.time() - 5
try:
    ss.ensure_room("new-session", 4)
    check("idle session is evicted to make room", "old-session" not in ss._sessions and "recent-session" in ss._sessions and not (ss.TMP_DIR / "o1.wav").exists(), list(ss._sessions))
except limits.ResourceLimitError as exc:
    check("idle session is evicted to make room", False, exc)
try:
    ss.ensure_room("new-session", 8)
    check("a recently active session is never evicted", False, "no error raised")
except limits.ResourceLimitError as exc:
    check("a recently active session is never evicted", "recent-session" in ss._sessions and "memory is full" in str(exc), str(exc)[:60])
ss._last_seen["recent-session"] = time.time() - 4000
check("evict_idle drops sessions past the idle limit", ss.evict_idle(1800) == 1 and "recent-session" not in ss._sessions and not (ss.TMP_DIR / "r1.wav").exists())

holder_done = threading.Event()
def holder():
    with limits.heavy_slot():
        time.sleep(2.5)
    holder_done.set()
t = threading.Thread(target=holder); t.start(); time.sleep(0.3)
t0 = time.time()
try:
    with limits.heavy_slot():
        check("second heavy job waits for the slot", False, "got the slot immediately")
except limits.ServerBusyError as exc:
    check("second heavy job waits, then gets a 'busy' error", 0.8 < time.time() - t0 < 2.0, f"{time.time()-t0:.1f}s")
t.join()
with limits.heavy_slot():
    check("slot is released afterwards", True)

print("FAILS:", len(fails), fails)
sys.exit(1 if fails else 0)
