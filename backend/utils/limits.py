"""Resource limits for small hosted instances (for example a 512 MiB Render instance).

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
    PYSQA_MAX_EXPORT_CELLS      largest Excel table the server builds (CSV is made in the browser)

Set one of them to 0 to disable that limit alone.

On Linux the module also tunes the memory allocator (see _tune_allocator); setting
MALLOC_ARENA_MAX or MALLOC_MMAP_THRESHOLD_ yourself turns that off.
"""
from __future__ import annotations

import contextlib
import ctypes
import os
import sys
import threading
import time
import uuid
from typing import Callable, Dict, Iterator, List, Optional, Tuple

from utils.lang import msg


class ResourceLimitError(Exception):
    """The request is valid but does not fit this server's limits (HTTP 413)."""


class ServerBusyError(Exception):
    """The single heavy-compute slot stayed busy for too long (HTTP 503)."""


class RequestCancelled(Exception):
    """The browser gave up on the request before its turn came, so it was not calculated."""


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
    if os.environ.get("RENDER"):                  # Render sets RENDER=true; if the cgroup limit cannot be read, assume 512 MiB (its smallest size)
        return 512.0
    return None


MEMORY_LIMIT_MB: Optional[float] = _detect_memory_limit_mb()
ENABLED: bool = MEMORY_LIMIT_MB is not None
_SCALE = max(1.0, (MEMORY_LIMIT_MB or 512.0) / 512.0)    # bigger machines get proportionally bigger caps


def _tune_allocator() -> bool:
    """Keep memory freed by a calculation from piling up inside the process (Linux, glibc).

    The server answers each request in its own worker thread and glibc gives every thread a memory
    arena of its own. What a thread frees stays in its arena, so after a few heavy calculations the
    resident size sat at 350 MB on a 512 MB container (175 -> 292 MB on Render after a single
    loudness) and the next calculation was refused for lack of memory. One shared arena, and big
    blocks always taken from the system and given back when freed, keep it near 180 MB.

    Returns True if both settings were applied. A value set through the environment
    (MALLOC_ARENA_MAX, MALLOC_MMAP_THRESHOLD_) wins and leaves this alone.
    """
    if not sys.platform.startswith("linux"):
        return False
    if "MALLOC_ARENA_MAX" in os.environ or "MALLOC_MMAP_THRESHOLD_" in os.environ:
        return False
    try:
        libc = ctypes.CDLL("libc.so.6")
        arenas = libc.mallopt(-8, 1)                  # M_ARENA_MAX: a single arena for all threads
        mmap = libc.mallopt(-3, 256 * 1024)           # M_MMAP_THRESHOLD: blocks of 256 KB or more go back to the system
        return bool(arenas and mmap)
    except (OSError, AttributeError):                 # not glibc (musl, macOS...): nothing to tune
        return False


# Done while the process is still single-threaded, before the first request creates a worker arena.
ALLOCATOR_TUNED: bool = _tune_allocator() if ENABLED else False


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
MAX_EXPORT_CELLS      = _setting("PYSQA_MAX_EXPORT_CELLS",      100_000 * _SCALE)   # ~0.65 MB of RAM per 1000 cells

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
    "loudness_ecma":        (30.0,  62.0),     # on Render (lean tonality, 1 thread): +69 MB at 1 s, +116 at 2 s, +179 at 3 s (plus ~10 %); the package version used +1.75 GB at 2 s
    "roughness_ecma":       (20.0,  135.0),    # on Render: +137 MB at 1 s, +260 MB at 2 s, +358 MB at 2.8 s (plus ~10 %); 650 MB at 5 s here
    "tonality_ecma":        (30.0,  60.0),     # on Render (1 CPU, 1 thread): +291 MB at 5 s, +562 MB at 10 s, plus ~10 %
}

# (Portuguese, English) names shown inside the refusal messages; use label(kind) to pick one.
LABELS: Dict[str, Tuple[str, str]] = {
    "spectrum": ("O espectro", "The spectrum"), "spectrogram": ("O espectrograma", "The spectrogram"),
    "octave": ("A análise em 1/3 de oitava", "The 1/3-octave analysis"),
    "envelope": ("O envelope", "The envelope"), "ipm": ("IPM", "IPM"),
    "sharpness_din": ("Sharpness DIN 45692", "Sharpness DIN 45692"),
    "roughness_dw": ("Roughness (Daniel e Weber)", "Roughness (Daniel and Weber)"),
    "fluctuation_strength": ("Fluctuation Strength", "Fluctuation strength"),
    "loudness_zwk": ("Loudness ISO 532-1", "Loudness ISO 532-1"),
    "loudness_ecma": ("Loudness ECMA-418-2", "Loudness ECMA-418-2"),
    "roughness_ecma": ("Roughness ECMA-418-2", "Roughness ECMA-418-2"),
    "tonality_ecma": ("Tonality ECMA-418-2", "Tonality ECMA-418-2"),
}


