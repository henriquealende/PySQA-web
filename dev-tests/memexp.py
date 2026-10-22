"""Resident memory after heavy computations, with different remedies. Runs inside the Linux container.

usage: python memexp.py <none|trim|mallopt|both>
"""
import ctypes
import io
import os
import sys
import time

import numpy as np
import soundfile as sf

sys.path.insert(0, "/app/backend")
mode = sys.argv[1] if len(sys.argv) > 1 else "none"

libc = ctypes.CDLL("libc.so.6")
if mode in ("mallopt", "both"):
    libc.mallopt(-3, 256 * 1024)     # M_MMAP_THRESHOLD: big blocks are always mmap'ed and returned on free
    libc.mallopt(-1, 256 * 1024)     # M_TRIM_THRESHOLD

from utils import limits                      # noqa: E402
import services.audio_service as svc          # noqa: E402

assert limits.ENABLED, "run the container with --memory=512m"


def wav(seconds=10, sr=48000):
    t = np.arange(int(seconds * sr)) / sr
    rng = np.random.default_rng(3)
    x = np.where(t < seconds / 2, 0.5 * np.sin(2 * np.pi * 1000 * t), 0.1 * np.sin(2 * np.pi * 3000 * t)) + 0.01 * rng.standard_normal(t.size)
    b = io.BytesIO()
    sf.write(b, x.astype("float32"), sr, format="WAV", subtype="PCM_16")
    return b.getvalue()


entry = svc.load_wav(wav(), "exp.wav")
rows = []
base = limits.rss_mb()


def step(label, fn):
    t0 = time.time()
    try:
        fn()
        status = "ok"
    except Exception as e:
        status = f"{type(e).__name__}: {str(e)[:70]}"
    if mode in ("trim", "both"):
        libc.malloc_trim(0)
    rows.append((label, limits.rss_mb(), time.time() - t0, status))


print(f"mode={mode}  baseline rss={base:.0f} MB  limit={limits.MEMORY_LIMIT_MB:.0f} MB")
for round_no in (1, 2):
    for k, (a, b) in enumerate([(0.0, 3.0), (3.0, 6.0), (6.0, 9.0)]):
        step(f"r{round_no} loudness_zwk {a:g}-{b:g}s", lambda a=a, b=b: svc.compute_metric(entry, "loudness_zwk", t0=a + 0.01 * round_no, t1=b))
    step(f"r{round_no} sharpness_din 2-4s", lambda: svc.compute_metric(entry, "sharpness_din", t0=2 + 0.01 * round_no, t1=4))
    step(f"r{round_no} ipm 1-5s", lambda: svc.compute_metric(entry, "ipm", t0=1 + 0.01 * round_no, t1=5))
    step(f"r{round_no} spectrogram whole 10s", lambda: svc.compute_spectrogram(entry, {"nfft": 2048 + 0 * round_no}))
    step(f"r{round_no} envelope whole 10s", lambda: svc.compute_envelope(entry))
    step(f"r{round_no} octave whole 10s", lambda: svc.compute_octave_bands(entry))
    step(f"r{round_no} spectrum whole 10s", lambda: svc.compute_spectrum(entry))

print(f"{'step':36s} {'rss MB':>7s} {'sec':>6s}  status")
for label, rss, secs, status in rows:
    print(f"{label:36s} {rss:7.0f} {secs:6.1f}  {status}")
final = limits.rss_mb()
free = limits.MEMORY_LIMIT_MB - limits.RESERVE_MB - final
print(f"FINAL rss={final:.0f} MB  (baseline {base:.0f})  free for a calculation ~{free:.0f} MB  -> loudness_zwk fits about {max(0.0, (free / limits.SAFETY - 3) / 50):.1f} s")
