"""Sample-format helpers shared by the audio service and the session store."""
from __future__ import annotations

import numpy as np

# Sample types a browser can play from a WAV file as they are. Anything else (64-bit PCM or float)
# is converted to 32-bit float for playback and download.
BROWSER_SAFE = frozenset(np.dtype(t) for t in (np.uint8, np.int16, np.int32, np.float32))


def normalise_samples(data: np.ndarray) -> np.ndarray:
    """Samples as read by scipy.io.wavfile -> float64 with full scale at 1.0 (what every analysis uses).

    24-bit files arrive as int32, left-justified, so they share the int32 scale.
    """
    if data.dtype == np.uint8:                     # 8-bit WAV is unsigned and centred on 128
        return (data.astype(np.float64) - 128.0) / 128.0
    if data.dtype == np.int16:
        return data.astype(np.float64) / 32768.0
    if data.dtype == np.int32:
        return data.astype(np.float64) / 2147483648.0
    if data.dtype == np.int64:
        return data.astype(np.float64) / 9223372036854775808.0
    return data.astype(np.float64)