def label(kind: str) -> str:
    pair = LABELS.get(kind)
    return msg(*pair) if pair else kind


def estimate_mb(kind: str, duration_s: float, sample_rate: int) -> Optional[float]:
    cost = COST.get(kind)
    if cost is None:
        return None
    seconds = duration_s * max(sample_rate, 48_000) / 48_000
    return (cost[0] + cost[1] * seconds) * SAFETY


def check_budget(kind: str, duration_s: float, sample_rate: int, audio_ram_mb: float = 0.0,
                 can_select: bool = True) -> None:
    """Refuse a computation that would not fit in the memory still free.

    can_select: the request can be narrowed to a section of the file, so the hint says so
    (processing a whole file into a new one cannot, and suggests trimming it instead).
    """
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
    if fits_s >= 1.0 and can_select:
        hint = msg(
            f"Escolha um trecho de até cerca de {fits_s:.1f} s (a barra Trecho acima do gráfico) ou rode o PySQA no seu computador.",
            f"Select a section of up to about {fits_s:.1f} s (the Section bar above the chart) or run PySQA locally.")
    elif fits_s >= 1.0:
        hint = msg(
            f"Corte o arquivo para cerca de {fits_s:.1f} s (Processamento, Janela) ou rode o PySQA no seu computador.",
            f"Trim the file to about {fits_s:.1f} s (Processing, Windowing) or run PySQA locally.")
    elif need_one_s is not None and need_one_s > MEMORY_LIMIT_MB - RESERVE_MB - BASELINE_MB:
        hint = msg(
            f"Até 1 s de áudio precisa de cerca de {need_one_s:.0f} MB, mais do que este servidor consegue dar. "
            "Rode o PySQA no seu computador ou em um servidor com mais memória.",
            f"Even 1 s of audio needs about {need_one_s:.0f} MB, more than this server can spare. "
            "Run PySQA locally or on a server with more memory.")
    else:
        hint = msg("Não há memória livre suficiente agora. Tente de novo daqui a pouco ou rode o PySQA no seu computador.",
                   "There is not enough free memory for it right now. Try again in a moment, or run PySQA locally.")
    raise ResourceLimitError(msg(
        f"{label(kind)} precisa de cerca de {need:.0f} MB para {duration_s:.1f} s de áudio, "
        f"mas este servidor tem cerca de {max(free, 0):.0f} MB livres. {hint}",
        f"{label(kind)} needs about {need:.0f} MB for {duration_s:.1f} s of audio, "
        f"but this server has about {max(free, 0):.0f} MB free. {hint}"
    ))


# ── One heavy job at a time ───────────────────────────────────────────────────

_HEAVY = threading.Semaphore(1)
_STATE = threading.Lock()
_QUEUE: List[str] = []                      # jobs waiting for the slot, oldest first
_RUNNING: Optional[Dict[str, object]] = None


@contextlib.contextmanager
def heavy_slot(cancelled: Optional[Callable[[], bool]] = None, job: str = "", kind: str = "") -> Iterator[None]:
    """Only one memory-hungry computation at a time; the others queue for up to HEAVY_WAIT_S.

    cancelled: asked while waiting; when it says the browser is gone, the request leaves the queue
    without being calculated (a user who drags the section around leaves old requests behind).
    job / kind: name of the request and of what it calculates, shown in /api/health so the browser can
    tell its user whether the calculation is running or waiting, and for how long.
    """
    global _RUNNING
    if not ENABLED:
        yield
        return
    tag = job or uuid.uuid4().hex[:12]
    deadline = time.monotonic() + HEAVY_WAIT_S
    with _STATE:
        _QUEUE.append(tag)
    try:
        while not _HEAVY.acquire(timeout=0.25):
            if cancelled is not None and cancelled():
                raise RequestCancelled()
            if time.monotonic() > deadline:
                raise ServerBusyError(msg("O servidor está ocupado com outro cálculo. Tente de novo daqui a pouco.",
                                          "The server is busy with another calculation. Try again in a moment."))
    finally:
        with _STATE:
            if tag in _QUEUE:
                _QUEUE.remove(tag)
    try:
        if cancelled is not None and cancelled():       # it left while we were taking the slot
            raise RequestCancelled()
        with _STATE:
            _RUNNING = {"job": tag, "kind": kind, "since": time.monotonic()}
        yield
    finally:
        with _STATE:
            _RUNNING = None
        _HEAVY.release()


