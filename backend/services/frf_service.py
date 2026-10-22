"""System Analysis: loading measured channels, frequency response functions (FRF) and modal estimates.

Everything here is plain numpy/scipy so it can be tested without a server. Conventions:

* Cross spectrum Sxy = E[conj(X) Y], with X the excitation (input) and Y the response (output).
* H1 = Sxy / Sxx   (noise on the response)
  H2 = Syy / Syx   (noise on the excitation; Syx = conj(Sxy))
  Hv = total least squares, from the larger eigenvector of [[Sxx, Syx], [Sxy, Syy]], with the output scaled
       by the square root of the ratio of the mean powers so that the units of the two channels do not matter
* Coherence = |Sxy|^2 / (Sxx Syy).
* The DC bin is dropped from every result (it cannot be drawn on a log axis, and converting between
  acceleration, velocity and displacement divides by jw).
"""
from __future__ import annotations

import io
import os
import tempfile
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from scipy import signal as sps
from scipy.optimize import least_squares

from utils import limits


class FrfError(ValueError):
    """Something the user can fix (bad file, missing channel, impossible setting). HTTP 400."""


# ── Channels ──────────────────────────────────────────────────────────────────

@dataclass
class Channel:
    id: str
    name: str
    file: str
    kind: str                                   # "time" | "frf"
    data: np.ndarray                            # time: real samples; frf: complex values
    fs: float = 0.0                             # time: sample rate (Hz)
    freqs: Optional[np.ndarray] = None          # frf: frequency axis (Hz)
    unit: str = ""

    @property
    def n(self) -> int:
        return int(len(self.data))

    @property
    def nbytes(self) -> int:
        return int(self.data.nbytes + (self.freqs.nbytes if self.freqs is not None else 0))

    def meta(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {"id": self.id, "name": self.name, "file": self.file, "kind": self.kind,
                               "n": self.n, "unit": self.unit}
        if self.kind == "time":
            out.update(fs=self.fs, duration_s=round(self.n / self.fs, 4))
        else:
            out.update(f_min=float(self.freqs[0]), f_max=float(self.freqs[-1]))
        return out


# ── Per-session store (in memory, small, forgotten when idle) ─────────────────

_LOCK = threading.Lock()
_STORE: Dict[str, Dict[str, Channel]] = {}
_TOUCHED: Dict[str, float] = {}
_MAX_SESSIONS = 40


def _max_bytes() -> float:
    hosted = limits.MEMORY_LIMIT_MB is not None
    return (50.0 * limits._SCALE if hosted else 600.0) * 1024 * 1024


def _purge_idle(now: float) -> None:
    idle = (limits.SESSION_IDLE_MIN or 30) * 60.0
    for sid in [s for s, t in _TOUCHED.items() if now - t > idle]:
        _STORE.pop(sid, None)
        _TOUCHED.pop(sid, None)
    while len(_STORE) > _MAX_SESSIONS:
        oldest = min(_TOUCHED, key=_TOUCHED.get)
        _STORE.pop(oldest, None)
        _TOUCHED.pop(oldest, None)


def store_channels(session_id: str, channels: List[Channel]) -> None:
    with _LOCK:
        now = time.time()
        _purge_idle(now)
        bucket = _STORE.setdefault(session_id, {})
        total = sum(c.nbytes for c in bucket.values()) + sum(c.nbytes for c in channels)
        if total > _max_bytes():
            raise limits.ResourceLimitError(
                f"These measurements need about {total / 1e6:.0f} MB and this server keeps at most "
                f"{_max_bytes() / 1e6:.0f} MB per session. Remove some files or use shorter records.")
        for c in channels:
            bucket[c.id] = c
        _TOUCHED[session_id] = now


def get_channel(session_id: str, channel_id: str) -> Channel:
    with _LOCK:
        ch = _STORE.get(session_id, {}).get(channel_id)
        if ch is not None:
            _TOUCHED[session_id] = time.time()
    if ch is None:
        raise KeyError(channel_id)
    return ch


def remove_file(session_id: str, file_id: str) -> None:
    with _LOCK:
        bucket = _STORE.get(session_id, {})
        for cid in [c for c in bucket if c.startswith(file_id + "_")]:
            del bucket[cid]


# ── Reading files ─────────────────────────────────────────────────────────────

def _clean_name(name: str) -> str:
    return os.path.basename(name or "file")


def read_wav(file_id: str, filename: str, raw: bytes) -> List[Channel]:
    import soundfile as sf
    try:
        data, fs = sf.read(io.BytesIO(raw), dtype="float64", always_2d=True)
    except Exception as exc:
        raise FrfError(f"{filename}: not a readable WAV file ({exc}).")
    base = os.path.splitext(_clean_name(filename))[0]
    out = []
    for k in range(data.shape[1]):
        label = base if data.shape[1] == 1 else f"{base} · ch{k + 1}"
        out.append(Channel(f"{file_id}_{k}", label, _clean_name(filename), "time", np.ascontiguousarray(data[:, k]), fs=float(fs)))
    return out


def read_csv(file_id: str, filename: str, raw: bytes, fs_hint: Optional[float]) -> List[Channel]:
    text = raw.decode("utf-8-sig", errors="replace")
    lines = [ln for ln in text.splitlines() if ln.strip() and not ln.lstrip().startswith("#")]
    if len(lines) < 4:
        raise FrfError(f"{filename}: the table is too short.")
    sep = ";" if lines[0].count(";") >= lines[0].count(",") and ";" in lines[0] else ("\t" if "\t" in lines[0] else ",")
    rows = [[c.strip() for c in ln.split(sep)] for ln in lines]

    def numeric(r: List[str]) -> bool:
        try:
            [float(c.replace(",", ".") if sep != "," else c) for c in r if c != ""]
            return True
        except ValueError:
            return False

    header: Optional[List[str]] = None
    if not numeric(rows[0]):
        header, rows = rows[0], rows[1:]
    try:
        arr = np.array([[float(c.replace(",", ".") if sep != "," else c) if c != "" else np.nan for c in r] for r in rows], dtype=float)
    except ValueError:
        raise FrfError(f"{filename}: the table has text where numbers are expected.")
    if arr.ndim != 2 or arr.shape[1] < 1:
        raise FrfError(f"{filename}: no numeric columns found.")
    names = header if header and len(header) == arr.shape[1] else [f"col{k + 1}" for k in range(arr.shape[1])]
    col0 = arr[:, 0]
    dt = np.diff(col0)
    first_is_time = arr.shape[1] >= 2 and np.all(np.isfinite(col0)) and np.all(dt > 0)
    if first_is_time:
        step = float(np.median(dt))
        if np.max(np.abs(dt - step)) > 1e-3 * step:                 # uneven times: put them on an even grid
            grid = np.arange(col0[0], col0[-1], step)
            arr = np.column_stack([grid] + [np.interp(grid, col0, arr[:, k]) for k in range(1, arr.shape[1])])
        fs = 1.0 / step
        cols = range(1, arr.shape[1])
    else:
        if not fs_hint:
            raise FrfError(f"{filename}: no time column found, so the sample rate is needed. Type it in 'CSV sample rate'.")
        fs = float(fs_hint)
        cols = range(arr.shape[1])
    out = []
    for k in cols:
        v = arr[:, k]
        if not np.all(np.isfinite(v)):
            v = np.nan_to_num(v)
        out.append(Channel(f"{file_id}_{len(out)}", f"{os.path.splitext(_clean_name(filename))[0]} · {names[k]}",
                           _clean_name(filename), "time", np.ascontiguousarray(v), fs=float(fs)))
    return out


_UFF_FRF_TYPES = {4: "frf", 2: "frf", 3: "frf"}     # 4 FRF, 3 cross spectrum, 2 auto spectrum (shown as plain spectra)


def read_uff(file_id: str, filename: str, raw: bytes) -> List[Channel]:
    try:
        import pyuff
    except ImportError:
        raise FrfError("Reading UFF files needs the 'pyuff' package, which is not installed on this server.")
    fd, path = tempfile.mkstemp(suffix=".uff")
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(raw)
        try:
            sets = pyuff.UFF(path).read_sets()
        except Exception as exc:
            raise FrfError(f"{filename}: not a readable UFF file ({exc}).")
    finally:
        try:
            os.remove(path)
        except OSError:
            pass
    if isinstance(sets, dict):
        sets = [sets]
    base = os.path.splitext(_clean_name(filename))[0]
    out: List[Channel] = []
    for s in sets or []:
        if not isinstance(s, dict) or s.get("type") != 58:
            continue
        y = np.asarray(s.get("data"))
        if y.size < 4:
            continue
        if s.get("abscissa_spacing", 1) == 0 and s.get("x") is not None:
            x = np.asarray(s["x"], dtype=float)
        else:
            x = float(s.get("abscissa_min", 0.0)) + float(s["abscissa_inc"]) * np.arange(len(y))
        ftype = int(s.get("func_type", 0))
        label = (str(s.get("id1") or "").strip() or f"{s.get('rsp_node', '')}:{s.get('rsp_dir', '')}").strip(": ")
        ref = f" ← {s.get('ref_node')}:{s.get('ref_dir')}" if ftype in (4, 3) and s.get("ref_node") else ""
        name = f"{base} · {label or len(out) + 1}{ref}"
        unit = str(s.get("ordinate_axis_units_lab") or s.get("ord_axis_units_lab") or "").strip()
        unit = "" if unit.upper() == "NONE" else unit
        if np.iscomplexobj(y) or ftype in (4, 3):
            f = x if np.all(np.diff(x) > 0) else np.sort(x)
            out.append(Channel(f"{file_id}_{len(out)}", name, _clean_name(filename), "frf",
                               np.ascontiguousarray(y.astype(complex)), freqs=f.astype(float), unit=unit))
        elif ftype in (0, 1) or ftype == 0:
            step = float(np.median(np.diff(x))) if len(x) > 1 else 0.0
            if step <= 0:
                continue
            if np.max(np.abs(np.diff(x) - step)) > 1e-3 * step:
                grid = np.arange(x[0], x[-1], step)
                y = np.interp(grid, x, y.real)
            out.append(Channel(f"{file_id}_{len(out)}", name, _clean_name(filename), "time",
                               np.ascontiguousarray(np.asarray(y, dtype=float)), fs=1.0 / step, unit=unit))
    if not out:
        raise FrfError(f"{filename}: no time records (dataset 58, type 1) or FRFs (type 4) were found in this UFF file.")
    return out


def read_any(file_id: str, filename: str, raw: bytes, fs_hint: Optional[float] = None) -> List[Channel]:
    low = filename.lower()
    if low.endswith(".wav"):
        return read_wav(file_id, filename, raw)
    if low.endswith((".uff", ".unv", ".uf")):
        return read_uff(file_id, filename, raw)
    if low.endswith((".csv", ".txt", ".dat", ".tsv")):
        return read_csv(file_id, filename, raw, fs_hint)
    raise FrfError(f"{filename}: unsupported file type. Use .uff/.unv, .wav or .csv.")


# ── Spectra and estimators ────────────────────────────────────────────────────

_WINDOWS = {"hann": "hann", "hanning": "hann", "hamming": "hamming", "blackman": "blackman", "flattop": "flattop",
            "rectangular": "boxcar", "boxcar": "boxcar", "bartlett": "bartlett"}


def _welch_spectra(x: np.ndarray, y: np.ndarray, fs: float, nperseg: int, overlap_pct: float,
                   window: str, detrend: str) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int]:
    win = _WINDOWS.get(window.lower(), "hann")
    noverlap = int(nperseg * min(max(overlap_pct, 0.0), 95.0) / 100.0)
    det = detrend if detrend in ("constant", "linear") else False
    kw = dict(fs=fs, window=win, nperseg=nperseg, noverlap=noverlap, detrend=det, scaling="spectrum")
    f, Sxx = sps.welch(x, **kw)
    _, Syy = sps.welch(y, **kw)
    _, Sxy = sps.csd(x, y, **kw)          # conj(X) Y
    step = nperseg - noverlap
    navg = 1 + max(0, (len(x) - nperseg) // step)
    return f, Sxx, Syy, Sxy, navg


def find_hits(x: np.ndarray, nperseg: int, thresh_pct: float) -> List[int]:
    """Sample numbers where the excitation first crosses the threshold, at least one block apart."""
    xa = np.abs(x - np.median(x))
    peak = float(xa.max()) if len(xa) else 0.0
    if peak <= 0:
        return []
    above = xa >= peak * thresh_pct / 100.0
    idx = np.flatnonzero(above & ~np.concatenate(([False], above[:-1])))
    hits: List[int] = []
    last = -10 ** 12
    for i in idx:
        if i - last >= nperseg:
            hits.append(int(i))
            last = int(i)
    return hits


def _impact_spectra(x: np.ndarray, y: np.ndarray, fs: float, nperseg: int, thresh_pct: float, pre_pct: float,
                    force_ms: float, exp_end_pct: float) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, int, float]:
    pre = max(1, int(round(nperseg * pre_pct / 100.0)))
    hits = [h for h in find_hits(x, nperseg, thresh_pct) if h - pre >= 0 and h - pre + nperseg <= len(x)]
    if not hits:
        raise FrfError("No impact was found. Lower 'Trigger level', check the excitation channel, or use "
                       "'Random / continuous' averaging.")
    t = np.arange(nperseg) / fs
    t_hit = pre / fs
    wf = (t <= t_hit + force_ms * 1e-3).astype(float)                          # force window: the pulse only
    after = max(nperseg / fs - t_hit, 1e-9)
    k = -np.log(max(exp_end_pct, 1e-3) / 100.0) / after                       # decay of the exponential window (1/s)
    wr = np.where(t <= t_hit, 1.0, np.exp(-k * (t - t_hit)))
    Sxx = Syy = 0.0
    Sxy = 0.0
    for h in hits:
        xb = x[h - pre:h - pre + nperseg]
        yb = y[h - pre:h - pre + nperseg]
        xb = (xb - np.mean(xb[: max(2, pre // 2)])) * wf
        yb = (yb - np.mean(yb[: max(2, pre // 2)])) * wr
        X, Y = np.fft.rfft(xb), np.fft.rfft(yb)
        Sxx = Sxx + np.abs(X) ** 2
        Syy = Syy + np.abs(Y) ** 2
        Sxy = Sxy + np.conj(X) * Y
    f = np.fft.rfftfreq(nperseg, 1.0 / fs)
    n = len(hits)
    return f, Sxx / n, Syy / n, Sxy / n, n, float(k)


def estimate(Sxx: np.ndarray, Syy: np.ndarray, Sxy: np.ndarray, estimator: str) -> np.ndarray:
    tiny = 1e-300
    est = estimator.upper()
    if est == "H1":
        return Sxy / np.maximum(Sxx, tiny)
    if est == "H2":
        return Syy / np.where(np.abs(Sxy) < tiny, tiny, np.conj(Sxy))
    if est == "HV":
        # Total least squares. The two channels have different units (N and m/s2), so they are first brought to the
        # same scale: the output is divided by the square root of the ratio of the mean powers. Without this, the
        # larger of the two simply wins and Hv collapses onto H2.
        kappa = float(np.sum(Syy) / max(float(np.sum(Sxx)), tiny))
        if kappa <= 0:
            return Sxy / np.maximum(Sxx, tiny)
        s = np.sqrt(kappa)
        syy, sxy = Syy / kappa, Sxy / s
        lam = 0.5 * (Sxx + syy) + np.sqrt((0.5 * (Sxx - syy)) ** 2 + np.abs(sxy) ** 2)
        return s * (lam - Sxx) / np.where(np.abs(sxy) < tiny, tiny, np.conj(sxy))
    raise FrfError(f"Unknown estimator '{estimator}'.")


def coherence(Sxx: np.ndarray, Syy: np.ndarray, Sxy: np.ndarray) -> np.ndarray:
    return np.clip(np.abs(Sxy) ** 2 / np.maximum(Sxx * Syy, 1e-300), 0.0, 1.0)


_ORDER = {"displacement": 0, "velocity": 1, "acceleration": 2, "none": 0}


def _convert(H: np.ndarray, f: np.ndarray, from_type: str, to_type: str) -> np.ndarray:
    """Acceleration <-> velocity <-> displacement response: multiply by (jw)^(order_to - order_from)."""
    d = _ORDER.get(to_type, 0) - _ORDER.get(from_type, 0)
    if d == 0 or from_type == "none" or to_type == "none":
        return H
    with np.errstate(divide="ignore", invalid="ignore"):
        return H * (1j * 2 * np.pi * f) ** d


# ── Modes ─────────────────────────────────────────────────────────────────────

def _cross(f: np.ndarray, level: np.ndarray, p: int, target: float) -> Tuple[Optional[float], Optional[float]]:
    """Frequencies left and right of peak p where level falls to target (linear interpolation), if it does
    before rising again (overlapping neighbour)."""
    lo = hi = None
    i = p
    while i > 0:
        if level[i - 1] <= target:
            a, b = level[i - 1], level[i]
            lo = f[i - 1] + (target - a) / (b - a) * (f[i] - f[i - 1]) if b != a else f[i]
            break
        if level[i - 1] > level[i] + 1e-12 * level[p] and level[i] < 0.98 * level[p]:
            break                                           # climbing again: another mode is in the way
        i -= 1
    i = p
    while i < len(f) - 1:
        if level[i + 1] <= target:
            a, b = level[i + 1], level[i]
            hi = f[i + 1] - (target - a) / (b - a) * (f[i + 1] - f[i]) if b != a else f[i]
            break
        if level[i + 1] > level[i] + 1e-12 * level[p] and level[i] < 0.98 * level[p]:
            break
        i += 1
    return lo, hi


def _sdof_fit(f: np.ndarray, Hr: np.ndarray, fn0: float, z0: float, lo: float, hi: float
              ) -> Optional[Dict[str, Any]]:
    """Fit H = R / (wn^2 - w^2 + 2 j z wn w) + C to receptances (rows: responses) inside [lo, hi] Hz.
    wn and z are shared; the complex R and C of each response follow by linear least squares."""
    m = (f >= lo) & (f <= hi)
    if m.sum() < 8:
        return None
    w = 2 * np.pi * f[m]
    Hs = Hr[:, m]
    nresp = Hs.shape[0]

    def solve(params):
        fn, z = params
        wn = 2 * np.pi * fn
        den = wn ** 2 - w ** 2 + 2j * z * wn * w
        res = []
        coefs = []
        for i in range(nresp):
            A = np.column_stack([1.0 / den, np.ones_like(den)])
            sol, *_ = np.linalg.lstsq(A, Hs[i], rcond=None)
            res.append(Hs[i] - A @ sol)
            coefs.append(sol)
        return np.concatenate(res), coefs

    def resid(params):
        r, _ = solve(params)
        return np.concatenate([r.real, r.imag])

    try:
        scale = float(np.max(np.abs(Hs))) or 1.0
        out = least_squares(lambda p: resid(p) / scale, x0=[fn0, z0], bounds=([lo, 1e-5], [hi, 0.5]),
                            x_scale=[max(hi - lo, 1e-6) * 0.1, max(z0, 1e-4)], method="trf", max_nfev=200)
    except Exception:
        return None
    r, coefs = solve(out.x)
    err = float(np.linalg.norm(r) / max(np.linalg.norm(Hs), 1e-300))
    return {"fn": float(out.x[0]), "zeta": float(out.x[1]), "error": err,
            "residues": [[float(c[0].real), float(c[0].imag)] for c in coefs]}


def find_modes(f: np.ndarray, H_disp: np.ndarray, H_show: np.ndarray, coh: Optional[np.ndarray], *,
               prominence_db: float, min_sep_hz: float, max_modes: int, fmin: float, fmax: float,
               exp_decay: float, method: str) -> Dict[str, Any]:
    """Peak-pick the mode indicator function and estimate damping.

    H_disp: receptance-like FRFs (rows = responses) used for damping.  H_show: the FRFs as displayed (peak picking).
    """
    df = float(f[1] - f[0]) if len(f) > 1 else 1.0
    mif_show = np.sqrt(np.sum(np.abs(H_show) ** 2, axis=0))
    mif_db = 20 * np.log10(np.maximum(mif_show, 1e-300))
    sel = (f >= fmin) & (f <= fmax)
    idx_range = np.flatnonzero(sel)
    modes: List[Dict[str, Any]] = []
    if len(idx_range) >= 5:
        seg = mif_db[idx_range]
        peaks, props = sps.find_peaks(seg, prominence=prominence_db, distance=max(1, int(round(min_sep_hz / df))))
        order = np.argsort(props["prominences"])[::-1][:max_modes]
        peaks = np.sort(peaks[order])
        mif_disp = np.sqrt(np.sum(np.abs(H_disp) ** 2, axis=0))
        for pk in peaks:
            p = int(idx_range[pk])
            # parabolic refinement of the peak on the dB curve
            fn = float(f[p])
            if 0 < p < len(f) - 1:
                a, b, c = mif_db[p - 1], mif_db[p], mif_db[p + 1]
                den = a - 2 * b + c
                if den < 0:
                    fn = float(f[p] + 0.5 * (a - c) / den * df)
            lo, hi = _cross(f, mif_disp, p, mif_disp[p] / np.sqrt(2.0))
            zeta_hp = None
            bw = None
            warn: List[str] = []
            if lo is not None and hi is not None and fn > 0:
                bw = hi - lo
                zeta_hp = bw / (2 * fn)
                if bw < 3 * df:
                    warn.append("Peak is only a few frequency lines wide: damping is not reliable (use a longer record).")
            else:
                warn.append("Neighbouring modes overlap this peak, so the -3 dB width could not be measured.")
            zeta_fit = fn_fit = fit_err = None
            residues = None
            if method in ("fit", "both") or zeta_hp is None:
                span = bw if bw else 8 * df
                z0 = zeta_hp if zeta_hp else 0.01
                fit = _sdof_fit(f, H_disp, fn, z0, max(fn - 2.0 * span, f[1]), min(fn + 2.0 * span, f[-1]))
                if fit and fit["error"] < 0.35:
                    zeta_fit, fn_fit, fit_err, residues = fit["zeta"], fit["fn"], fit["error"], fit["residues"]
                elif method == "fit":
                    warn.append("The single-mode fit did not converge on this peak.")
            c_peak = None
            if coh is not None:
                band = (f >= (lo if lo else fn - 2 * df)) & (f <= (hi if hi else fn + 2 * df))
                c_peak = float(np.mean(coh[:, band])) if band.any() else None
                if c_peak is not None and c_peak < 0.8:
                    warn.append(f"Coherence near this peak is {c_peak:.2f}: the estimate is noisy.")
            corr = (exp_decay / (2 * np.pi * fn)) if (exp_decay and fn > 0) else 0.0
            use_fit = method in ("fit", "both") and zeta_fit is not None
            z_main = zeta_fit if use_fit else zeta_hp
            modes.append({
                "fn_hz": round(fn_fit if use_fit and fn_fit else fn, 4),
                "level_db": round(float(mif_db[p]), 2),
                "zeta_hp": None if zeta_hp is None else round(max(zeta_hp - corr, 0.0), 6),
                "zeta_fit": None if zeta_fit is None else round(max(zeta_fit - corr, 0.0), 6),
                "zeta": None if z_main is None else round(max(z_main - corr, 0.0), 6),
                "bandwidth_hz": None if bw is None else round(bw, 4),
                "q": None if not z_main else round(1.0 / (2 * max(z_main - corr, 1e-9)), 1),
                "fit_error": None if fit_err is None else round(fit_err, 4),
                "coherence": None if c_peak is None else round(c_peak, 3),
                "residues": residues,
                "warnings": warn,
            })
    return {"modes": modes, "mif_db": np.round(mif_db, 2).tolist()}


# ── The whole analysis ────────────────────────────────────────────────────────

def _res_label(response_type: str) -> str:
    return {"acceleration": "Accelerance", "velocity": "Mobility", "displacement": "Receptance"}.get(response_type, "FRF")


def analyse(session_id: str, p: Dict[str, Any]) -> Dict[str, Any]:
    """Compute FRFs (and optionally modes) from stored channels. `p` is the request body (see the router)."""
    warnings: List[str] = []
    try:
        resp_chs = [get_channel(session_id, cid) for cid in p["responses"]]
        exc = get_channel(session_id, p["excitation"]) if p.get("excitation") else None
    except KeyError:
        raise
    if not resp_chs:
        raise FrfError("Choose at least one response channel.")

    estimator = str(p.get("estimator", "H1")).upper()
    mode = str(p.get("averaging", "welch"))
    resp_type = str(p.get("response_type", "none"))
    show_as = str(p.get("show_as", resp_type))
    if resp_type == "none":
        show_as = "none"
    pre_conv = show_as != resp_type

    time_resp = [c for c in resp_chs if c.kind == "time"]
    frf_resp = [c for c in resp_chs if c.kind == "frf"]
    results: List[Dict[str, Any]] = []
    df = None
    n_avg = 0
    hits = None
    exp_decay = 0.0
    coh_valid = True

    grid_f: Optional[np.ndarray] = None
    H_list: List[np.ndarray] = []
    C_list: List[Optional[np.ndarray]] = []
    names: List[Tuple[str, str]] = []

    if time_resp:
        if exc is None or exc.kind != "time":
            raise FrfError("Choose an excitation channel (a time record) for the response channels.")
        fs = exc.fs
        for c in time_resp:
            if abs(c.fs - fs) > 1e-6 * fs:
                raise FrfError(f"'{c.name}' has sample rate {c.fs:g} Hz but the excitation has {fs:g} Hz. "
                               "Use records with the same sample rate.")
        n = min([exc.n] + [c.n for c in time_resp])
        if n < 64:
            raise FrfError("The records are too short.")
        nperseg = int(p.get("nperseg", 4096))
        nperseg = min(max(nperseg, 64), 1 << 17)
        if nperseg > n:
            warnings.append(f"The block length was reduced from {nperseg} to {n} samples (the record length).")
            nperseg = n
        x = exc.data[:n]
        Sxx0 = None
        for c in time_resp:
            y = c.data[:n]
            if mode == "impact":
                imp = p.get("impact") or {}
                f, Sxx, Syy, Sxy, navg, exp_decay = _impact_spectra(
                    x, y, fs, nperseg, float(imp.get("trigger_pct", 20)), float(imp.get("pretrigger_pct", 5)),
                    float(imp.get("force_ms", 8)), float(imp.get("exp_end_pct", 1)))
                hits = navg
            else:
                f, Sxx, Syy, Sxy, navg = _welch_spectra(x, y, fs, nperseg, float(p.get("overlap", 50)),
                                                         str(p.get("window", "hann")), str(p.get("detrend", "constant")))
            n_avg = navg
            if navg < 2:
                coh_valid = False
            H = estimate(Sxx, Syy, Sxy, estimator)
            C = coherence(Sxx, Syy, Sxy) if navg >= 2 else None
            grid_f = f
            H_list.append(H)
            C_list.append(C)
            names.append((c.id, c.name))
        df = float(grid_f[1] - grid_f[0])
        if not coh_valid:
            warnings.append("Only one average: coherence cannot be estimated. Use a longer record, a shorter block "
                            "length, or more impacts.")
        if mode == "impact":
            warnings.append(f"Impact averaging: {hits} impact{'s' if hits != 1 else ''} used. The exponential window adds "
                            f"{exp_decay:.1f} 1/s of artificial damping; it is subtracted from the damping estimates.")

    f_all = grid_f
    # Measured FRFs from files: bring them onto the computed grid, or use their own if there is no time data
    for c in frf_resp:
        if f_all is None:
            f_all = c.freqs
        H = np.interp(f_all, c.freqs, c.data.real) + 1j * np.interp(f_all, c.freqs, c.data.imag)
        H_list.append(H)
        C_list.append(None)
        names.append((c.id, c.name))
    if f_all is None:
        raise FrfError("Nothing to analyse.")
    if df is None:
        df = float(f_all[1] - f_all[0]) if len(f_all) > 1 else 1.0

    fmax_nyq = float(f_all[-1])
    fmin = max(float(p.get("fmin", 0) or 0), 0.0)
    fmax = float(p.get("fmax") or fmax_nyq)
    fmax = min(fmax, fmax_nyq)
    keep = (f_all > 0) & (f_all >= fmin) & (f_all <= fmax)
    if keep.sum() < 8:
        raise FrfError("The frequency range is too narrow for this frequency resolution.")
    f = f_all[keep]

    unwrap = bool(p.get("unwrap", False))
    H_show = np.array([_convert(H, f_all, resp_type, show_as)[keep] for H in H_list])
    H_disp = np.array([_convert(H, f_all, resp_type, "displacement")[keep] for H in H_list]) \
        if resp_type != "none" else H_show
    coh_arr = np.array([c[keep] for c in C_list if c is not None]) if all(c is not None for c in C_list) and C_list else None

    for i, (cid, name) in enumerate(names):
        h = H_show[i]
        mag = 20 * np.log10(np.maximum(np.abs(h), 1e-300))
        ph = np.angle(h)
        if unwrap:
            ph = np.unwrap(ph)
        results.append({
            "id": cid, "name": name,
            "mag_db": np.round(mag, 3).tolist(),
            "phase_deg": np.round(np.degrees(ph), 2).tolist(),
            "real": [float(f"{v:.6g}") for v in h.real],
            "imag": [float(f"{v:.6g}") for v in h.imag],
            "coherence": None if C_list[i] is None else np.round(C_list[i][keep], 4).tolist(),
        })

    out: Dict[str, Any] = {
        "freqs": np.round(f, 4).tolist(),
        "responses": results,
        "estimator": estimator,
        "averaging": mode,
        "n_averages": int(n_avg),
        "df_hz": round(df, 6),
        "coherence_valid": coh_valid,
        "quantity": _res_label(show_as),
        "show_as": show_as,
        "exp_decay_rate": round(exp_decay, 4),
        "warnings": warnings,
    }

    mp = p.get("modes")
    if mp and mp.get("enabled", True):
        md = find_modes(
            f, H_disp, H_show, coh_arr if coh_valid else None,
            prominence_db=float(mp.get("prominence_db", 6)), min_sep_hz=float(mp.get("min_sep_hz") or max(2 * df, 1.0)),
            max_modes=int(mp.get("max_modes", 12)), fmin=max(fmin, f[0]), fmax=fmax, exp_decay=exp_decay,
            method=str(mp.get("method", "both")))
        out["modes"] = md["modes"]
        out["mif_db"] = md["mif_db"]
        if resp_type == "none":
            out["warnings"].append("Response type is 'Not specified', so damping uses the FRF as it is. "
                                   "Pick acceleration, velocity or displacement for best damping estimates.")
    return out
