"""In-memory session store with disk persistence.

Each browser tab gets a session_id (UUID) created on first upload.
Each session holds a dict of AudioEntry objects keyed by audio_id.

Persistence strategy:
- Audio data is already on disk as a WAV in tmp_sessions/<audio_id>.wav
- Metadata + metric cache is saved to tmp_sessions/<session_id>.json
- On startup, load_all_sessions() restores everything from disk automatically
"""
from __future__ import annotations

import json
import os
import re
import threading
import time
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import numpy as np

from utils import limits
from utils.lang import msg
from utils.samples import normalise_samples

# PYSQA_TMP_DIR moves the session files (tests use it to stay out of the project folder)
TMP_DIR = Path(os.environ.get("PYSQA_TMP_DIR") or Path(__file__).parent.parent / "tmp_sessions")
TMP_DIR.mkdir(parents=True, exist_ok=True)

# Ids chosen by the browser end up in dictionary keys and file names: accept plain identifiers only.
_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


class InvalidIdError(ValueError):
    """A client-supplied session id is not a plain identifier (HTTP 400)."""


def check_session_id(session_id: str) -> None:
    if not isinstance(session_id, str) or not _SAFE_ID.match(session_id):
        raise InvalidIdError(msg("Identificador de sessão inválido.", "Invalid session id."))


def usable_audio_id(hint) -> Optional[str]:
    """The browser may pick the id of the audio it uploads, so a restored file keeps its old id.
    Anything that is not a plain identifier is ignored and the server makes one up."""
    return hint if isinstance(hint, str) and _SAFE_ID.match(hint) else None


@dataclass
class AudioEntry:
    audio_id: str
    name: str               # original filename
    sample_rate: int
    channels: int
    duration_s: float
    data: np.ndarray        # float64, normalised to [-1, 1]
    raw_path: Path          # WAV on disk (for streaming / export)
    calibration_pa: Optional[float] = None

    # Cached computation results — persisted to JSON
    _cache: Dict = field(default_factory=dict)

    def invalidate_cache(self):
        self._cache.clear()


# Global store: session_id → {audio_id → AudioEntry}
_sessions: Dict[str, Dict[str, AudioEntry]] = {}
_last_seen: Dict[str, float] = {}          # session_id → time of its last request
_state_lock = threading.RLock()


def _touch(session_id: str) -> None:
    _last_seen[session_id] = time.time()


def _entry_mb(entry: AudioEntry) -> float:
    return entry.data.nbytes / 1048576


def audio_ram_mb() -> float:
    """Megabytes of float64 audio currently held in RAM, across all sessions."""
    return sum(_entry_mb(e) for s in list(_sessions.values()) for e in list(s.values()))


# ── Persistence helpers ───────────────────────────────────────────────────────

def _session_path(session_id: str) -> Path:
    return TMP_DIR / f"{session_id}.json"


def _cache_is_serialisable(v) -> bool:
    """Quick check — skip entries that contain non-JSON types or malformed arrays."""
    try:
        json.dumps(v)
    except (TypeError, ValueError):
        return False
    # Reject metric cache entries where x_axis or y_axis contain nested lists
    # (symptom of a 2-D numpy array that was not ravelled before serialisation)
    if isinstance(v, dict):
        for key in ("x_axis", "y_axis"):
            arr = v.get(key)
            if isinstance(arr, list) and arr and isinstance(arr[0], list):
                return False
    return True


def persist_session(session_id: str) -> None:
    """Write session metadata + cache to disk (fire-and-forget, never raises)."""
    try:
        session = _sessions.get(session_id, {})
        entries_data = {}
        for aid, entry in session.items():
            safe_cache = {
                k: v for k, v in entry._cache.items()
                if _cache_is_serialisable(v)
            }
            entries_data[aid] = {
                "audio_id":       entry.audio_id,
                "name":           entry.name,
                "sample_rate":    entry.sample_rate,
                "channels":       entry.channels,
                "duration_s":     entry.duration_s,
                "raw_path":       str(entry.raw_path),
                "calibration_pa": entry.calibration_pa,
                "cache":          safe_cache,
            }
        payload = {"session_id": session_id, "entries": entries_data}
        _session_path(session_id).write_text(json.dumps(payload), encoding="utf-8")
    except Exception as exc:
        print(f"[session_store] persist_session failed: {exc}")


def load_all_sessions() -> None:
    """On backend startup: reload all sessions from disk."""
    from scipy.io import wavfile  # local import to avoid circular at module level

    loaded = 0
    max_age_s = (limits.SESSION_IDLE_MIN or 0) * 60
    for json_file in TMP_DIR.glob("*.json"):
        try:
            payload = json.loads(json_file.read_text(encoding="utf-8"))
            session_id = payload["session_id"]
            if max_age_s and time.time() - json_file.stat().st_mtime > max_age_s:
                continue        # idle for too long: leave the files alone, but do not load them into RAM
            _sessions[session_id] = {}
            _touch(session_id)

            for aid, meta in payload["entries"].items():
                raw_path = Path(meta["raw_path"])
                if not raw_path.exists():
                    continue  # WAV deleted — skip this entry

                sr, data = wavfile.read(str(raw_path))
                norm = normalise_samples(data)

                entry = AudioEntry(
                    audio_id      = meta["audio_id"],
                    name          = meta["name"],
                    sample_rate   = meta["sample_rate"],
                    channels      = meta["channels"],
                    duration_s    = meta["duration_s"],
                    data          = norm,
                    raw_path      = raw_path,
                    calibration_pa= meta.get("calibration_pa"),
                )
                entry._cache = meta.get("cache", {})
                _sessions[session_id][aid] = entry
                loaded += 1

        except Exception as exc:
            print(f"[session_store] Failed to load {json_file.name}: {exc}")

    if loaded:
        print(f"[session_store] Restored {loaded} audio entries from disk.")


