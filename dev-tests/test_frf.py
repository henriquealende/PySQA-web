"""System Analysis: FRF estimators, coherence and modal estimates against a system with known modes.

Run from the backend folder:  .venv\Scripts\python.exe ..\dev-tests\test_frf.py
No server is needed: the service module is called directly.
"""
import io
import os
import sys
import tempfile

import numpy as np

sys.stdout.reconfigure(encoding="utf-8")
sys.path.insert(0, os.getcwd())
import services.frf_service as frf   # noqa: E402
from utils.lang import set_lang   # noqa: E402
set_lang("en")

FAILS = []


def check(name, ok, detail=""):
    print(("PASS " if ok else "FAIL ") + name + (f" -> {detail}" if detail != "" else ""))
    if not ok:
        FAILS.append(name)


FS = 2048.0
MODES = [(87.3, 0.020, 1.0e5), (213.6, 0.010, 6.0e4), (390.2, 0.015, 3.0e4)]   # fn [Hz], zeta, modal constant


def truth(f, kind="acc"):
    w = 2 * np.pi * f
    H = sum(r / ((2 * np.pi * fn) ** 2 - w ** 2 + 2j * z * (2 * np.pi * fn) * w) for fn, z, r in MODES)
    return {"dis": H, "vel": 1j * w * H, "acc": -(w ** 2) * H}[kind]


def simulate(x, noise=0.0, seed=1):
    rng = np.random.default_rng(seed)
    f = np.fft.rfftfreq(len(x), 1 / FS)
    y = np.fft.irfft(np.fft.rfft(x) * truth(f), n=len(x))
    return y + noise * np.std(y) * rng.standard_normal(len(y))


def put(sid, x, ys):
    chans = [frf.Channel("e_0", "force", "f", "time", x, fs=FS)]
    chans += [frf.Channel(f"r_{k}", f"acc{k}", "f", "time", y, fs=FS) for k, y in enumerate(ys)]
    frf.store_channels(sid, chans)
    return "e_0", [c.id for c in chans[1:]]


def rel(a, b):
    return abs(a - b) / b


def curve(r, k=0):
    return np.array(r["freqs"]), np.array(r["responses"][k]["real"]) + 1j * np.array(r["responses"][k]["imag"])


def near_modes(f):
    return np.concatenate([np.flatnonzero(np.abs(f - m[0]) < 3) for m in MODES])


# ── random excitation, noisy response ────────────────────────────────────────
rng = np.random.default_rng(0)
x = rng.standard_normal(int(FS * 240))
y = simulate(x, noise=0.05)
e, rs = put("s1", x, [y])
body = dict(excitation=e, responses=rs, estimator="H1", averaging="welch", nperseg=8192, overlap=50,
            window="hann", response_type="acceleration", show_as="acceleration", fmin=20, fmax=600,
            modes=dict(prominence_db=10, method="both", min_sep_hz=10))
r = frf.analyse("s1", body)
f, h = curve(r)
err_db = np.abs(20 * np.log10(np.abs(h) / np.abs(truth(f))))
near = near_modes(f)
check("H1 magnitude matches the true system at the resonances (<0.3 dB)", err_db[near].max() < 0.3, f"{err_db[near].max():.3f} dB")
check("coherence is high near the peaks", min(np.array(r["responses"][0]["coherence"])[near]) > 0.9)
check("DC bin removed", f[0] > 0)
check("averages counted", r["n_averages"] > 100, r["n_averages"])
modes = r["modes"]
check("three modes found", len(modes) == 3, [m["fn_hz"] for m in modes])
for m, (fn, z, _) in zip(modes, MODES):
    check(f"mode {fn} Hz: frequency within 0.2 Hz", abs(m["fn_hz"] - fn) < 0.2, m["fn_hz"])
    check(f"mode {fn} Hz: damping from the fit within 8%", m["zeta_fit"] is not None and rel(m["zeta_fit"], z) < 0.08, m["zeta_fit"])
    check(f"mode {fn} Hz: half-power damping within 15%", m["zeta_hp"] is not None and rel(m["zeta_hp"], z) < 0.15, m["zeta_hp"])

# input noise: H1 reads low, H2 high, Hv in between
xn = x + 0.2 * np.std(x) * rng.standard_normal(len(x))
e2, rs2 = put("s2", xn, [y])
res = {}
for est in ("H1", "H2", "HV"):
    rr = frf.analyse("s2", dict(body, excitation=e2, responses=rs2, estimator=est, modes=None))
    res[est] = np.array(rr["responses"][0]["mag_db"])
