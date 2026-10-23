"""Files the user brings for the auralization chain (for now: HRTF sets in SOFA).

They are parsed once and kept in memory, per session. They go when the session goes (or when the server restarts:
the browser then asks for the file again).
"""
from __future__ import annotations

import threading
import uuid
from typing import Dict, List, Optional

from services import session_store
from utils import limits
from utils.lang import msg

from .hrtf import SPHERE_ID, sphere_set
from .sofa_io import HrtfSet

MAX_ASSETS_PER_SESSION = 4

_assets: Dict[str, Dict[str, HrtfSet]] = {}
_lock = threading.Lock()


def _prune() -> None:
    for sid in [s for s in _assets if not session_store.has_session(s)]:
        _assets.pop(sid, None)


def add_hrtf(session_id: str, hset: HrtfSet) -> str:
    with _lock:
        _prune()
        mine = _assets.setdefault(session_id, {})
        if len(mine) >= MAX_ASSETS_PER_SESSION:
            raise limits.ResourceLimitError(msg(
                f"Uma sessão guarda no máximo {MAX_ASSETS_PER_SESSION} conjuntos de HRTF. Remova um antes de enviar outro.",
                f"A session holds at most {MAX_ASSETS_PER_SESSION} HRTF sets. Remove one before uploading another."))
        asset_id = uuid.uuid4().hex[:12]
        mine[asset_id] = hset
        return asset_id


def get_hrtf(session_id: str, asset_id: str, fs: float) -> Optional[HrtfSet]:
    """The set for an id; the built-in model has no file, so it is made for the sample rate asked."""
    if asset_id == SPHERE_ID:
        return sphere_set(fs)
    with _lock:
        return _assets.get(session_id, {}).get(asset_id)


def remove(session_id: str, asset_id: str) -> None:
    with _lock:
        _assets.get(session_id, {}).pop(asset_id, None)


def list_hrtf(session_id: str) -> List[tuple]:
    with _lock:
        return list(_assets.get(session_id, {}).items())
