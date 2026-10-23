"""Absolute level of the stimulus: from a target in dB SPL to a gain on the file.

A file holds numbers between -1 and 1, not sound pressure. To say "this stimulus plays at 60 dB SPL" two things must be
known and PySQA cannot measure them, so the user states them:
- L_FS: the sound pressure level, at the ear, of a full-scale sine wave (peak 1.0) on the user's headphones and sound card
  (measured with an artificial ear or a coupler);
- the target level, a Leq over the whole file (both ears, energy mean), with A weighting or none.

Digital level: the RMS of the signal in dB relative to the RMS of a full-scale sine (so that sine reads 0 dB and a sine
of amplitude 0.1 reads -20 dB). Then SPL = L_FS + digital level, and the gain that reaches a target is
target - L_FS - digital level.
"""
from __future__ import annotations

from typing import Optional

import numpy as np

from processing.filtering import apply_weighting
from utils.lang import msg

P_REF_PA = 20e-6
WEIGHTINGS = ("A", "Z")


class LevelError(ValueError):
    """The level cannot be set (HTTP 400)."""


def digital_level_db(x: np.ndarray, fs: float, weighting: str = "A") -> float:
    """Leq of `x` ((n,) or (n, channels)) in dB re the RMS of a full-scale sine; channels are averaged in energy."""
    x = np.asarray(x, dtype=np.float64)
    if x.ndim == 1:
        x = x[:, None]
    if weighting == "A":
        x = apply_weighting(x, int(round(fs)), "A")
    elif weighting != "Z":
        raise LevelError(msg("Ponderação desconhecida (use A ou Z).", "Unknown weighting (use A or Z)."))
    power = float(np.mean(x ** 2))                       # mean over samples and channels
    if power <= 0:
        raise LevelError(msg("O sinal está em silêncio: não há nível para ajustar.", "The signal is silent: there is no level to set."))
    return 10.0 * np.log10(power / 0.5)                  # a full-scale sine has a mean square of 1/2


def calibrated_spl_db(x: np.ndarray, fs: float, calibration_pa: float, weighting: str = "A") -> float:
    """Leq in dB SPL of a recording whose full scale is `calibration_pa` pascals (peak)."""
    level = digital_level_db(x, fs, weighting)
    fs_spl = 20.0 * np.log10((calibration_pa / np.sqrt(2.0)) / P_REF_PA)      # SPL of a full-scale sine at the microphone
    return fs_spl + level


def gain_db(current_digital_db: float, target_spl: float, fs_spl: float) -> float:
    """Gain in dB that takes a signal at `current_digital_db` to `target_spl` on equipment where a full-scale sine is `fs_spl`."""
    return target_spl - fs_spl - current_digital_db


def source_spl_or_none(x: np.ndarray, fs: float, calibration_pa: Optional[float], weighting: str) -> Optional[float]:
    return None if not calibration_pa else calibrated_spl_db(x, fs, calibration_pa, weighting)
