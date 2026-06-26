"""
Windowing module
================
Applies time-domain window functions to a signal segment.

Supported window types (matching the UI combo-box labels):
    Rectangular, Hanning, Hamming, Blackman, Bartlett, Kaiser

Typical usage
-------------
>>> from processing.windowing import apply_window, WindowType
>>> segment, window = apply_window(data, fs,
...                                start_sample=0, end_sample=4096,
...                                window_type=WindowType.HANNING)
"""

from __future__ import annotations

from enum import Enum

import numpy as np


# ---------------------------------------------------------------------------
# Window type enumeration
# ---------------------------------------------------------------------------

class WindowType(str, Enum):
    RECTANGULAR = "Rectangular"
    HANNING     = "Hanning"
    HAMMING     = "Hamming"
    BLACKMAN    = "Blackman"
    BARTLETT    = "Bartlett"
    KAISER      = "Kaiser"

    @classmethod
    def from_label(cls, label: str) -> "WindowType":
        """Convert a UI combo-box string to a WindowType."""
        for member in cls:
            if member.value.lower() == label.strip().lower():
                return member
        raise ValueError(f"Unknown window type: {label!r}")


# ---------------------------------------------------------------------------
# Core helpers
# ---------------------------------------------------------------------------

def get_window(window_type: WindowType | str, n: int,
               kaiser_beta: float = 14.0) -> np.ndarray:
    """
    Return a window array of length *n*.

    Parameters
    ----------
    window_type : WindowType or str
        Window to generate.  A plain string is converted via
        ``WindowType.from_label``.
    n : int
        Number of samples.
    kaiser_beta : float
        Shape parameter β for the Kaiser window (default 14.0 ≈ -57 dB
        side-lobe attenuation).

    Returns
    -------
    w : ndarray, shape (n,)
        Window coefficients in [0, 1].
    """
    if isinstance(window_type, str):
        window_type = WindowType.from_label(window_type)

    match window_type:
        case WindowType.RECTANGULAR:
            return np.ones(n)
        case WindowType.HANNING:
            return np.hanning(n)
        case WindowType.HAMMING:
            return np.hamming(n)
        case WindowType.BLACKMAN:
            return np.blackman(n)
        case WindowType.BARTLETT:
            return np.bartlett(n)
        case WindowType.KAISER:
            return np.kaiser(n, kaiser_beta)
        case _:
            raise ValueError(f"Unhandled window type: {window_type}")


def apply_window(
    data: np.ndarray,
    fs: int,
    start_sample: int | None = None,
    end_sample: int | None = None,
    window_type: WindowType | str = WindowType.HANNING,
    kaiser_beta: float = 14.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Extract a segment from *data* and multiply it by a window function.

    Parameters
    ----------
    data : ndarray, shape (N,) or (N, channels)
        Input signal (single channel assumed when 1-D).
    fs : int
        Sample rate in Hz (used for metadata; not used in computation).
    start_sample : int or None
        First sample index of the segment.  Defaults to 0.
    end_sample : int or None
        One-past-last sample index of the segment.  Defaults to len(data).
    window_type : WindowType or str
        Type of window to apply.
    kaiser_beta : float
        β for the Kaiser window (ignored for other types).

    Returns
    -------
    windowed : ndarray
        Signal segment after windowing, same shape as the input slice.
    window : ndarray, shape (n_samples,)
        The raw window coefficients that were applied.

    Raises
    ------
    ValueError
        If the segment bounds are out of range.
    """
    n_total = data.shape[0]
    start = 0 if start_sample is None else int(start_sample)
    end   = n_total if end_sample is None else int(end_sample)

    if start < 0 or end > n_total or start >= end:
        raise ValueError(
            f"Invalid segment [{start}, {end}) for signal of length {n_total}."
        )

    segment = data[start:end].copy()
    n = end - start
    w = get_window(window_type, n, kaiser_beta)

    # Broadcast window across channels if signal is 2-D
    if segment.ndim == 2:
        windowed = segment * w[:, np.newaxis]
    else:
        windowed = segment * w

    return windowed, w


# ---------------------------------------------------------------------------
# Convenience: overlap-add framing (used by metric calculations later)
# ---------------------------------------------------------------------------

def frame_signal(
    data: np.ndarray,
    frame_length: int,
    hop_length: int,
    window_type: WindowType | str = WindowType.HANNING,
    kaiser_beta: float = 14.0,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Split *data* into overlapping windowed frames.

    Parameters
    ----------
    data : ndarray, shape (N,)
        1-D input signal.
    frame_length : int
        Number of samples per frame.
    hop_length : int
        Number of samples between successive frames (stride).
    window_type : WindowType or str
        Window applied to each frame.
    kaiser_beta : float
        β for Kaiser window.

    Returns
    -------
    frames : ndarray, shape (n_frames, frame_length)
        Windowed frames.
    w : ndarray, shape (frame_length,)
        Window coefficients.
    """
    data = np.asarray(data, dtype=float)
    if data.ndim != 1:
        raise ValueError("frame_signal expects a 1-D array.")

    n = len(data)
    n_frames = 1 + (n - frame_length) // hop_length
    if n_frames <= 0:
        raise ValueError(
            f"Signal length {n} is shorter than frame_length {frame_length}."
        )

    w = get_window(window_type, frame_length, kaiser_beta)

    frames = np.lib.stride_tricks.as_strided(
        data,
        shape=(n_frames, frame_length),
        strides=(data.strides[0] * hop_length, data.strides[0]),
        writeable=False,
    ).copy()

    frames *= w  # element-wise broadcast
    return frames, w
