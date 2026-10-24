"""Reference + benchmark harness for Tonality ECMA-418-2 (phase 0 of the low-level speed-up plan).

Run with the backend venv from the backend folder:

    python ../dev-tests/bench_tonality_ecma.py record            # run the installed package, save the reference
    python ../dev-tests/bench_tonality_ecma.py compare MOD:FUNC  # run a candidate and compare with the reference
    python ../dev-tests/bench_tonality_ecma.py record --quick    # 2 s signals instead of 10 s

Each case runs in its own process so the peak memory (working set) is that case alone.
The reference goes to dev-tests/ref_tonality/ (ignored by git: it is regenerated in a minute).
"""
import importlib
import json
import os
import subprocess
import sys
import time
import warnings

warnings.filterwarnings("ignore")
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))
REF_DIR = os.path.join(HERE, "ref_tonality")
SR = 48000
P0 = 20e-6
KEYS = ("tonality_avg", "tonality_t", "time_out", "spec_tonality_avg", "spec_tonality_avg_freqs", "band_centre_freqs",
        "tonality_t_freqs")
CASES = ("tone1k", "noise", "tone_noise", "am_tone", "harmonics", "wav")  # "wav" only if PYSQA_BENCH_WAV is set


def pa(x, spl_db):
    """Scale to the given RMS level in dB SPL (pressure in Pa)."""
    return x / np.sqrt(np.mean(x ** 2)) * P0 * 10 ** (spl_db / 20)


def make_signal(case, dur):
    n = int(dur * SR)
    t = np.arange(n) / SR
    rng = np.random.default_rng(42)
    if case == "tone1k":
        return pa(np.sin(2 * np.pi * 1000 * t), 60)
    if case == "noise":
        return pa(rng.standard_normal(n), 60)
    if case == "tone_noise":
        return pa(np.sin(2 * np.pi * 1000 * t) + 0.3 * rng.standard_normal(n), 60)
    if case == "am_tone":
        return pa((1 + 0.8 * np.sin(2 * np.pi * 4 * t)) * np.sin(2 * np.pi * 500 * t), 65)
    if case == "harmonics":
        f0 = 220
        return pa(sum(np.sin(2 * np.pi * f0 * k * t) / k for k in range(1, 9)) + 0.05 * rng.standard_normal(n), 70)
    if case == "wav":
        import soundfile as sf
        x, sr = sf.read(os.environ["PYSQA_BENCH_WAV"], always_2d=True)
        assert sr == SR, f"the WAV must be {SR} Hz"
        return pa(x[: int(dur * SR), 0], 65)
    raise ValueError(case)


def load_impl(spec):
    if not spec:
        from sottek_hearing_model import shm_tonality_ecma
        return shm_tonality_ecma
    mod, func = spec.split(":")
    sys.path.insert(0, os.getcwd())
    return getattr(importlib.import_module(mod), func)


def peak_mb():
    try:
        import ctypes
        from ctypes import wintypes

        class PMC(ctypes.Structure):
            _fields_ = [("cb", wintypes.DWORD), ("PageFaultCount", wintypes.DWORD),
                        ("PeakWorkingSetSize", ctypes.c_size_t), ("WorkingSetSize", ctypes.c_size_t),
                        ("QuotaPeakPagedPoolUsage", ctypes.c_size_t), ("QuotaPagedPoolUsage", ctypes.c_size_t),
                        ("QuotaPeakNonPagedPoolUsage", ctypes.c_size_t), ("QuotaNonPagedPoolUsage", ctypes.c_size_t),
                        ("PagefileUsage", ctypes.c_size_t), ("PeakPagefileUsage", ctypes.c_size_t)]
        pmc = PMC()
        pmc.cb = ctypes.sizeof(PMC)
        k32, ps = ctypes.WinDLL("kernel32"), ctypes.WinDLL("psapi")
        k32.GetCurrentProcess.restype = wintypes.HANDLE
        ps.GetProcessMemoryInfo.argtypes = [wintypes.HANDLE, ctypes.POINTER(PMC), wintypes.DWORD]
        ps.GetProcessMemoryInfo(k32.GetCurrentProcess(), ctypes.byref(pmc), pmc.cb)
        return pmc.PeakWorkingSetSize / 1048576
    except Exception:
        import resource
        return resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024