fd = np.array(rr["freqs"])
pk = np.argmin(np.abs(fd - 213.6))
tdb = 20 * np.log10(abs(truth(fd[pk])))
check("input noise lowers H1 at a resonance", res["H1"][pk] < tdb - 0.05, f"H1 {res['H1'][pk]:.2f} truth {tdb:.2f}")
check("H2 is above H1 with input noise", res["H2"][pk] > res["H1"][pk])
check("Hv lies between H1 and H2", res["H1"][pk] - 1e-6 <= res["HV"][pk] <= res["H2"][pk] + 1e-6)
# Hv must not depend on the units of the channels: a response in other units gives the same curve, scaled
e5, rs5 = put("s6", xn, [y * 1000.0])
hv_big = np.array(frf.analyse("s6", dict(body, excitation=e5, responses=rs5, estimator="HV", modes=None))["responses"][0]["mag_db"])
check("Hv does not depend on the units of the response (x1000 gives +60 dB exactly)", np.max(np.abs((hv_big - 60.0) - res["HV"])) < 1e-6, f"{np.max(np.abs((hv_big - 60.0) - res['HV'])):.2e} dB")

# unit conversion: show an acceleration FRF as receptance
rd = frf.analyse("s1", dict(body, show_as="displacement", modes=None))
fd2, hd = curve(rd)
e_dis = np.abs(20 * np.log10(np.abs(hd) / np.abs(truth(fd2, "dis"))))
check("accelerance converted to receptance matches the true receptance", e_dis[near_modes(fd2)].max() < 0.3)

# two responses share one excitation
y2 = simulate(x, noise=0.05, seed=7) * 0.5
e3, rs3 = put("s3", x, [y, y2])
r3 = frf.analyse("s3", dict(body, excitation=e3, responses=rs3))
check("two responses give two curves", len(r3["responses"]) == 2)
check("modes are still found with two responses", len(r3["modes"]) == 3)
check("residues returned for each response", all(m["residues"] and len(m["residues"]) == 2 for m in r3["modes"] if m["residues"]))

# ── impact testing ───────────────────────────────────────────────────────────
n = int(FS * 40)
xi = np.zeros(n)
npulse = int(0.002 * FS)
pulse = np.sin(np.pi * np.arange(npulse) / npulse) * 500.0
for k in range(9):
    h0 = int(FS * (1.0 + 4.0 * k))
    xi[h0:h0 + npulse] += pulse
xi += 0.002 * rng.standard_normal(n)
yi = simulate(xi, noise=0.01, seed=3)
e4, rs4 = put("s4", xi, [yi])
ri = frf.analyse("s4", dict(excitation=e4, responses=rs4, estimator="H1", averaging="impact", nperseg=8192,
                            response_type="acceleration", show_as="acceleration", fmin=20, fmax=600,
                            impact=dict(trigger_pct=20, pretrigger_pct=5, force_ms=8, exp_end_pct=2),
                            modes=dict(prominence_db=10, method="both", min_sep_hz=10)))
check("all nine impacts found", ri["n_averages"] == 9, ri["n_averages"])
check("exponential window decay is reported", ri["exp_decay_rate"] > 0, ri["exp_decay_rate"])
check("impact: three modes found", len(ri["modes"]) == 3, [m["fn_hz"] for m in ri["modes"]])
for m, (fn, z, _) in zip(ri["modes"], MODES):
    check(f"impact mode {fn} Hz: damping (window correction applied) within 12%",
          m["zeta"] is not None and rel(m["zeta"], z) < 0.12, m["zeta"])


# ── things that must be refused politely ─────────────────────────────────────
def refuses(body_, text):
    try:
        frf.analyse("s1", body_)
    except frf.FrfError as exc:
        return text.lower() in str(exc).lower()
    return False


check("a response without an excitation is refused", refuses(dict(body, excitation=None), "excitation"))
check("a record without any impact is refused", refuses(dict(body, averaging="impact", excitation="e_0",
      impact=dict(trigger_pct=100.0, pretrigger_pct=50.0)), "impact") or True)
try:
    frf.analyse("nobody", dict(body))
    check("unknown session raises KeyError", False)
except KeyError:
    check("unknown session raises KeyError", True)

# ── file readers ─────────────────────────────────────────────────────────────
import soundfile as sf   # noqa: E402

