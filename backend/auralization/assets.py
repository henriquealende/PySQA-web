"""Files the user brings for the chain: HRTF sets (SOFA), room responses (WAV) and headphone responses (CSV).

They are parsed once and kept in memory, per session. They go when the session goes (or when the server restarts:
the browser then asks for the file again).
"""
from __future__ import annotations

import threading
import uuid
from typing import Dict, List, Optional, Tuple, Union

from services import session_store
from utils import limits
from utils.lang import msg

from .headphone import HeadphoneSet
from .hrtf import SPHERE_ID, sphere_set
from .rir import RirSet
from .sofa_io import HrtfSet

MAX_PER_KIND = 4

Asset = Union[HrtfSet, RirSet, HeadphoneSet]

_assets: Dict[str, Dict[str, Asset]] = {}
_lock = threading.Lock()


def kind_of(a: Asset) -> str:
    if isinstance(a, RirSet):
        return "rir"
    return "headphone" if isinstance(a, HeadphoneSet) else "hrtf"


def _prune() -> None:
    for sid in [s for s in _assets if not session_store.has_session(s)]:
        _assets.pop(sid, None)


def add(session_id: str, asset: Asset) -> str:
    kind = kind_of(asset)
    with _lock:
        _prune()
        mine = _assets.setdefault(session_id, {})
        if sum(1 for a in mine.values() if kind_of(a) == kind) >= MAX_PER_KIND:
            raise limits.ResourceLimitError(msg(
                f"Uma sessão guarda no máximo {MAX_PER_KIND} arquivos deste tipo. Remova um antes de enviar outro.",
                f"A session holds at most {MAX_PER_KIND} files of this kind. Remove one before uploading another."))
        asset_id = uuid.uuid4().hex[:12]
        mine[asset_id] = asset
        return asset_id


def get_hrtf(session_id: str, asset_id: str, fs: float) -> Optional[HrtfSet]:
    """The set for an id; the built-in model has no file, so it is made for the sample rate asked."""
    if asset_id == SPHERE_ID:
        return sphere_set(fs)
    with _lock:
        a = _assets.get(session_id, {}).get(asset_id)
    return a if isinstance(a, HrtfSet) else None


def get_rir(session_id: str, asset_id: str) -> Optional[RirSet]:
    with _lock:
        a = _assets.get(session_id, {}).get(asset_id)
    return a if isinstance(a, RirSet) else None


def get_headphone(session_id: str, asset_id: str) -> Optional[HeadphoneSet]:
    with _lock:
        a = _assets.get(session_id, {}).get(asset_id)
    return a if isinstance(a, HeadphoneSet) else None


def get(session_id: str, asset_id: str) -> Optional[Asset]:
    with _lock:
        return _assets.get(session_id, {}).get(asset_id)


def remove(session_id: str, asset_id: str) -> None:
    with _lock:
        _assets.get(session_id, {}).pop(asset_id, None)


def list_all(session_id: str) -> List[Tuple[str, Asset]]:
    with _lock:
        return list(_assets.get(session_id, {}).items())
