"""
Filtering module
================
Applies frequency-selective filters to a signal.

Supported filter types (matching the UI combo-box labels):
    Band-pass, Low-pass, High-pass, Band-reject, Octave band

Octave-band equalizer gains (from OctaveEqualizerDialog) are applied as
a set of cascaded second-order sections derived from standard octave-band
centre frequencies.

Typical usage
-------------
>>> from processing.filtering import apply_filter, FilterType
>>> filtered = apply_filter(data, fs,
...                         filter_type=FilterType.BANDPASS,
...                         cutoff=1000.0,
...                         order=4)
"""

from __future__ import annotations

from enum import Enum
from typing import Sequence

import numpy as np
from scipy import signal as sp


# ---------------------------------------------------------------------------
# Filter type enumeration
# ---------------------------------------------------------------------------

class FilterType(str, Enum):
    BANDPASS       = "Band-pass"
    LOWPASS        = "Low-pass"
    HIGHPASS       = "High-pass"
    BANDSTOP       = "Band-reject"
    OCTAVE         = "1/3-Octave band"
    HARMONIC_NOTCH = "Harmonic Notch"

    @classmethod
    def from_label(cls, label: str) -> "FilterType":
        for member in cls:
            if member.value.lower() == label.strip().lower():
                return member
        raise ValueError(f"Unknown filter type: {label!r}")


# ---------------------------------------------------------------------------
# Standard octave-band centre frequencies (ISO 266)
# ---------------------------------------------------------------------------

# Standard octave-band centre frequencies (ISO 266)
OCTAVE_CENTRES_HZ = [31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000]

# Standard 1/3-octave-band centre frequencies (ISO 266, 20 Hz – 20 kHz)
THIRD_OCTAVE_CENTRES_HZ = [
    20, 25, 31.5, 40, 50, 63, 80, 100, 125, 160,
    200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600,
    2000, 2500, 3150, 4000, 5000, 6300, 8000, 10000, 12500, 16000, 20000,
]


# ---------------------------------------------------------------------------
# Core function
# ---------------------------------------------------------------------------

