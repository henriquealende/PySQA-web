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

from utils.lang import msg


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
        raise ValueError(msg(f"Tipo de filtro desconhecido: {label!r}", f"Unknown filter type: {label!r}"))


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
            raise ValueError(msg("Informe a frequência fundamental para o Notch harmônico.", "fundamental must be specified for Harmonic Notch."))
        return _apply_harmonic_notch(data, fs, fundamental, q_factor)

    # --- scalar / band-pass filters ---
    if cutoff is None:
        raise ValueError(msg("Informe a frequência de corte para este tipo de filtro.", "cutoff must be specified for this filter type."))

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
                raise ValueError(msg("O corte do passa-faixa deve ser um par (baixa, alta).", "Band-pass cutoff must be a (low, high) tuple."))
            wn = (cutoff[0] / nyq, cutoff[1] / nyq)
            btype = "band"
        case FilterType.BANDSTOP:
            if not hasattr(cutoff, "__len__") or len(cutoff) != 2:
                raise ValueError(msg("O corte do rejeita-faixa deve ser um par (baixa, alta).", "Band-reject cutoff must be a (low, high) tuple."))
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
# Coefficients of the filter, for the live preview in the browser
# ---------------------------------------------------------------------------

_MAX_PREVIEW_SECTIONS = 60


