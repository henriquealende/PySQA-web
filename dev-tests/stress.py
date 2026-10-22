"""Many requests at once against the server in the container; reports peak memory, errors and speed.

usage: python stress.py [base_url]
"""
import http.client
import io
import json
import random
import sys
import threading
import time
import uuid
from urllib.parse import urlparse

import numpy as np
import soundfile as sf

base = urlparse(sys.argv[1] if len(sys.argv) > 1 else "http://127.0.0.1:8800")
sess = "str-" + uuid.uuid4().hex[:8]


def req(method, path, body=None, headers=None):
    c = http.client.HTTPConnection(base.hostname, base.port, timeout=900)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    data = r.read()
    c.close()
    try:
        return r.status, json.loads(data)
    except Exception:
        return r.status, data[:100]


def wav(seconds=10, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    x = np.where(t < seconds / 2, 0.5 * np.sin(2 * np.pi * 1000 * t), 0.1 * np.sin(2 * np.pi * 3000 * t)) + 0.01 * np.random.default_rng(3).standard_normal(t.size)
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


b = uuid.uuid4().hex
body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{sess}\r\n"
        f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"t.wav\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + wav() + f"\r\n--{b}--\r\n".encode()
st, up = req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})
aid = up[0]["audio_id"]
A = f"/api/audio/{sess}/{aid}"

peak = [0]
stop = threading.Event()


def sampler():
    while not stop.is_set():
        try:
            peak[0] = max(peak[0], req("GET", "/api/health")[1]["limits"]["rss_mb"])
        except Exception:
            pass
        time.sleep(0.4)


counts = {"ok": 0, "413": 0, "503": 0, "other": []}
lock = threading.Lock()
times = []


def worker(seed):
    rnd = random.Random(seed)
    for _ in range(6):
        t0 = rnd.uniform(0, 6)
        t1 = t0 + rnd.uniform(1, 3.5)
        kind = rnd.choices(["spectrum", "spectrogram", "envelope", "octave", "zwk", "sharp", "ipm"], weights=[3, 3, 3, 3, 1, 1, 1])[0]
        t_start = time.time()
        if kind in ("spectrum", "spectrogram", "envelope", "octave"):
            st, d = req("GET", f"{A}/{kind}?t0={t0:.3f}&t1={t1:.3f}")
        else:
            key = {"zwk": "loudness_zwk", "sharp": "sharpness_din", "ipm": "ipm"}[kind]
            st, d = req("POST", f"{A}/metrics", json.dumps({"metric_key": key, "t0": round(t0, 3), "t1": round(t1, 3)}), {"Content-Type": "application/json"})
        with lock:
            times.append((kind, time.time() - t_start))
            if st == 200:
                counts["ok"] += 1
            elif st == 413:
                counts["413"] += 1
            elif st == 503:
                counts["503"] += 1
            else:
                counts["other"].append((st, str(d)[:80]))


start_rss = req("GET", "/api/health")[1]["limits"]["rss_mb"]
threading.Thread(target=sampler, daemon=True).start()
t_all = time.time()
threads = [threading.Thread(target=worker, args=(i,)) for i in range(8)]
[t.start() for t in threads]
[t.join() for t in threads]
elapsed = time.time() - t_all
stop.set()
time.sleep(1)
end_rss = req("GET", "/api/health")[1]["limits"]["rss_mb"]
light = [s for k, s in times if k in ("spectrum", "spectrogram", "envelope", "octave")]
print(f"requests: {sum(len(v) if isinstance(v, list) else v for v in counts.values())} in {elapsed:.0f} s  ok={counts['ok']} 413={counts['413']} 503={counts['503']} other={counts['other']}")
print(f"memory: start {start_rss} MB, peak {peak[0]} MB, end {end_rss} MB (limit 512)")
print(f"light views: median {np.median(light):.2f} s, slowest {max(light):.2f} s")