# ── CRUD ──────────────────────────────────────────────────────────────────────

def get_or_create_session(session_id: str) -> Dict[str, AudioEntry]:
    if session_id not in _sessions:
        check_session_id(session_id)
        _sessions[session_id] = {}
    _touch(session_id)
    return _sessions[session_id]


def has_session(session_id: str) -> bool:
    return session_id in _sessions


def get_entry(session_id: str, audio_id: str) -> Optional[AudioEntry]:
    session = _sessions.get(session_id)
    if session is None:
        return None
    _touch(session_id)
    return session.get(audio_id)


def add_entry(session_id: str, entry: AudioEntry) -> None:
    try:
        with _state_lock:
            session = get_or_create_session(session_id)
            previous = session.get(entry.audio_id)          # a restored file re-uses its old id
            if limits.MAX_FILES_PER_SESSION and previous is None and len(session) >= limits.MAX_FILES_PER_SESSION:
                raise limits.ResourceLimitError(msg(
                    f"Uma sessão guarda no máximo {int(limits.MAX_FILES_PER_SESSION)} arquivos. "
                    "Remova alguns antes de adicionar mais.",
                    f"A session holds at most {int(limits.MAX_FILES_PER_SESSION)} files. "
                    "Remove some before adding more."
                ))
            ensure_room(session_id, max(0.0, _entry_mb(entry) - (_entry_mb(previous) if previous else 0.0)))
            session[entry.audio_id] = entry
            if previous is not None and previous.raw_path != entry.raw_path:
                previous.raw_path.unlink(missing_ok=True)
    except limits.ResourceLimitError:
        entry.raw_path.unlink(missing_ok=True)      # the WAV was already written; do not leak it
        raise
    persist_session(session_id)


def remove_entry(session_id: str, audio_id: str) -> None:
    session = _sessions.get(session_id, {})
    if audio_id in session:
        entry = session.pop(audio_id)
        try:
            entry.raw_path.unlink(missing_ok=True)
        except Exception:
            pass
        persist_session(session_id)


def list_entries(session_id: str) -> list[AudioEntry]:
    if session_id in _sessions:
        _touch(session_id)
    return list(_sessions.get(session_id, {}).values())


def new_audio_id() -> str:
    return uuid.uuid4().hex[:12]


# ── Memory protection ─────────────────────────────────────────────────────────

_MIN_IDLE_TO_EVICT_S = 120     # never evict someone who used the app in the last two minutes


def drop_session(session_id: str) -> None:
    """Forget a session and delete its files from disk."""
    session = _sessions.pop(session_id, {})
    _last_seen.pop(session_id, None)
    for entry in session.values():
        try:
            entry.raw_path.unlink(missing_ok=True)
        except Exception:
            pass
    try:
        _session_path(session_id).unlink(missing_ok=True)
    except Exception:
        pass


def evict_idle(max_idle_s: float) -> int:
    """Drop every session that has been idle for longer than *max_idle_s*."""
    now = time.time()
    stale = [sid for sid, seen in list(_last_seen.items()) if now - seen > max_idle_s]
    for sid in stale:
        drop_session(sid)
    return len(stale)


def ensure_room(session_id: str, new_mb: float) -> None:
    """Make sure *new_mb* of audio fits the RAM budget, evicting other idle sessions if needed."""
    budget = limits.MAX_AUDIO_RAM_MB
    if not budget:
        return
    if new_mb > budget:
        raise limits.ResourceLimitError(msg(
            f"Este arquivo precisa de {new_mb:.0f} MB de memória depois de carregado; o servidor guarda no máximo {budget:.0f} MB de áudio.",
            f"This file needs {new_mb:.0f} MB of memory once loaded; the server keeps at most {budget:.0f} MB of audio."
        ))
    while audio_ram_mb() + new_mb > budget:
        now = time.time()
        victims = sorted(
            (seen, sid) for sid, seen in list(_last_seen.items())
            if sid != session_id and _sessions.get(sid) and now - seen > _MIN_IDLE_TO_EVICT_S
        )
        if not victims:
            raise limits.ResourceLimitError(msg(
                "A memória de áudio do servidor está cheia. Remova um arquivo da sua lista ou tente de novo em alguns minutos.",
                "The server's audio memory is full. Remove a file from your list, or try again in a few minutes."
            ))
        drop_session(victims[0][1])


_janitor_started = False


def start_janitor() -> None:
    """Background thread that drops sessions idle for longer than PYSQA_SESSION_IDLE_MIN."""
    global _janitor_started
    idle_min = limits.SESSION_IDLE_MIN
    if _janitor_started or not idle_min:
        return
    _janitor_started = True

    def loop() -> None:
        while True:
            time.sleep(60)
            try:
                dropped = evict_idle(idle_min * 60)
                if dropped:
                    print(f"[session_store] dropped {dropped} idle session(s)")
            except Exception as exc:
                print(f"[session_store] janitor error: {exc}")

    threading.Thread(target=loop, name="session-janitor", daemon=True).start()