def heavy_state() -> Dict[str, object]:
    """Who holds the compute slot and who waits for it (for /api/health)."""
    with _STATE:
        running = _RUNNING
        return {
            "running_job": running["job"] if running else None,
            "running_kind": running["kind"] if running else None,
            "running_for_s": round(time.monotonic() - float(running["since"]), 1) if running else None,
            "queue": list(_QUEUE),
            "tracked": ENABLED,          # False on a local server: there is no compute slot, so no queue to show
        }


# ── How long calculations usually take ────────────────────────────────────────
# Seconds of calculation per second of audio, averaged over the latest runs on this server, so the
# browser can say "usually about 15 s" instead of drawing a bar that only pretends to advance.

_TIMING: Dict[str, float] = {}


def record_timing(kind: str, audio_s: float, secs: float) -> None:
    if audio_s <= 0 or secs < 0:
        return
    rate = secs / audio_s
    previous = _TIMING.get(kind)
    _TIMING[kind] = rate if previous is None else 0.5 * previous + 0.5 * rate


# ── Upload checks ─────────────────────────────────────────────────────────────

def check_upload_size(filename: str, size_bytes: int) -> None:
    if MAX_UPLOAD_MB and size_bytes > MAX_UPLOAD_MB * 1048576:
        raise ResourceLimitError(msg(
            f"{filename} é maior que {MAX_UPLOAD_MB:.0f} MB, o máximo que este servidor aceita por arquivo.",
            f"{filename} is larger than {MAX_UPLOAD_MB:.0f} MB, the most this server accepts per file."
        ))


def check_upload_audio(filename: str, duration_s: float) -> None:
    if MAX_AUDIO_SECONDS and duration_s > MAX_AUDIO_SECONDS:
        raise ResourceLimitError(msg(
            f"{filename} dura {duration_s:.0f} s; este servidor aceita até {MAX_AUDIO_SECONDS:.0f} s por arquivo. "
            "Corte-o antes (por exemplo no Audacity) ou rode o PySQA no seu computador.",
            f"{filename} lasts {duration_s:.0f} s; this server accepts up to {MAX_AUDIO_SECONDS:.0f} s per file. "
            "Trim it first (for example in Audacity) or run PySQA locally."
        ))


def check_export_size(cells: int) -> None:
    """An .xlsx is built in memory cell by cell (about 0.65 MB per 1000 cells): refuse the huge ones."""
    if MAX_EXPORT_CELLS and cells > MAX_EXPORT_CELLS:
        raise ResourceLimitError(msg(
            f"Esta tabela tem {cells:,} células; o servidor monta arquivos Excel de até {MAX_EXPORT_CELLS:,.0f}. "
            "Use CSV: ele é feito no seu navegador e não tem limite.",
            f"This table has {cells:,} cells; the server builds Excel files of up to {MAX_EXPORT_CELLS:,.0f}. "
            "Use CSV instead: it is made in your browser and has no limit."
        ))


def _ecma_threads() -> Optional[int]:
    try:
        from psychoacoustics.ecma_fast.tonality_exact import thread_count
        return thread_count()
    except Exception:
        return None


def describe(audio_ram_mb: float = 0.0) -> Dict[str, object]:
    """Snapshot for /api/health."""
    rss = rss_mb()
    return {
        "cpu_count": os.cpu_count(),
        "ecma_threads": _ecma_threads(),
        "enabled": ENABLED,
        "memory_limit_mb": None if MEMORY_LIMIT_MB is None else round(MEMORY_LIMIT_MB),
        "rss_mb": None if rss is None else round(rss),
        "audio_ram_mb": round(audio_ram_mb, 1),
        "max_upload_mb": MAX_UPLOAD_MB,
        "max_audio_seconds": MAX_AUDIO_SECONDS,
        "max_files_per_session": MAX_FILES_PER_SESSION,
        "max_audio_ram_mb": MAX_AUDIO_RAM_MB,
        "session_idle_min": SESSION_IDLE_MIN,
        "max_export_cells": MAX_EXPORT_CELLS,
        "allocator_tuned": ALLOCATOR_TUNED,
        "heavy": heavy_state(),
        "timing_s_per_audio_s": {k: round(v, 3) for k, v in _TIMING.items()},
    }
