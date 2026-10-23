"""Choosing and building head-related impulse responses.

Convention of the app: azimuth 0 = in front of the listener, positive to the RIGHT (clockwise seen from above),
range (-180, 180]; elevation positive up. SOFA files count azimuth to the left, which `sofa_io` already flips.
"""
from __future__ import annotations

from math import gcd
from typing import Tuple

import numpy as np
from scipy.signal import correlate, resample_poly

from .sofa_io import HrtfSet

SPHERE_ID = "builtin:sphere"
_HEAD_RADIUS_M = 0.0875
_SPEED_OF_SOUND = 343.0


def wrap_deg(a: float) -> float:
    return float((a + 180.0) % 360.0 - 180.0)


def _unit(az_deg, el_deg):
    az, el = np.radians(az_deg), np.radians(el_deg)
    return np.stack([np.cos(el) * np.cos(az), np.cos(el) * np.sin(az), np.sin(el)], axis=-1)


def spherical_head_hrir(az_deg: float, el_deg: float, fs: float, n: int = 512) -> np.ndarray:
    """Rigid-sphere model: Woodworth interaural delay and the head-shadow filter of Brown and Duda (1998).

    It is a teaching model, not a measurement: no pinna, so elevation only changes how far the source is from the
    interaural axis. Returns (2, n).
    """
    a, c = _HEAD_RADIUS_M, _SPEED_OF_SOUND
    az, el = np.radians(az_deg), np.radians(el_deg)
    lateral = np.arcsin(np.clip(np.sin(az) * np.cos(el), -1.0, 1.0))      # angle from the median plane, + = right
    itd = (a / c) * (abs(lateral) + np.sin(abs(lateral)))                  # Woodworth
    f = np.fft.rfftfreq(n, 1.0 / fs)
    w = 2 * np.pi * f
    w0 = c / a
    alpha_min, theta_min = 0.1, 150.0
    out = np.zeros((2, n))
    for ear, ear_sign in enumerate((-1.0, 1.0)):                           # 0 = left, 1 = right
        cos_inc = np.clip(ear_sign * np.sin(az) * np.cos(el), -1.0, 1.0)
        theta = np.degrees(np.arccos(cos_inc))                              # 0 = source straight at that ear
        alpha = (1 + alpha_min / 2) + (1 - alpha_min / 2) * np.cos(theta / theta_min * np.pi)
        h = (1 + 1j * alpha * w / (2 * w0)) / (1 + 1j * w / (2 * w0))
        near = (ear_sign * lateral) >= 0
        h = h * np.exp(-1j * w * (0.0 if near else itd))
        out[ear] = np.fft.irfft(h, n)
    return out


def sphere_set(fs: float) -> HrtfSet:
    """A placeholder set so that `pick` can treat the model like a measured one (a single, centre direction)."""
    ir = np.zeros((1, 2, 512), dtype=np.float32)
    return HrtfSet(name="Spherical head (model)", fs=fs, ir=ir, azimuth=np.zeros(1), elevation=np.zeros(1),
                   radius_m=0.0, builtin=True)


def pick(hset: HrtfSet, az_deg: float, el_deg: float) -> Tuple[np.ndarray, float, float]:
    """Nearest measured direction (smallest angle). Returns (hrir (2, N) float64, actual azimuth, actual elevation)."""
    if hset.builtin:
        raise ValueError("the model has no measured directions")
    target = _unit(az_deg, el_deg)
    dirs = _unit(hset.azimuth, hset.elevation)
    best = int(np.argmax(dirs @ target))
    return hset.ir[best].astype(np.float64), wrap_deg(hset.azimuth[best]), float(hset.elevation[best])


def hrir_for(hset: HrtfSet, az_deg: float, el_deg: float, fs: float) -> Tuple[np.ndarray, float, float]:
    """The HRIR pair to use at sample rate `fs`, with the direction really used."""
    if hset.builtin:
        return spherical_head_hrir(az_deg, el_deg, fs), wrap_deg(az_deg), float(el_deg)
    ir, az, el = pick(hset, az_deg, el_deg)
    if abs(hset.fs - fs) > 0.5:
        g = gcd(int(round(fs)), int(round(hset.fs)))
        up, down = int(round(fs)) // g, int(round(hset.fs)) // g
        ir = resample_poly(ir, up, down, axis=1)
    return ir, az, el


def magnitude_db(hrir: np.ndarray, fs: float, points: int = 240) -> Tuple[np.ndarray, np.ndarray]:
    """Magnitude of each ear in dB on a log frequency axis (20 Hz to just below Nyquist, at most 20 kHz)."""
    nfft = 1 << int(np.ceil(np.log2(max(hrir.shape[1], 8192))))
    spec = np.abs(np.fft.rfft(hrir, nfft, axis=1))
    f = np.fft.rfftfreq(nfft, 1.0 / fs)
    top = min(20000.0, 0.98 * fs / 2)
    grid = np.geomspace(20.0, top, points)
    db = 20 * np.log10(np.maximum(spec, 1e-9))
    return grid, np.stack([np.interp(grid, f, db[e]) for e in range(2)])


def itd_ms(hrir: np.ndarray, fs: float) -> float:
    """Interaural time difference in ms, positive when the right ear hears the sound first (cross-correlation peak)."""
    left, right = hrir[0], hrir[1]
    if not (np.any(left) and np.any(right)):
        return 0.0
    xc = correlate(left, right, mode="full")
    lag = int(np.argmax(xc)) - (len(right) - 1)       # left[n] ~ right[n - lag]: the left ear lags by `lag` samples
    return 1000.0 * lag / fs
