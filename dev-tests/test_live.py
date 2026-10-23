"""Safe checks against the live service: only light calls and calls that must be REFUSED."""
import http.client
import io
import json
import ssl
import sys
import time
import uuid

import numpy as np
import soundfile as sf

HOST = "pysqa-web.onrender.com"
fails = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (" -> " + str(detail)[:220] if detail != "" else ""), flush=True)
    if not ok:
        fails.append(name)


def req(method, path, body=None, headers=None):
    c = http.client.HTTPSConnection(HOST, timeout=120, context=ssl.create_default_context())
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    raw = r.read()
    c.close()
    try:
        return r.status, json.loads(raw)
    except Exception:
        return r.status, raw[:120]


def wav(seconds, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    x = 0.25 * np.sin(2 * np.pi * 1000 * t) * (1 + 0.5 * np.sin(2 * np.pi * 4 * t)) + 0.08 * np.sin(2 * np.pi * 3000 * t)
    x = x + 0.02 * np.random.default_rng(0).standard_normal(t.size)
    x[int(1.37 * sr): int(1.37 * sr) + 10] = 1.0       # 10-sample clipped burst
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


def upload(sess, data, name="live.wav"):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{sess}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    return req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})


def metric(sess, aid, key):
    return req("POST", f"/api/audio/{sess}/{aid}/metrics", json.dumps({"metric_key": key}), {"Content-Type": "application/json"})


st, h = req("GET", "/api/health")
lim = h.get("limits", {}) if st == 200 else {}
check("limits are on and 512 MB was detected", lim.get("enabled") and lim.get("memory_limit_mb") == 512, lim)
if not (lim.get("enabled") and lim.get("memory_limit_mb") == 512):
    print("ABORT: not running any heavy-metric probe without active limits")
    sys.exit(2)

sess = "live-" + uuid.uuid4().hex[:6]
st, d = upload(sess, wav(4))
check("4 s upload accepted", st == 200, st)
aid = d[0]["audio_id"]

st, d = req("GET", f"/api/audio/{sess}/{aid}/spectrum")
mags = d.get("magnitude_db", []) if st == 200 else []
check("spectrum shows the 1 kHz tone (peak above -25 dBFS)", st == 200 and mags and max(mags) > -25, f"max {max(mags):.1f} dBFS, {len(mags)} points" if mags else d)
st, d = req("GET", f"/api/audio/{sess}/{aid}/waveform")
check("waveform keeps the clipped burst", st == 200 and d.get("peak", 0) >= 0.999 and max(d.get("amplitude", [0])) >= 0.999, f"peak {d.get('peak')}")
st, d = req("GET", f"/api/audio/{sess}/{aid}/octave")
levels = [v for v in d.get("levels_db", []) if v is not None] if st == 200 else []
check("1/3-octave still served", st == 200 and levels, st)

st, d = metric(sess, aid, "ipm")
check("light metric runs (ipm)", st == 200 and "global" in d, st)
st, d = metric(sess, aid, "roughness_ecma")
check("roughness_ecma refused instead of crashing", st == 413 and "Even 1 s" in str(d), d)
st, d = metric(sess, aid, "tonality_ecma")
check("tonality_ecma refused instead of crashing", st == 413, d)
st, d = metric(sess, aid, "loudness_ecma")
check("loudness_ecma 4 s refused with a trim hint", st == 413 and "Trim" in str(d), d)

st, d = upload(sess, wav(70), "long.wav")
check("70 s upload refused", st == 413 and "60 s" in str(d), d)

time.sleep(2)
st, h2 = req("GET", "/api/health")
check("service still up after the refused heavy calls", st == 200, h2.get("limits", {}))
print("FAILS:", fails)
sys.exit(1 if fails else 0)