def child(case, dur, spec, out_npz):
    """Runs one case in this process and prints a JSON line with time and peak memory."""
    func = load_impl(spec)
    x = make_signal(case, dur)
    base = peak_mb()
    t0 = time.perf_counter()
    r = func(x, SR, soundfield="free_frontal", wait_bar=False)
    elapsed = time.perf_counter() - t0
    np.savez(out_npz, **{k: np.asarray(r[k]) for k in KEYS})
    print("RESULT " + json.dumps({"case": case, "seconds": round(elapsed, 3),
                                  "peak_mb": round(peak_mb(), 1), "base_mb": round(base, 1)}))


def run_case(case, dur, spec, out_npz):
    cmd = [sys.executable, os.path.abspath(__file__), "_child", case, str(dur), spec or "-", out_npz]
    p = subprocess.run(cmd, capture_output=True, text=True)
    for line in p.stdout.splitlines():
        if line.startswith("RESULT "):
            return json.loads(line[7:])
    raise RuntimeError(f"{case} failed:\n{p.stderr[-1500:]}")


def rel_diff(a, b):
    a, b = np.asarray(a, float), np.asarray(b, float)
    if a.shape != b.shape:
        return float("inf")
    scale = max(np.max(np.abs(b)), 1e-12)
    return float(np.max(np.abs(a - b)) / scale)


def main():
    if sys.argv[1] == "_child":
        return child(sys.argv[2], float(sys.argv[3]), None if sys.argv[4] == "-" else sys.argv[4], sys.argv[5])
    mode = sys.argv[1]
    quick = "--quick" in sys.argv
    dur = 2.0 if quick else 10.0
    spec = next((a for a in sys.argv[2:] if ":" in a), None)
    cases = [c for c in CASES if c != "wav" or os.environ.get("PYSQA_BENCH_WAV")]
    tag = "quick" if quick else "full"
    os.makedirs(REF_DIR, exist_ok=True)
    rows, ok = [], True
    for c in cases:
        ref = os.path.join(REF_DIR, f"{c}_{tag}.npz")
        out = ref if mode == "record" else os.path.join(REF_DIR, f"cand_{c}_{tag}.npz")
        r = run_case(c, dur, spec, out)
        if mode == "compare":
            R, C = np.load(ref), np.load(out)
            r["max_rel_diff"] = max(rel_diff(C[k], R[k]) for k in KEYS)
            r["global_rel_diff"] = rel_diff(C["tonality_avg"], R["tonality_avg"])
            r["global_ref"] = round(float(np.ravel(R["tonality_avg"])[0]), 5)
            r["global_cand"] = round(float(np.ravel(C["tonality_avg"])[0]), 5)
            r["t_series_rel_diff"] = rel_diff(C["tonality_t"], R["tonality_t"])
            r["spec_avg_rel_diff"] = rel_diff(C["spec_tonality_avg"], R["spec_tonality_avg"])
            # frequency of the overall tonal component, in Hz, over the frames that count (t > 0.02, after 57 frames)
            R_t, C_t = np.ravel(R["tonality_t"]), np.ravel(C["tonality_t"])
            m = (R_t > 0.02) & (np.arange(R_t.size) >= 57)
            r["tonal_freq_ref_Hz"] = round(float(np.mean(R["tonality_t_freqs"][m])), 2) if m.any() else None
            r["tonal_freq_cand_Hz"] = round(float(np.mean(C["tonality_t_freqs"][m])), 2) if m.any() else None
        rows.append(r)
        if mode == "compare":
            print(f"{c:11s} {r['seconds']:5.1f}s {r['peak_mb'] - r['base_mb']:5.0f}MB  global {r['global_ref']} -> {r['global_cand']}"
                  f" (diff {r['global_rel_diff']:.1e})  series {r['t_series_rel_diff']:.1e}  spec {r['spec_avg_rel_diff']:.1e}"
                  f"  tonal Hz {r['tonal_freq_ref_Hz']} -> {r['tonal_freq_cand_Hz']}", flush=True)
        else:
            print(f"{c:11s} {r['seconds']:5.1f}s {r['peak_mb'] - r['base_mb']:5.0f}MB", flush=True)
    meta = {"duration_s": dur, "sr": SR, "numpy": np.__version__, "cores": os.cpu_count()}
    path = os.path.join(REF_DIR, f"{'baseline' if mode == 'record' else 'candidate'}_{tag}.json")
    json.dump({"meta": meta, "rows": rows}, open(path, "w"), indent=2)
    print("saved", path)


if __name__ == "__main__":
    main()
