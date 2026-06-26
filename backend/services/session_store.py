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
import uuid
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Optional

import numpy as np

TMP_DIR = Path(__file__).parent.parent / "tmp_sessions"
TMP_DIR.mkdir(exist_ok=True)


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
    for json_file in TMP_DIR.glob("*.json"):
        try:
            payload = json.loads(json_file.read_text(encoding="utf-8"))
            session_id = payload["session_id"]
            _sessions[session_id] = {}

            for aid, meta in payload["entries"].items():
                raw_path = Path(meta["raw_path"])
                if not raw_path.exists():
                    continue  # WAV deleted — skip this entry

                sr, data = wavfile.read(str(raw_path))
                if data.dtype == np.int16:
                    norm = data.astype(np.float64) / 32768.0
                elif data.dtype == np.int32:
                    norm = data.astype(np.float64) / 2147483648.0
                else:
                    norm = data.astype(np.float64)

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
        _sessions[session_id] = {}
    return _sessions[session_id]


def get_entry(session_id: str, audio_id: str) -> Optional[AudioEntry]:
    return _sessions.get(session_id, {}).get(audio_id)


def add_entry(session_id: str, entry: AudioEntry) -> None:
    get_or_create_session(session_id)
    _sessions[session_id][entry.audio_id] = entry
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
    return list(_sessions.get(session_id, {}).values())


def new_audio_id() -> str:
    return uuid.uuid4().hex[:12]
