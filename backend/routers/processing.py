"""Processing router — filter, window, weighting, loudness adjustment."""
from __future__ import annotations

from typing import List, Optional, Tuple, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import services.audio_service as svc
from services.session_store import add_entry, get_entry
from utils.lang import msg

router = APIRouter()


class FilterRequest(BaseModel):
    session_id: str
    audio_id: str
    filter_type: str
    # scalar for LP/HP; [low, high] for BP/BR; None for Octave/Notch
    cutoff: Optional[Union[float, List[float]]] = None
    method: str = "Butterworth"
    # Harmonic Notch
    fundamental: Optional[float] = None
    q_factor: float = 30.0
    # 1/3-Octave EQ
    octave_gains_db: Optional[List[float]] = None
    new_audio_id: Optional[str] = None   # lets the browser re-create this file under the same id


class FilterSosRequest(BaseModel):
    session_id: str
    audio_id: str
    filter_type: str
    cutoff: Optional[Union[float, List[float]]] = None
    method: str = "Butterworth"
    fundamental: Optional[float] = None
    q_factor: float = 30.0


class WindowRequest(BaseModel):
    session_id: str
    audio_id: str
    start_sample: int
    end_sample: int
    window_type: str
    new_audio_id: Optional[str] = None


class WeightingRequest(BaseModel):
    session_id: str
    audio_id: str
    curve: str   # "A" | "C"
    new_audio_id: Optional[str] = None


class LoudnessAdjRequest(BaseModel):
    session_id: str
    audio_id: str
    reference_audio_id: str
    new_audio_id: Optional[str] = None


def _entry(session_id, audio_id):
    e = get_entry(session_id, audio_id)
    if not e:
        raise HTTPException(404, msg("Áudio não encontrado", "Audio not found"))
    return e


@router.post("/filter")
def apply_filter(body: FilterRequest):
    entry = _entry(body.session_id, body.audio_id)
    new_entry = svc.apply_filter_to_entry(
        entry,
        filter_type=body.filter_type,
        cutoff=body.cutoff,
        method=body.method,
        fundamental=body.fundamental,
        q_factor=body.q_factor,
        octave_gains_db=body.octave_gains_db,
        audio_id=body.new_audio_id,
    )
    add_entry(body.session_id, new_entry)
    return {
        "audio_id": new_entry.audio_id,
        "name": new_entry.name,
        "sample_rate": new_entry.sample_rate,
        "channels": new_entry.channels,
        "duration_s": new_entry.duration_s,
    }


@router.post("/filter-sos")
def filter_sos(body: FilterSosRequest):
    """Coefficients of the filter, so the browser can play the file through it while the settings are changed."""
    from processing.filtering import filter_sos as design
    entry = _entry(body.session_id, body.audio_id)
    try:
        sos, passes = design(entry.sample_rate, body.filter_type, body.cutoff, 4, body.method, body.fundamental, body.q_factor)
    except ValueError as e:
        raise HTTPException(400, str(e))
    return {"sos": sos.tolist(), "passes": passes, "sample_rate": entry.sample_rate}


@router.post("/window")
def apply_window(body: WindowRequest):
    entry = _entry(body.session_id, body.audio_id)
    new_entry = svc.apply_window_to_entry(
        entry, body.start_sample, body.end_sample, body.window_type, audio_id=body.new_audio_id
    )
    add_entry(body.session_id, new_entry)
    return {
        "audio_id": new_entry.audio_id,
        "name": new_entry.name,
        "sample_rate": new_entry.sample_rate,
        "channels": new_entry.channels,
        "duration_s": new_entry.duration_s,
    }


@router.post("/weighting")
def apply_weighting(body: WeightingRequest):
    entry = _entry(body.session_id, body.audio_id)
    new_entry = svc.apply_weighting_to_entry(entry, body.curve, audio_id=body.new_audio_id)
    add_entry(body.session_id, new_entry)
    return {
        "audio_id": new_entry.audio_id,
        "name": new_entry.name,
        "sample_rate": new_entry.sample_rate,
        "channels": new_entry.channels,
        "duration_s": new_entry.duration_s,
    }


@router.post("/loudness_adj")
def loudness_adjustment(body: LoudnessAdjRequest):
    entry = _entry(body.session_id, body.audio_id)
    ref = _entry(body.session_id, body.reference_audio_id)
    new_entry = svc.apply_loudness_adj_to_entry(entry, ref, audio_id=body.new_audio_id)
    add_entry(body.session_id, new_entry)
    return {
        "audio_id": new_entry.audio_id,
        "name": new_entry.name,
        "sample_rate": new_entry.sample_rate,
        "channels": new_entry.channels,
        "duration_s": new_entry.duration_s,
    }
