"""What does the server do today to the audio it stores, for each kind of WAV?"""
import io
import os
import sys
import tempfile

import numpy as np
import soundfile as sf

sys.path.insert(0, os.getcwd())
os.environ.setdefault("PYSQA_TMP_DIR", tempfile.mkdtemp(prefix="pysqa-wav-"))
import services.audio_service as svc          # noqa: E402

sr = 48000
t = np.arange(sr) / sr
tone = np.sin(2 * np.pi * 1000 * t)


def make(subtype, amp):
    b = io.BytesIO()
    sf.write(b, (amp * tone).astype(np.float64), sr, format="WAV", subtype=subtype)
    return b.getvalue()


def stored_back(entry):
    """What a download / playback / server restart gets: the stored copy read again."""
    data, _ = sf.read(str(entry.raw_path), dtype="float64")
    info = sf.info(str(entry.raw_path))
    return data, info


print(f"{'source':26s} {'stored as':16s} {'max |error| vs analysis data':>30s}   notes")
for subtype, amp in [("PCM_16", 0.5), ("PCM_24", 0.5), ("PCM_32", 0.5), ("FLOAT", 0.5), ("DOUBLE", 0.5),
                     ("FLOAT", 1.5), ("PCM_U8", 0.5)]:
    raw = make(subtype, amp)
    try:
        entry = svc.load_wav(raw, "x.wav")
    except Exception as e:
        print(f"{subtype + ' amp ' + str(amp):26s} load failed: {type(e).__name__}: {e}")
        continue
    back, info = stored_back(entry)
    ref = entry.data if entry.data.ndim == 1 else entry.data[:, 0]
    n = min(len(ref), len(back))
    err = float(np.max(np.abs(ref[:n] - back[:n])))
    peak_ref = float(np.max(np.abs(ref)))
    note = f"analysis peak {peak_ref:.3f}"
    if peak_ref > 1.0:
        note += f", stored peak {float(np.max(np.abs(back))):.3f}  <-- loud part damaged"
    print(f"{subtype + ' amp ' + str(amp):26s} {info.subtype:16s} {err:30.2e}   {note}")

# derived file (filter / window / loudness adjustment) with values beyond full scale
entry = svc.load_wav(make("FLOAT", 0.9), "y.wav")
loud = svc._derive(entry, entry.data * 3.0, "[x3]")
back, info = stored_back(loud)
print(f"{'derived, signal x3 (peak 2.7)':26s} {info.subtype:16s} {float(np.max(np.abs(loud.data - back[:len(loud.data)]))):30.2e}   stored peak {float(np.max(np.abs(back))):.3f}")

# 16-bit source: is the stored copy bit-exact?
raw16 = make("PCM_16", 0.5)
e16 = svc.load_wav(raw16, "z.wav")
orig = sf.read(io.BytesIO(raw16), dtype="int16")[0]
copy = sf.read(str(e16.raw_path), dtype="int16")[0]
print("16-bit source -> stored copy identical, sample for sample:", bool(np.array_equal(orig, copy)))
