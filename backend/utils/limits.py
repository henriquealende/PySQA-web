"""Resource limits for small hosted instances (for example Render Free, 512 MiB).

The server keeps every uploaded file in RAM as float64 and a few metrics need hundreds of
MB, so on a 512 MiB container one heavy request used to kill the process (OOM) and take
every other user's session with it. This module decides what fits and what has to wait.

Everything is tunable with environment variables and switches itself off when no memory
limit is detected, so local development stays unrestricted:

    PYSQA_MEMORY_MB             memory budget of the process (default: cgroup limit, or 512 on Render)
    PYSQA_MAX_UPLOAD_MB         largest accepted upload
    PYSQA_MAX_AUDIO_SECONDS     longest accepted file
    PYSQA_MAX_FILES_PER_SESSION files one session may hold (uploads and processed copies)
    PYSQA_MAX_AUDIO_RAM_MB      float64 audio kept in RAM across all sessions
    PYSQA_SESSION_IDLE_MIN      minutes without activity before a session is dropped
    PYSQA_HEAVY_WAIT_S          seconds a heavy job may wait for the single compute slot

Set one of them to 0 to disable that limit alone.
"""
from __future__ import annotations

import contextlib
import os
import threading
from typing import Dict, Iterator, Optional, Tuple


class ResourceLimitError(Exception):
    """The request is valid but does not fit this server's limits (HTTP 413)."""


class ServerBusyError(Exception):
    """The single heavy-compute slot stayed busy for too long (HTTP 503)."""


# ── Detection ─────────────────────────────────────────────────────────────────

def _read_number(path: str) -> Optional[float]:
    try:
        with open(path, "r", encoding="ascii") as fh:
            raw = fh.read().strip()
        return float(raw) if raw and raw != "max" else None
    except (OSError, ValueError):
        return None


def _detect_memory_limit_mb() -> Optional[float]:
    env = os.environ.get("PYSQA_MEMORY_MB")
    if env:
        try:
            return float(env) or None
        except ValueError:
            pass
    for path in ("/sys/fs/cgroup/memory.max", "/sys/fs/cgroup/memory/memory.limit_in_bytes"):
        value = _read_number(path)
        if value and value < (1 << 40):          # unlimited cgroups report "max" or a huge number
            return value / 1048576
    if os.environ.get("RENDER"):                  # Render sets RENDER=true; the Free instance has 512 MiB
        return 512.0
    return None


MEMORY_LIMIT_MB: Optional[float] = _detect_memory_limit_mb()
ENABLED: bool = MEMORY_LIMIT_MB is not None
_SCALE = max(1.0, (MEMORY_LIMIT_MB or 512.0) / 512.0)    # bigger machines get proportionally bigger caps


def _setting(name: str, hosted_default: float) -> Optional[float]:
    raw = os.environ.get(name)
    if raw not in (None, ""):
        try:
            value = float(raw)
        except ValueError:
            value = hosted_default
        return value if value > 0 else None     # 0 disables this limit
    return hosted_default if ENABLED else None


MAX_UPLOAD_MB         = _setting("PYSQA_MAX_UPLOAD_MB",         30 * _SCALE)
MAX_AUDIO_SECONDS     = _setting("PYSQA_MAX_AUDIO_SECONDS",     60 * _SCALE)
MAX_FILES_PER_SESSION = _setting("PYSQA_MAX_FILES_PER_SESSION", 20 * _SCALE)
MAX_AUDIO_RAM_MB      = _setting("PYSQA_MAX_AUDIO_RAM_MB",      120 * _SCALE)
SESSION_IDLE_MIN      = _setting("PYSQA_SESSION_IDLE_MIN",      30)
HEAVY_WAIT_S          = _setting("PYSQA_HEAVY_WAIT_S",          120) or 120.0

BASELINE_MB = 160.0   # idle footprint of this app (FastAPI + numpy/scipy/mosqito), measured on Render
RESERVE_MB  = 40.0    # head-room kept free for the interpreter, request buffers and JSON encoding
SAFETY      = 1.25    # margin applied to the measured cost of each computation


def rss_mb() -> Optional[float]:
    """Resident memory of this process in MB (Linux only)."""
    try:
        with open("/proc/self/statm", "r", encoding="ascii") as fh:
            pages = int(fh.read().split()[1])
        return pages * os.sysconf("SC_PAGE_SIZE") / 1048576
    except (OSError, ValueError, AttributeError, IndexError):
        return None


def used_mb(audio_ram_mb: float = 0.0) -> float:
    measured = rss_mb()
    return measured if measured is not None else BASELINE_MB + audio_ram_mb


# ── Cost of each computation ──────────────────────────────────────────────────
# (base MB, MB per second of 48 kHz audio): the transient memory a computation needs on top
# of what the process already uses. Measured as peak working-set growth on a synthetic clip.