def apply_filter(
    data: np.ndarray,
    fs: int,
    filter_type: FilterType | str = FilterType.BANDPASS,
    cutoff: float | tuple[float, float] | None = None,
    order: int = 4,
    design: str = "Butterworth",
    octave_gains_db: Sequence[float] | None = None,
    fundamental: float | None = None,
    q_factor: float = 30.0,
) -> np.ndarray:
    """
    Apply a frequency-selective filter to *data*.

    Parameters
    ----------
    data : ndarray, shape (N,) or (N, channels)
        Input signal.
    fs : int
        Sample rate in Hz.
    filter_type : FilterType or str
        Type of filter to apply.
    cutoff : float, (float, float), or None
        Cut-off frequency in Hz.
        - Low-pass / High-pass: single float.
        - Band-pass: ``(low_hz, high_hz)`` tuple.
        - Octave band: ignored (gains are specified via *octave_gains_db*).
    order : int
        Filter order (Butterworth or Linkwitz-Riley).  Linkwitz-Riley uses
        ``order // 2`` Butterworth stages applied twice (zero-phase).
    design : str
        ``"Butterworth"`` or ``"Linkwitz"`` (Linkwitz-Riley).
    octave_gains_db : sequence of float or None
        Gains in dB for each of the 10 octave bands (ISO 266).
        Required when *filter_type* is ``FilterType.OCTAVE``.
        Length must match ``len(OCTAVE_CENTRES_HZ)`` (10 values).

    Returns
    -------
    filtered : ndarray
        Filtered signal, same shape as *data*.

    Raises
    ------
    ValueError
        On invalid parameters.
    """
    if isinstance(filter_type, str):
        filter_type = FilterType.from_label(filter_type)

    data = np.asarray(data, dtype=float)
    nyq = fs / 2.0

    if filter_type == FilterType.OCTAVE:
        return _apply_octave_eq(data, fs, octave_gains_db)

    if filter_type == FilterType.HARMONIC_NOTCH:
        if fundamental is None:
            raise ValueError("fundamental must be specified for Harmonic Notch.")
        return _apply_harmonic_notch(data, fs, fundamental, q_factor)

    # --- scalar / band-pass filters ---
    if cutoff is None:
        raise ValueError("cutoff must be specified for this filter type.")

    linkwitz = design.lower().startswith("link")

    match filter_type:
        case FilterType.LOWPASS:
            wn = float(cutoff) / nyq
            btype = "low"
        case FilterType.HIGHPASS:
            wn = float(cutoff) / nyq
            btype = "high"
        case FilterType.BANDPASS:
            if not hasattr(cutoff, "__len__") or len(cutoff) != 2:
                raise ValueError("Band-pass cutoff must be a (low, high) tuple.")
            wn = (cutoff[0] / nyq, cutoff[1] / nyq)
            btype = "band"
        case FilterType.BANDSTOP:
            if not hasattr(cutoff, "__len__") or len(cutoff) != 2:
                raise ValueError("Band-reject cutoff must be a (low, high) tuple.")
            wn = (cutoff[0] / nyq, cutoff[1] / nyq)
            btype = "bandstop"
        case _:
            raise ValueError(f"Unhandled filter type: {filter_type}")

    # Use second-order sections (SOS) for numerical stability,
    # especially important at very low or very high normalised frequencies.
    if linkwitz:
        sos = sp.butter(order // 2, wn, btype=btype, output='sos')
        y = sp.sosfiltfilt(sos, data, axis=0)
        y = sp.sosfiltfilt(sos, y, axis=0)
    else:
        sos = sp.butter(order, wn, btype=btype, output='sos')
        y = sp.sosfiltfilt(sos, data, axis=0)

    return y


# ---------------------------------------------------------------------------
# Octave-band equaliser
# ---------------------------------------------------------------------------

def _apply_octave_eq(
    data: np.ndarray,
    fs: int,
    gains_db: Sequence[float] | None,
) -> np.ndarray:
    """
    Apply 1/3-octave-band gains in the **frequency domain**.

    Approach
    --------
    1. Compute the FFT of the signal.
    2. For each FFT frequency bin determine which ISO 266 1/3-octave band it
       belongs to (hard boundary at ±1/6 octave: f_low = fc/2^(1/6),
       f_high = fc×2^(1/6)).
    3. Multiply the complex spectrum by the linear-amplitude gain for that
       band.
    4. IFFT → reconstructed equalised signal.

    Parameters
    ----------
    data : ndarray, shape (N,) or (N, channels)
        Input signal.
    fs : int
        Sample rate in Hz.
    gains_db : sequence of 31 floats or None
        Per-band gain in dB.  ``None`` → all bands at 0 dB (unity).

    Returns
    -------
    out : ndarray
        Equalised signal, same shape as *data*.
    """
    if gains_db is None:
        gains_db = [0.0] * len(THIRD_OCTAVE_CENTRES_HZ)

    if len(gains_db) != len(THIRD_OCTAVE_CENTRES_HZ):
        raise ValueError(
            f"Expected {len(THIRD_OCTAVE_CENTRES_HZ)} gain values, "
            f"got {len(gains_db)}."
        )

    data = np.asarray(data, dtype=float)
    N    = data.shape[0]
    nyq  = fs / 2.0

    # Frequency axis for rfft output (shape: N//2+1)
    freqs = np.fft.rfftfreq(N, 1.0 / fs)

    # Build gain curve (linear amplitude) over frequency bins.
    # Default: 1.0 (0 dB) for all bins outside any defined band.
    gain_curve = np.ones(len(freqs))

    # 1/3-octave band edges: fc / 2^(1/6) … fc × 2^(1/6)
    _half = 2.0 ** (1.0 / 6.0)
    for i, (fc, gain_db) in enumerate(zip(THIRD_OCTAVE_CENTRES_HZ, gains_db)):
        f_low  = fc / _half
        f_high = fc * _half
        # Extend first band down to DC and last band up to Nyquist
        if i == 0:
            f_low = 0.0
        if i == len(THIRD_OCTAVE_CENTRES_HZ) - 1:
            f_high = nyq
        mask = (freqs >= f_low) & (freqs < f_high)
        gain_curve[mask] = 10.0 ** (gain_db / 20.0)

    # Apply gains in the frequency domain (handles 1-D and multi-channel)
    if data.ndim == 1:
        out = np.fft.irfft(np.fft.rfft(data) * gain_curve, n=N)
    else:
        out = np.empty_like(data)
        for ch in range(data.shape[1]):
            out[:, ch] = np.fft.irfft(
                np.fft.rfft(data[:, ch]) * gain_curve, n=N
            )

    return out


# ---------------------------------------------------------------------------
# Helper: read slider values from OctaveEqualizerDialog
# ---------------------------------------------------------------------------

def gains_from_eq_dialog(eq_dialog) -> list[float]:
    """
    Extract the current slider values (dB) from an
    ``OctaveEqualizerDialog`` instance.

    Returns a list of 31 floats corresponding to ``THIRD_OCTAVE_CENTRES_HZ``.
    """
    return [s.value() for s in eq_dialog.sliders]


# ---------------------------------------------------------------------------
# Harmonic notch bank
# ---------------------------------------------------------------------------

def _apply_harmonic_notch(
    data: np.ndarray,
    fs: int,
    fundamental: float,
    q_factor: float = 30.0,
) -> np.ndarray:
    """
    Apply a bank of IIR notch filters centred at the fundamental frequency
    and all of its harmonics that lie below the Nyquist frequency.

    Each notch is a 2nd-order IIR designed with
    ``scipy.signal.iirnotch(fn, Q, fs)``.  The filters are applied
    sequentially using zero-phase (``sosfiltfilt``) processing so that
    group-delay distortion is eliminated.

    Parameters
    ----------
    data : ndarray, shape (N,) or (N, channels)
        Input signal (floating-point).
    fs : int
        Sample rate in Hz.
    fundamental : float
        Fundamental frequency in Hz.
    q_factor : float
        Quality factor of each notch (bandwidth = fn / Q).
        Higher values produce narrower notches.  Typical range: 10 – 100.

    Returns
    -------
    out : ndarray
        Filtered signal, same shape as *data*.
    """
    from scipy.signal import iirnotch, zpk2sos, sosfiltfilt

    nyq = fs / 2.0
    out = np.asarray(data, dtype=float).copy()

    harmonic = 1
    while True:
        fn = fundamental * harmonic
        if fn >= nyq:
            break
        b, a = iirnotch(fn, q_factor, fs=float(fs))
        # Convert to SOS for numerical stability
        from scipy.signal import tf2sos
        sos = tf2sos(b, a)
        out = sosfiltfilt(sos, out, axis=0)
        harmonic += 1

    return out


# ---------------------------------------------------------------------------
# Frequency-weighting filters (IEC 61672)
# ---------------------------------------------------------------------------

def apply_weighting(
    data: np.ndarray,
    fs: int,
    curve: str,
) -> np.ndarray:
    """
    Apply a standard frequency-weighting curve to *data*.

    The analog prototype is derived from the IEC 61672-1:2013 pole/zero
    definition and converted to a digital IIR via the bilinear transform.
    The gain is normalised to 0 dB at 1 kHz.

    Parameters
    ----------
    data : ndarray, shape (N,) or (N, channels)
        Input signal (floating-point).
    fs : int
        Sample rate in Hz.
    curve : {'A', 'C'}
        Weighting curve.

    Returns
    -------
    weighted : ndarray
        Weighted signal, same shape as *data*.
    """
    from scipy.signal import bilinear_zpk, zpk2sos, sosfiltfilt

    # IEC 61672 defining frequencies
    f1 = 20.598997
    f2 = 107.65265
    f3 = 737.86223
    f4 = 12194.217

    w1 = 2.0 * np.pi * f1
    w4 = 2.0 * np.pi * f4

    curve = curve.upper()
    if curve == 'A':
        w2 = 2.0 * np.pi * f2
        w3 = 2.0 * np.pi * f3
        z_s = [0.0, 0.0, 0.0, 0.0]
        p_s = [-w1, -w1, -w2, -w3, -w4, -w4]
    elif curve == 'C':
        z_s = [0.0, 0.0]
        p_s = [-w1, -w1, -w4, -w4]
    else:
        raise ValueError(f"Unknown weighting curve: {curve!r}. Use 'A' or 'C'.")

    # Normalise: 0 dB gain at 1 kHz (IEC 61672 requirement)
    s1k = 1j * 2.0 * np.pi * 1000.0
    H1k = np.prod([s1k - z for z in z_s]) / np.prod([s1k - p for p in p_s])
    k_s = 1.0 / abs(H1k)

    z_d, p_d, k_d = bilinear_zpk(z_s, p_s, k_s, fs)
    sos = zpk2sos(z_d, p_d, k_d)

    data = np.asarray(data, dtype=float)
    return sosfiltfilt(sos, data, axis=0)
