"""
Signal processing package for PySQA.

Modules
-------
windowing  : Window functions applied to time-domain segments.
filtering  : Frequency-selective filters (band-pass, low-pass, high-pass, octave-band).
"""

from processing.windowing import apply_window, get_window, WindowType
from processing.filtering import apply_filter, FilterType, apply_weighting

__all__ = [
    "apply_window",
    "get_window",
    "WindowType",
    "apply_filter",
    "FilterType",
    "apply_weighting",
]
