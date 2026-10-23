"""Drive a running server (the Linux container) like the browser does and print its resident memory after each step.

usage: python drive.py [base_url]
"""
import http.client
import io
import json
import sys
import time
import uuid
from urllib.parse import urlparse

import numpy as np
import soundfile as sf

base = urlparse(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8800")
sess = "mem-" + uuid.uuid4().hex[:8]


def req(method, path, body=None, headers=None):
    if base.scheme == 'https':
        c = http.client.HTTPSConnection(base.hostname, base.port or 443, timeout=900)
    else:
        c = http.client.HTTPConnection(base.hostname, base.port, timeout=900)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read()
    c.close()
    try:
        return r.status, json.loads(data)
    except Exception:
        return r.status, data[:100]


def post(path, obj):
    return req("POST", path, json.dumps(obj), {"Content-Type": "application/json"})


def wav(seconds=10, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    rng = np.random.default_rng(3)
    x = np.where(t < seconds / 2, 0.5 * np.sin(2 * np.pi * 1000 * t), 0.1 * np.sin(2 * np.pi * 3000 * t)) + 0.01 * rng.standard_normal(t.size)
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


def rss():
    return req("GET", "/api/health")[1]["limits"]["rss_mb"]


rows = []


def step(label, fn):
    t0 = time.time()
    st, d = fn()
    msg = ""
    if st != 200:
        msg = f"HTTP {st}: " + str(d.get("detail", d) if isinstance(d, dict) else d)[:110]
    rows.append((label, rss(), time.time() - t0, msg))


b = uuid.uuid4().hex
data = wav()
body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{sess}\r\n"
        f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"t.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
base_rss = rss()
st, up = req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})
aid = up[0]["audio_id"]
A = f"/api/audio/{sess}/{aid}"

step("upload 10 s", lambda: (200, {}))
step("waveform + spectrum (Normal view)", lambda: (req("GET", f"{A}/waveform")[0], req("GET", f"{A}/spectrum")[1]))
step("loudness_zwk section 5-8 s", lambda: post(f"{A}/metrics", {"metric_key": "loudness_zwk", "t0": 4.995, "t1": 7.975}))
step("loudness_zwk section 1-4 s", lambda: post(f"{A}/metrics", {"metric_key": "loudness_zwk", "t0": 1.0, "t1": 4.0}))
step("sharpness_din section 1-4 s", lambda: post(f"{A}/metrics", {"metric_key": "sharpness_din", "t0": 1.0, "t1": 4.0}))
step("spectrogram section 5-8 s", lambda: req("GET", f"{A}/spectrogram?t0=5&t1=8"))
step("envelope section 5-8 s", lambda: req("GET", f"{A}/envelope?t0=5&t1=8"))
step("octave whole file", lambda: req("GET", f"{A}/octave"))
step("loudness_zwk section 0-3 s", lambda: post(f"{A}/metrics", {"metric_key": "loudness_zwk", "t0": 0.0, "t1": 3.0}))
step("loudness_zwk section 6-9 s", lambda: post(f"{A}/metrics", {"metric_key": "loudness_zwk", "t0": 6.0, "t1": 9.0}))
step("ipm section 2-6 s", lambda: post(f"{A}/metrics", {"metric_key": "ipm", "t0": 2.0, "t1": 6.0}))
step("loudness_zwk WHOLE 10 s (must be refused)", lambda: post(f"{A}/metrics", {"metric_key": "loudness_zwk"}))
time.sleep(3)
rows.append(("(3 s later, idle)", rss(), 0.0, ""))

req('DELETE', A)   # remove the test file from the server
print(f"baseline rss before upload: {base_rss} MB")
print(f"{'step':46s} {'rss MB':>7s} {'sec':>6s}  note")
for label, r, secs, msg in rows:
    print(f"{label:46s} {r:7.0f} {secs:6.1f}  {msg}")
final = rows[-1][1]
lim = req("GET", "/api/health")[1]["limits"]
free = lim["memory_limit_mb"] - 40 - final
print(f"FINAL rss={final} MB; free ~{free:.0f} MB -> loudness_zwk fits about {max(0.0, (free / 1.25 - 3) / 50):.1f} s")