def filter_sos(
    fs: int,
    filter_type: FilterType | str,
    cutoff: float | tuple[float, float] | None = None,
    order: int = 4,
    design: str = "Butterworth",
    fundamental: float | None = None,
    q_factor: float = 30.0,
) -> tuple[np.ndarray, int]:
    """
    The second-order sections of the filter :func:`apply_filter` would use, and how many times the
    cascade has to be run to give the same *magnitude* response.

    ``apply_filter`` runs the filter forward and backward (zero phase), which squares the magnitude, so a
    causal player gets the same tone by running the sections twice (``passes`` = 2). The Linkwitz-Riley
    design runs two such passes (``passes`` = 4). Only the phase differs from the real result.
    """
    if isinstance(filter_type, str):
        filter_type = FilterType.from_label(filter_type)
    nyq = fs / 2.0

    if filter_type == FilterType.OCTAVE:
        raise ValueError(msg("O equalizador de 1/3 de oitava não tem prévia ao vivo.", "The 1/3-octave equaliser has no live preview."))

    if filter_type == FilterType.HARMONIC_NOTCH:
        if fundamental is None or fundamental <= 0:
            raise ValueError(msg("Informe a frequência fundamental para o Notch harmônico.", "fundamental must be specified for Harmonic Notch."))
        from scipy.signal import iirnotch, tf2sos
        sections = []
        k = 1
        while fundamental * k < nyq:
            b, a = iirnotch(fundamental * k, q_factor, fs=float(fs))
            sections.append(tf2sos(b, a)[0])
            k += 1
            if len(sections) > _MAX_PREVIEW_SECTIONS:
                raise ValueError(msg("Há harmônicos demais para a prévia ao vivo; aumente a fundamental.", "Too many harmonics for the live preview; raise the fundamental."))
        if not sections:
            raise ValueError(msg("A fundamental está acima da frequência de Nyquist.", "The fundamental is above the Nyquist frequency."))
        return np.array(sections, dtype=float), 2

    if cutoff is None:
        raise ValueError(msg("Informe a frequência de corte para este tipo de filtro.", "cutoff must be specified for this filter type."))
    two = filter_type in (FilterType.BANDPASS, FilterType.BANDSTOP)
    if two:
        if not hasattr(cutoff, "__len__") or len(cutoff) != 2:
            raise ValueError(msg("O corte deve ser um par (baixa, alta).", "The cutoff must be a (low, high) pair."))
        wn = (cutoff[0] / nyq, cutoff[1] / nyq)
        if not (0 < wn[0] < wn[1] < 1):
            raise ValueError(msg("Use 0 < baixa < alta < Nyquist.", "Use 0 < low < high < Nyquist."))
    else:
        wn = float(cutoff) / nyq
        if not 0 < wn < 1:
            raise ValueError(msg("A frequência de corte deve estar entre 0 e Nyquist.", "The cutoff must be between 0 and Nyquist."))
    btype = {FilterType.LOWPASS: "low", FilterType.HIGHPASS: "high", FilterType.BANDPASS: "band", FilterType.BANDSTOP: "bandstop"}[filter_type]
    linkwitz = design.lower().startswith("link")
    sos = sp.butter(order // 2 if linkwitz else order, wn, btype=btype, output="sos")
    return np.asarray(sos, dtype=float), 4 if linkwitz else 2


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
        raise ValueError(msg(
            f"Eram esperados {len(THIRD_OCTAVE_CENTRES_HZ)} valores de ganho, "
            f"mas vieram {len(gains_db)}.",
            f"Expected {len(THIRD_OCTAVE_CENTRES_HZ)} gain values, "
            f"got {len(gains_db)}."
        ))

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
# Frequency weighting (IEC 61672-1)
# ---------------------------------------------------------------------------

def weighting_gain_db(f: np.ndarray, curve: str) -> np.ndarray:
    """Magnitude response in dB of the A or C weighting at frequencies *f* (Hz), 0 dB at 1 kHz.

    Exact analytic form of IEC 61672-1:2013 (annex E): no bilinear transform, so no warping near Nyquist.
    """
    f = np.asarray(f, dtype=float)
    f1, f2, f3, f4 = 20.598997, 107.65265, 737.86223, 12194.217

    def raw(x):
        x2 = x * x
        if curve == 'A':
            return (f4 ** 2 * x2 ** 2) / ((x2 + f1 ** 2) * np.sqrt((x2 + f2 ** 2) * (x2 + f3 ** 2)) * (x2 + f4 ** 2))
        return (f4 ** 2 * x2) / ((x2 + f1 ** 2) * (x2 + f4 ** 2))

    with np.errstate(divide="ignore"):
        return 20.0 * np.log10(np.maximum(raw(f) / raw(np.array(1000.0)), 1e-12))


def apply_weighting(
    data: np.ndarray,
    fs: int,
    curve: str,
) -> np.ndarray:
    """
    Apply the standard A or C frequency weighting to *data* (once, zero phase).

    The weighting is applied in the frequency domain with the exact IEC 61672-1 magnitude response, so the
    result has the standard's gain at every frequency, 0 dB at 1 kHz. (An earlier version ran a forward-backward
    IIR filter, which applied the curve twice: -38 dB at 100 Hz instead of -19 dB.)

    Parameters
    ----------
    data : ndarray, shape (N,) or (N, channels)
        Input signal (floating-point).
    fs : int
        Sample rate in Hz.
    curve : {'A', 'C'}
        Weighting curve.
    """
    from scipy.fft import next_fast_len, rfft, irfft, rfftfreq

    curve = curve.upper()
    if curve not in ('A', 'C'):
        raise ValueError(msg(f"Curva de ponderação desconhecida: {curve!r}. Use 'A' ou 'C'.", f"Unknown weighting curve: {curve!r}. Use 'A' or 'C'."))

    x = np.asarray(data, dtype=float)
    n = x.shape[0]
    nfft = next_fast_len(n + int(fs))            # one second of padding keeps the end of the signal from wrapping onto the start
    gain = 10.0 ** (weighting_gain_db(rfftfreq(nfft, 1.0 / fs), curve) / 20.0)
    if x.ndim == 1:
        return irfft(rfft(x, nfft) * gain, nfft)[:n]
    out = np.empty_like(x)
    for ch in range(x.shape[1]):
        out[:, ch] = irfft(rfft(x[:, ch], nfft) * gain, nfft)[:n]
    return out
