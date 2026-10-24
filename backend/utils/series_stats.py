"""Summary statistics of a metric that varies in time (loudness, roughness, tonality...).

The percentiles follow the habit of sound quality work: Nx is the value that the metric exceeds in x % of the time,
so N5 is the 95th percentile of the series. The same names are used for every metric (N5 of a loudness is the
loudness N5 of ISO 532-1; for a roughness it is simply the value exceeded in 5 % of the time).

The time steps of the metric series are uniform, so every point counts the same.
"""
from typing import Any, Dict, Optional, Sequence

import numpy as np

#: Shares of the time (in %) for which the exceeded value is given.
EXCEEDED_PERCENT = (5, 10, 50, 90, 95)

#: Fewest finite points that make statistics worth showing.
MIN_POINTS = 3


def series_statistics(t: Sequence[float], values: Sequence[float]) -> Optional[Dict[str, Any]]:
    """Statistics of a time series, or None when it has too few finite points.

    Returns n, mean, std, min, max, t_min, t_max, duration_s and ``exceeded``: {"5": value exceeded in 5 % of the
    time, ...}. Points that are not finite (NaN, inf) are left out.
    """
    t = np.asarray(t, dtype=float).ravel()
    v = np.asarray(values, dtype=float).ravel()
    n = min(len(t), len(v))
    t, v = t[:n], v[:n]
    ok = np.isfinite(v) & np.isfinite(t)
    t, v = t[ok], v[ok]
    if len(v) < MIN_POINTS:
        return None
    i_max, i_min = int(np.argmax(v)), int(np.argmin(v))
    exceeded = {str(p): float(np.percentile(v, 100 - p)) for p in EXCEEDED_PERCENT}
    return {
        "n": int(len(v)),
        "mean": float(v.mean()),
        "std": float(v.std()),
        "min": float(v[i_min]),
        "max": float(v[i_max]),
        "t_min": float(t[i_min]),
        "t_max": float(t[i_max]),
        "duration_s": float(t[-1] - t[0]),
        "exceeded": exceeded,
    }
