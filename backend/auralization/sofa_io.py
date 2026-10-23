"""Reader for SOFA files (AES69) holding head-related impulse responses (SimpleFreeFieldHRIR).

A SOFA file is an HDF5 (netCDF-4) file. Only what an HRIR set needs is read, with h5py:
Data.IR (M, 2, N), Data.SamplingRate, SourcePosition (M, 3) and, when present, Data.Delay.
"""
from __future__ import annotations

import io
from dataclasses import dataclass

import numpy as np

from utils.lang import msg

MAX_ELEMENTS = 40_000_000       # M x 2 x N: about 160 MB as float32, more than any public HRTF set needs


class SofaError(ValueError):
    """The file is not a usable HRIR set (HTTP 400)."""


@dataclass
class HrtfSet:
    name: str
    fs: float
    ir: np.ndarray              # (M, 2, N) float32; ear 0 = left, ear 1 = right
    azimuth: np.ndarray         # (M,) degrees, to the RIGHT of the listener is positive, in (-180, 180]
    elevation: np.ndarray       # (M,) degrees, up is positive
    radius_m: float             # measurement distance of the source, 0 if it varies or is unknown
    builtin: bool = False

    @property
    def n_dirs(self) -> int:
        return int(self.ir.shape[0])

    @property
    def n_taps(self) -> int:
        return int(self.ir.shape[2])


def _text(value) -> str:
    if isinstance(value, (bytes, np.bytes_)):
        return value.decode("utf-8", "ignore")
    if isinstance(value, np.ndarray):
        return _text(value.ravel()[0]) if value.size else ""
    return str(value)


def read_sofa(data: bytes, name: str) -> HrtfSet:
    import h5py

    try:
        f = h5py.File(io.BytesIO(data), "r")
    except Exception:
        raise SofaError(msg(f"{name} não é um arquivo SOFA válido (HDF5/netCDF-4).",
                            f"{name} is not a valid SOFA file (HDF5/netCDF-4)."))
    with f:
        for key in ("Data.IR", "Data.SamplingRate", "SourcePosition"):
            if key not in f:
                raise SofaError(msg(f"{name}: falta '{key}'. Use um SOFA do tipo SimpleFreeFieldHRIR.",
                                    f"{name}: '{key}' is missing. Use a SimpleFreeFieldHRIR SOFA file."))
        convention = _text(f.attrs.get("SOFAConventions", ""))
        if convention and "HRIR" not in convention:
            raise SofaError(msg(f"{name}: convenção {convention} não é um conjunto de HRIR.",
                                f"{name}: convention {convention} is not an HRIR set."))
        shape = f["Data.IR"].shape
        if len(shape) != 3 or shape[1] != 2:
            raise SofaError(msg(f"{name}: esperado Data.IR com 2 ouvidos (M, 2, N); recebi {shape}.",
                                f"{name}: expected Data.IR with 2 ears (M, 2, N); got {shape}."))
        if int(np.prod(shape)) > MAX_ELEMENTS:
            raise SofaError(msg(f"{name} é grande demais para este servidor.", f"{name} is too large for this server."))

        ir = np.asarray(f["Data.IR"], dtype=np.float32)
        fs = float(np.ravel(np.asarray(f["Data.SamplingRate"]))[0])
        pos = np.asarray(f["SourcePosition"], dtype=np.float64)
        ptype = _text(f["SourcePosition"].attrs.get("Type", "spherical")).lower()
        delay = np.asarray(f["Data.Delay"], dtype=np.float64) if "Data.Delay" in f else None

    if pos.ndim != 2 or pos.shape[0] != ir.shape[0] or pos.shape[1] != 3:
        raise SofaError(msg(f"{name}: SourcePosition não combina com Data.IR.", f"{name}: SourcePosition does not match Data.IR."))
    if fs <= 0:
        raise SofaError(msg(f"{name}: taxa de amostragem inválida.", f"{name}: invalid sampling rate."))

    if ptype.startswith("cart"):
        x, y, z = pos[:, 0], pos[:, 1], pos[:, 2]
        az_sofa = np.degrees(np.arctan2(y, x))
        el = np.degrees(np.arctan2(z, np.hypot(x, y)))
        r = np.sqrt(x * x + y * y + z * z)
    else:
        az_sofa, el, r = pos[:, 0], pos[:, 1], pos[:, 2]
    # SOFA azimuth grows to the left (counter-clockwise); the app counts positive to the right.
    az = -np.asarray(az_sofa, dtype=np.float64)
    az = (az + 180.0) % 360.0 - 180.0
    radius = float(np.median(r)) if np.ptp(r) < 1e-3 else 0.0

    if delay is not None and np.any(delay != 0):
        d = np.broadcast_to(delay.reshape(-1, 2) if delay.size >= 2 else np.zeros((1, 2)), (ir.shape[0], 2))
        shifts = np.rint(d).astype(int)
        shifts = np.clip(shifts, 0, 2048)
        longest = int(shifts.max())
        if longest > 0:
            shifted = np.zeros((ir.shape[0], 2, ir.shape[2] + longest), dtype=np.float32)
            for m in range(ir.shape[0]):
                for e in range(2):
                    s = int(shifts[m, e])
                    shifted[m, e, s:s + ir.shape[2]] = ir[m, e]
            ir = shifted

    return HrtfSet(name=name, fs=fs, ir=ir, azimuth=az, elevation=np.asarray(el, dtype=np.float64), radius_m=radius)
