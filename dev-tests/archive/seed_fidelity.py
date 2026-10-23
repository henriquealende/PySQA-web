"""Upload one file of each WAV flavour to a running server and print the ids (for the browser playback check)."""
import http.client
import io
import json
import sys
import uuid

import numpy as np
import soundfile as sf

port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
sess = "play-" + uuid.uuid4().hex[:8]
SR = 48000
T = np.arange(SR) / SR
TONE = np.sin(2 * np.pi * 440 * T)


def req(method, path, body=None, headers=None):
    c = http.client.HTTPConnection("127.0.0.1", port, timeout=120)
    c.request(method, path, body=body, headers=headers or {})
    r = c.getresponse()
    d = r.read()
    c.close()
    return r.status, json.loads(d)


def upload(data, name):
    b = uuid.uuid4().hex
    body = (f"--{b}\r\nContent-Disposition: form-data; name=\"session_id\"\r\n\r\n{sess}\r\n"
            f"--{b}\r\nContent-Disposition: form-data; name=\"files\"; filename=\"{name}\"\r\nContent-Type: audio/wav\r\n\r\n").encode() + data + f"\r\n--{b}--\r\n".encode()
    return req("POST", "/api/audio/upload", body, {"Content-Type": f"multipart/form-data; boundary={b}"})


out = {"session": sess, "files": {}}
for key, sub, amp in [("pcm8", "PCM_U8", 0.5), ("pcm16", "PCM_16", 0.5), ("pcm24", "PCM_24", 0.5), ("pcm32", "PCM_32", 0.5),
                      ("float32", "FLOAT", 0.5), ("float32_loud", "FLOAT", 1.5), ("float64", "DOUBLE", 0.5)]:
    b = io.BytesIO()
    sf.write(b, amp * TONE, SR, format="WAV", subtype=sub)
    st, d = upload(b.getvalue(), f"{key}.wav")
    out["files"][key] = d[0]["audio_id"]

st, d = req("POST", "/api/processing/filter", json.dumps({"session_id": sess, "audio_id": out["files"]["float32"], "filter_type": "1/3-Octave band", "octave_gains_db": [24.0] * 31}),
            {"Content-Type": "application/json"})
out["files"]["processed_loud"] = d["audio_id"]
print(json.dumps(out))