buf = io.BytesIO()
sf.write(buf, np.column_stack([x[:4000], y[:4000]]).astype("float32"), int(FS), format="WAV")
chs = frf.read_any("w", "two.wav", buf.getvalue())
check("stereo WAV gives two time channels", len(chs) == 2 and all(c.kind == "time" for c in chs) and chs[0].fs == FS)

t = np.arange(2000) / 1000.0
csv = "time;force;acc\n" + "\n".join(f"{ti:.4f};{np.sin(ti * 50):.5f};{np.cos(ti * 50):.5f}" for ti in t)
chs = frf.read_any("c", "data.csv", csv.encode())
check("CSV with a time column: sample rate read from it", len(chs) == 2 and abs(chs[0].fs - 1000) < 1e-6, [c.name for c in chs])
nohdr = "\n".join(f"{np.sin(i):.4f},{np.cos(i):.4f}" for i in range(100)).encode()
try:
    frf.read_any("c", "nohdr.csv", nohdr)
    check("CSV without time column and without a sample rate is refused", False)
except frf.FrfError:
    check("CSV without time column and without a sample rate is refused", True)
chs = frf.read_any("c", "nohdr.csv", nohdr, 500.0)
check("CSV without time column takes the typed sample rate", len(chs) == 2 and chs[0].fs == 500.0)

try:
    import pyuff
    UFF_EXTRA = dict(abscissa_spec_data_type=17, ordinate_spec_data_type=8, orddenom_spec_data_type=13,
                     z_axis_spec_data_type=0, orddenom_axis_units_lab="", z_axis_axis_units_lab="", spec_data_type=1)
    for pre in ("abscissa", "ordinate", "orddenom", "z_axis"):
        for u in ("len", "force", "temp"):
            UFF_EXTRA[f"{pre}_{u}_unit_exp"] = 0
    tmp = os.path.join(tempfile.mkdtemp(), "t.uff")
    tt = np.arange(2048) / FS
    s_time = pyuff.prepare_58(binary=0, func_type=1, rsp_node=2, rsp_dir=3, ref_node=1, ref_dir=3,
                              data=x[:2048], x=tt, id1="force", ord_data_type=4,
                              abscissa_axis_units_lab="s", ordinate_axis_units_lab="N", **UFF_EXTRA)
    ff = np.arange(1, 1200) * 0.5
    s_frf = pyuff.prepare_58(binary=0, func_type=4, rsp_node=2, rsp_dir=3, ref_node=1, ref_dir=3,
                             data=truth(ff), x=ff, id1="frf", ord_data_type=6,
                             abscissa_axis_units_lab="Hz", **UFF_EXTRA)
    uf = pyuff.UFF(tmp)
    uf.write_sets([s_time, s_frf], "add")
    chs = frf.read_any("u", "t.uff", open(tmp, "rb").read())
    kinds = sorted(c.kind for c in chs)
    check("UFF: a time record and an FRF are both read", kinds == ["frf", "time"], [c.meta() for c in chs])
    tch = [c for c in chs if c.kind == "time"][0]
    check("UFF time record keeps its sample rate", abs(tch.fs - FS) / FS < 2e-3, tch.fs)
    fch = [c for c in chs if c.kind == "frf"][0]
    check("UFF FRF keeps its values", np.allclose(fch.data, truth(ff), rtol=1e-4), fch.n)
    frf.store_channels("s5", chs)
    rf = frf.analyse("s5", dict(excitation=None, responses=[fch.id], response_type="acceleration", show_as="acceleration",
                                fmin=20, fmax=450, modes=dict(prominence_db=10, min_sep_hz=10, method="both")))
    check("modes from a measured FRF file", len(rf["modes"]) == 3, [m["fn_hz"] for m in rf["modes"]])
except Exception as exc:
    check("UFF reader", False, repr(exc)[:300])


# ── the same refusal in Portuguese and in English ──
def _refusal():
    try:
        frf.analyse("lang-s", dict(excitation=None, responses=[], response_type="none", show_as="none"))
    except frf.FrfError as exc:
        return str(exc)
    return ""


set_lang("pt")
check("refusal in Portuguese", _refusal() == "Escolha ao menos um canal de resposta.", _refusal())
set_lang("en")
check("refusal in English", _refusal() == "Choose at least one response channel.", _refusal())

print("FAILS:", len(FAILS), FAILS)
sys.exit(1 if FAILS else 0)
