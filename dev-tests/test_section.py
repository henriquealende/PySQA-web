"""Analysing only a section [t0, t1] of a file: every view, the metrics, the batch, errors and hosted limits."""
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


def two_tone(sr=48000):
    """0-5 s: 1 kHz at 0.5 FS.  5-10 s: 3 kHz at 0.1 FS (14 dB lower)."""
    t = np.arange(5 * sr) / sr
    x = np.concatenate([0.5 * np.sin(2 * np.pi * 1000 * t), 0.1 * np.sin(2 * np.pi * 3000 * t)])
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


def tone(seconds, freq, amp, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    b = io.BytesIO()
    sf.write(b, (amp * np.sin(2 * np.pi * freq * t)).astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


class Server:
    def __init__(self, port, **env):
        self.port = port
        e = dict(os.environ)
        for k in ("PYSQA_MEMORY_MB", "RENDER"):
            e.pop(k, None)
        e.update({k: str(v) for k, v in env.items()})
        self.tmp = tempfile.mkdtemp(prefix="pysqa-sec-")
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
        c = http.client.HTTPConnection("127.0.0.1", self.port, timeout=600)
        c.request(method, path, body=body, headers={"X-Lang": "en", **(headers or {})})
        r = c.getresponse()
        data = r.read()
        c.close()
        try:
            return r.status, json.loads(data)
        except Exception:
            return r.status, data[:100]

    def get(self, path):
        return self.req("GET", path)

    def post(self, path, obj):
        return self.req("POST", path, json.dumps(obj), {"Content-Type": "application/json"})

    def upload(self, session, data, name="t.wav"):
        b = uuid.uuid4().hex
        body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{session}\r\n"
                f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
        st, d = self.req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})
        return st, d

    def stop(self):
        self.proc.terminate()
        try:
            self.proc.wait(10)
        except Exception:
            self.proc.kill()


def peak(sp):
    i = int(np.argmax(sp["magnitude_db"]))
    return sp["freqs"][i], sp["magnitude_db"][i]


