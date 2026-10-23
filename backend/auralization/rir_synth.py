"""Synthetic room responses for the quick scenes (kitchen, car cabin, aircraft cabin, living room).

It is a statistical model of a diffuse reverberant tail, not a simulation of a room: the response is a direct impulse
followed by band-limited noise whose decay in each octave band follows the reverberation time asked for. The level of
the tail relative to the direct sound comes from the critical distance (Kuttruff). There are no individual early
reflections, so use a measured response when the early reflections matter.
"""
from __future__ import annotations

from typing import Dict

import numpy as np
from scipy.signal import butter, sosfilt

from .rir import BANDS_HZ, RirSet, from_array

SPEED_OF_SOUND = 343.0
MAX_TAIL_S = 4.0
MIN_RT60_S = 0.02


def critical_distance(volume_m3: float, rt60_s: float) -> float:
    """Distance at which the direct and the reverberant energy are equal (Kuttruff): 0.057 sqrt(V / T)."""
    return 0.057 * float(np.sqrt(volume_m3 / max(rt60_s, 1e-3)))


def _band_filter(fc: float, fs: float, first: bool, last: bool):
    lo, hi = fc / 2 ** 0.5, fc * 2 ** 0.5
    if first:
        return butter(4, min(hi, 0.45 * fs), btype="low", fs=fs, output="sos")
    if last or hi >= 0.45 * fs:
        return butter(4, lo, btype="high", fs=fs, output="sos")
    return butter(4, [lo, hi], btype="band", fs=fs, output="sos")


def synth_rir(fs: int, rt60: Dict[int, float], volume_m3: float, distance_m: float, seed: int = 1234) -> np.ndarray:
    """Mono response: a unit impulse after the travel time, plus the diffuse tail. Returns float32 (n,)."""
    bands = [int(b) for b in BANDS_HZ if b * 2 ** 0.5 < 0.5 * fs or b == BANDS_HZ[0]]
    times = {b: max(float(rt60.get(b, rt60[min(rt60, key=lambda k: abs(k - b))])), MIN_RT60_S) for b in bands}
    t_max = max(times.values())
    delay = int(round(distance_m / SPEED_OF_SOUND * fs))
    tail_n = int(min(1.15 * t_max + 0.05, MAX_TAIL_S) * fs)
    n = delay + tail_n
    t = np.arange(tail_n) / fs
    rng = np.random.default_rng(seed)
    tail = np.zeros(tail_n)
    for i, b in enumerate(bands):
        noise = rng.standard_normal(tail_n)
        sos = _band_filter(b, fs, first=(i == 0), last=(i == len(bands) - 1))
        tail += sosfilt(sos, noise) * np.exp(-np.log(1000.0) * t / times[b])
    ramp = max(int(0.002 * fs), 1)                      # no click where the tail begins
    tail[:ramp] *= np.linspace(0.0, 1.0, ramp)
    # level of the tail relative to the direct sound: (r / Dc)^2 of the direct energy
    t_mid = times[min(bands, key=lambda b: abs(b - 1000))]
    ratio = (distance_m / critical_distance(volume_m3, t_mid)) ** 2
    energy = float(np.sum(tail ** 2))
    if energy > 0:
        tail *= np.sqrt(ratio / energy)
    h = np.zeros(n)
    h[delay] = 1.0
    h[delay:] += tail
    return h.astype(np.float32)


def synth_rirset(name: str, fs: int, rt60: Dict[int, float], volume_m3: float, distance_m: float, seed: int = 1234) -> RirSet:
    return from_array(name, synth_rir(fs, rt60, volume_m3, distance_m, seed), fs)
