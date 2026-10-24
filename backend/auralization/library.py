"""The built-in library of headphone responses: the SBAF measurements (CC BY 4.0) kept in data/headphones/sbaf.

Each entry has one file per channel when both were measured; the two are averaged in dB to give one curve.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, Optional

import numpy as np

from .headphone import HeadphoneSet, read_headphone_csv

FOLDER = Path(__file__).parent.parent / "data" / "headphones" / "sbaf"
PREFIX = "lib:"


@lru_cache(maxsize=1)
def index() -> dict:
    return json.loads((FOLDER / "index.json").read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def _by_id() -> Dict[str, dict]:
    return {item["id"]: item for item in index()["items"]}


def label(item: dict) -> str:
    return f"{item['brand']} {item['model']}"


@lru_cache(maxsize=64)
def load(lib_id: str) -> Optional[HeadphoneSet]:
    """The response of a library entry (`lib_id` without the `lib:` prefix), or None when there is no such entry."""
    item = _by_id().get(lib_id)
    if item is None:
        return None
    curves = [read_headphone_csv((FOLDER / f).read_bytes(), f) for f in item["files"]]
    freq = curves[0].freq
    db = np.mean([np.interp(np.log10(freq), np.log10(c.freq), c.db) for c in curves], axis=0)
    rig = index()["rigs"].get(item["rig"], {}).get("en", item["rig"])
    return HeadphoneSet(name=f"{label(item)} ({rig})", freq=freq, db=db, builtin=True)