print("== local mode ==")
s = Server(8321)
try:
    sess = "sec-" + uuid.uuid4().hex[:8]
    st, d = s.upload(sess, two_tone())
    aid = d[0]["audio_id"]
    base = f"/api/audio/{sess}/{aid}"

    # ── spectrum ──────────────────────────────────────────────────────────────
    st, whole = s.get(f"{base}/spectrum")
    st, a = s.get(f"{base}/spectrum?t0=0&t1=5")
    st, b = s.get(f"{base}/spectrum?t0=5&t1=10")
    check("whole file reports no section", whole.get("section") is None, whole.get("section"))
    check("section reports the span it used", a["section"] == [0.0, 5.0] and b["section"] == [5.0, 10.0], (a["section"], b["section"]))
    fa, la = peak(a)
    fb, lb = peak(b)
    check("first half peaks at 1 kHz, second half at 3 kHz", abs(fa - 1000) < 30 and abs(fb - 3000) < 90, (fa, fb))
    check("second half is 14 dB lower (0.1 vs 0.5 full scale)", abs((la - lb) - 13.98) < 0.6, la - lb)
    check("the whole file shows both tones (the section did not leak)", len(whole["freqs"]) > 0 and max(whole["magnitude_db"]) > lb + 5)

    st, full_cover = s.get(f"{base}/spectrum?t0=0&t1=10")
    check("a section covering the whole file is the whole file", full_cover.get("section") is None and peak(full_cover) == peak(whole), full_cover.get("section"))
    st, clamped = s.get(f"{base}/spectrum?t0=5&t1=99")
    check("an end past the file is clamped", st == 200 and clamped["section"] == [5.0, 10.0], clamped.get("section"))
    st, open_end = s.get(f"{base}/spectrum?t0=5")
    check("only a start means 'until the end'", st == 200 and open_end["section"] == [5.0, 10.0], open_end.get("section"))

    # ── spectrogram ───────────────────────────────────────────────────────────
    st, g = s.get(f"{base}/spectrogram?t0=5&t1=10")
    check("spectrogram time axis stays on the file's timeline", st == 200 and min(g["t"]) >= 5.0 and max(g["t"]) <= 10.0 and g["section"] == [5.0, 10.0], (min(g["t"]), max(g["t"])))
    st, g2 = s.get(f"{base}/spectrogram?t0=2&t1=3")
    check("a 1 s section has about 1 s of frames", st == 200 and 2.0 <= min(g2["t"]) and max(g2["t"]) <= 3.0 and len(g2["t"]) > 20, (len(g2["t"]), min(g2["t"]), max(g2["t"])))
    st, gw = s.get(f"{base}/spectrogram")
    check("whole spectrogram starts at its first frame", gw["t"][0] < 0.1 and gw.get("section") is None, gw["t"][0])

    # ── octave ────────────────────────────────────────────────────────────────
    def loudest(o):
        lv = [(v, c) for v, c in zip(o["levels_db"], o["centres_hz"]) if v is not None]
        return max(lv)[1]
    st, o1 = s.get(f"{base}/octave?t0=0&t1=5")
    st, o2 = s.get(f"{base}/octave?t0=5&t1=10&weighting=A")
    check("1/3-octave of each half: 1 kHz band, then 3.15 kHz band", loudest(o1) == 1000 and loudest(o2) == 3150, (loudest(o1), loudest(o2)))
    check("octave reports the section and the weighting", o2["section"] == [5.0, 10.0] and o2["weighting"] == "A")

    # ── envelope ──────────────────────────────────────────────────────────────
    st, e = s.get(f"{base}/envelope?t0=5&t1=10")
    check("envelope of a section: times inside it, flagged reduced", st == 200 and min(e["t"]) >= 5.0 and max(e["t"]) <= 10.0 and e["reduced"] is True and e["section"] == [5.0, 10.0], (min(e["t"]), max(e["t"])))
    amp = max(e["signal"])
    check("envelope sees the 0.1 amplitude of the second half only", 0.09 < amp < 0.11, amp)
    st, es = s.get(f"{base}/envelope?t0=4.99&t1=5.06")
    check("a 70 ms section is not reduced", st == 200 and es["reduced"] is False and len(es["t"]) == len(es["signal"]), (es.get("reduced"), len(es["t"])))

    # ── metrics ───────────────────────────────────────────────────────────────
    st, m_whole = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk"})
    st, m1 = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 0, "t1": 5})
    st, m2 = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 5, "t1": 10})
    check("loudness of the louder half > the quieter half", m1["global"] > m2["global"] > 0, (m1["global"], m2["global"], m_whole["global"]))
    check("metric section is reported; whole-file result has none", m1["section"] == [0.0, 5.0] and "section" not in m_whole)
    tt = m2["time_data"]["t"]
    check("metric time-varying axis is on the file's timeline", min(tt) >= 5.0 and max(tt) <= 10.0, (min(tt), max(tt)))
    st, m1b = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 0, "t1": 5})
    check("the same section answers again identically (cache)", m1b == m1)
    st, m_whole2 = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk"})
    check("the whole-file result was not overwritten by a section", m_whole2["global"] == m_whole["global"] and "section" not in m_whole2)

    # ── cache is bounded ──────────────────────────────────────────────────────
    for k in range(10):
        s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": k * 0.9, "t1": k * 0.9 + 1.0})
    time.sleep(1.5)
    saved = json.load(open(os.path.join(s.tmp, f"{sess}.json"), encoding="utf-8"))
    keys = list(saved["entries"][aid]["cache"].keys())
    sec_keys = [k for k in keys if "|s" in k]
    check("section results kept per file are limited", 0 < len(sec_keys) <= 8, f"{len(sec_keys)} of {len(keys)} cache entries")
    check("the whole-file result is still cached", any(k.startswith("metric_loudness_zwk_free_raw") and "|s" not in k for k in keys), keys[:3])

    # ── errors ────────────────────────────────────────────────────────────────
    st, d1 = s.get(f"{base}/spectrum?t0=20&t1=25")
    check("a section after the end of the file is a readable 400", st == 400 and "lasts only" in str(d1), (st, d1))
    st, d2 = s.get(f"{base}/spectrum?t0=1&t1=1.01")
    check("a section shorter than 0.05 s is a 400", st == 400 and "at least" in str(d2), (st, d2))
    st, d3 = s.get(f"{base}/spectrum?t0=3&t1=2")
    check("an end before the start is a 400", st == 400, (st, d3))
    st, d4 = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 20, "t1": 21})
    check("the metrics endpoint answers 400 too (not 500)", st == 400 and "lasts only" in str(d4), (st, d4))
    st, d5 = s.get(f"{base}/spectrum?t0=-1&t1=2")
    check("a negative start is refused", st == 422, st)

    # ── calibration ───────────────────────────────────────────────────────────
    s.post(f"{base}/calibrate", {"sensitivity_mv_pa": 50})
    st, c1 = s.get(f"{base}/spectrum?t0=5&t1=10")
    check("a calibrated section is in dB SPL", c1["calibrated"] is True and c1["section"] == [5.0, 10.0])
    st, c2 = s.get(f"{base}/octave?t0=0&t1=5")
    check("a calibrated octave section is in dB SPL", c2["calibrated"] is True and loudest(c2) == 1000)

    # ── batch ─────────────────────────────────────────────────────────────────
    st, d = s.upload(sess, tone(2, 500, 0.3), "short.wav")
    bid = d[0]["audio_id"]
    st, bt = s.post(f"/api/audio/{sess}/batch", {"audio_ids": [aid, bid], "metric_keys": ["loudness_zwk"],
                                                  "sections": {aid: [5, 10], bid: [10, 12]}})
    rows = {r["audio_id"]: r for r in bt["rows"]}
    check("batch: the file with a valid section uses it", rows[aid]["section"] == [5.0, 10.0] and rows[aid]["loudness_zwk"] is not None, rows[aid])
    check("batch: an invalid section is reported, the others carry on",
          rows[bid]["loudness_zwk"] is None and any(x["metric"] == "section" and x["audio_id"] == bid for x in bt["skipped"]), bt["skipped"])
    st, bt2 = s.post(f"/api/audio/{sess}/batch", {"audio_ids": [aid], "metric_keys": ["loudness_zwk"]})
    check("batch without sections analyses the whole file", bt2["rows"][0]["section"] is None and bt2["rows"][0]["loudness_zwk"] != rows[aid]["loudness_zwk"], bt2["rows"][0])