COST: Dict[str, Tuple[float, float]] = {
    "spectrum":             (2.0,   2.0),
    "spectrogram":          (4.0,   3.1),
    "octave":               (3.0,   1.8),
    "envelope":             (3.0,   3.5),
    "ipm":                  (1.0,   9.5),
    "sharpness_din":        (2.0,   51.0),
    "roughness_dw":         (12.0,  0.5),
    "fluctuation_strength": (2.0,   5.5),
    "loudness_zwk":         (3.0,   50.0),
    "loudness_ecma":        (14.0,  142.0),
    "roughness_ecma":       (153.0, 440.0),
    "tonality_ecma":        (111.0, 537.0),
}

LABELS: Dict[str, str] = {
    "spectrum": "The spectrum", "spectrogram": "The spectrogram", "octave": "The 1/3-octave analysis",
    "envelope": "The envelope", "ipm": "IPM", "sharpness_din": "Sharpness DIN 45692",
    "roughness_dw": "Roughness (Daniel and Weber)", "fluctuation_strength": "Fluctuation strength",
    "loudness_zwk": "Loudness ISO 532-1", "loudness_ecma": "Loudness ECMA-418-2",
    "roughness_ecma": "Roughness ECMA-418-2", "tonality_ecma": "Tonality ECMA-418-2",
}


def estimate_mb(kind: str, duration_s: float, sample_rate: int) -> Optional[float]:
    cost = COST.get(kind)
    if cost is None:
        return None
    seconds = duration_s * max(sample_rate, 48_000) / 48_000
    return (cost[0] + cost[1] * seconds) * SAFETY


def check_budget(kind: str, duration_s: float, sample_rate: int, audio_ram_mb: float = 0.0) -> None:
    """Refuse a computation that would not fit in the memory still free."""
    if not ENABLED or MEMORY_LIMIT_MB is None:
        return
    need = estimate_mb(kind, duration_s, sample_rate)
    if need is None:
        return
    free = MEMORY_LIMIT_MB - RESERVE_MB - used_mb(audio_ram_mb)
    if need <= free:
        return

    base, per_s = COST[kind]
    rate_factor = max(sample_rate, 48_000) / 48_000
    fits_s = max(0.0, (free / SAFETY - base) / per_s) / rate_factor if per_s > 0 else 0.0
    need_one_s = estimate_mb(kind, 1.0, sample_rate)
    if fits_s >= 1.0:
        hint = f"Trim the file to about {fits_s:.1f} s (Processing, Windowing) or run PySQA locally."
    elif need_one_s is not None and need_one_s > MEMORY_LIMIT_MB - RESERVE_MB - BASELINE_MB:
        hint = (f"Even 1 s of audio needs about {need_one_s:.0f} MB, more than this server can spare. "
                "Run PySQA locally or on a server with more memory.")
    else:
        hint = "There is not enough free memory for it right now. Try again in a moment, or run PySQA locally."
    raise ResourceLimitError(
        f"{LABELS.get(kind, kind)} needs about {need:.0f} MB for {duration_s:.1f} s of audio, "
        f"but this server has about {max(free, 0):.0f} MB free. {hint}"
    )


# ── One heavy job at a time ───────────────────────────────────────────────────

_HEAVY = threading.Semaphore(1)


@contextlib.contextmanager
def heavy_slot() -> Iterator[None]:
    """Only one memory-hungry computation at a time; the others queue for up to HEAVY_WAIT_S."""
    if not ENABLED:
        yield
        return
    if not _HEAVY.acquire(timeout=HEAVY_WAIT_S):
        raise ServerBusyError("The server is busy with another calculation. Try again in a moment.")
    try:
        yield
    finally:
        _HEAVY.release()


# ── Upload checks ─────────────────────────────────────────────────────────────

def check_upload_size(filename: str, size_bytes: int) -> None:
    if MAX_UPLOAD_MB and size_bytes > MAX_UPLOAD_MB * 1048576:
        raise ResourceLimitError(
            f"{filename} is larger than {MAX_UPLOAD_MB:.0f} MB, the most this server accepts per file."
        )


def check_upload_audio(filename: str, duration_s: float) -> None:
    if MAX_AUDIO_SECONDS and duration_s > MAX_AUDIO_SECONDS:
        raise ResourceLimitError(
            f"{filename} lasts {duration_s:.0f} s; this server accepts up to {MAX_AUDIO_SECONDS:.0f} s per file. "
            "Trim it first (for example in Audacity) or run PySQA locally."
        )


def describe(audio_ram_mb: float = 0.0) -> Dict[str, object]:
    """Snapshot for /api/health."""
    rss = rss_mb()
    return {
        "enabled": ENABLED,
        "memory_limit_mb": None if MEMORY_LIMIT_MB is None else round(MEMORY_LIMIT_MB),
        "rss_mb": None if rss is None else round(rss),
        "audio_ram_mb": round(audio_ram_mb, 1),
        "max_upload_mb": MAX_UPLOAD_MB,
        "max_audio_seconds": MAX_AUDIO_SECONDS,
        "max_files_per_session": MAX_FILES_PER_SESSION,
        "max_audio_ram_mb": MAX_AUDIO_RAM_MB,
        "session_idle_min": SESSION_IDLE_MIN,
    }