finally:
    s.stop()

print("== hosted mode (512 MB) ==")
s = Server(8322, PYSQA_MEMORY_MB=512)
try:
    sess = "sech-" + uuid.uuid4().hex[:8]
    st, d = s.upload(sess, two_tone())
    aid = d[0]["audio_id"]
    base = f"/api/audio/{sess}/{aid}"
    st, big = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk"})
    check("a 10 s file is too much for loudness ISO 532-1 on 512 MB", st == 413, (st, big))
    check("the refusal tells the user to select a section", "Select a section" in str(big) and "Section bar" in str(big), big)
    st, ok = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 5, "t1": 8})
    check("the same file works as a 3 s section", st == 200 and ok["global"] > 0 and ok["section"] == [5.0, 8.0], (st, str(ok)[:150]))
    st, ok2 = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 0, "t1": 3})
    check("any 3 s section works, not just one", st == 200 and ok2["global"] > ok["global"], (st, ok2.get("global") if isinstance(ok2, dict) else ok2))
    st, tooBig = s.post(f"{base}/metrics", {"metric_key": "loudness_zwk", "t0": 0, "t1": 9})
    check("a section that is still too long is refused with its own length", st == 413 and "9.0 s" in str(tooBig), (st, tooBig))
    st, bt = s.post(f"/api/audio/{sess}/batch", {"audio_ids": [aid], "metric_keys": ["loudness_zwk"]})
    check("batch on the whole file reports the skip", bt["rows"][0]["loudness_zwk"] is None and len(bt["skipped"]) == 1, bt["skipped"])
    st, bt = s.post(f"/api/audio/{sess}/batch", {"audio_ids": [aid], "metric_keys": ["loudness_zwk"], "sections": {aid: [5, 8]}})
    check("batch with a section computes it", bt["rows"][0]["loudness_zwk"] is not None and bt["skipped"] == [], bt)
    st, sp = s.get(f"{base}/spectrum?t0=1&t1=4")
    check("views accept a section in hosted mode", st == 200 and sp["section"] == [1.0, 4.0])
finally:
    s.stop()

print("FAILS:", len(fails), fails)
sys.exit(1 if fails else 0)
