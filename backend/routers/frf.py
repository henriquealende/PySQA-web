"""System Analysis router: load measured records and compute FRFs and modes."""
from __future__ import annotations

from typing import Dict, List, Optional

import anyio
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

import services.frf_service as frf
from services.session_store import check_session_id, usable_audio_id
from utils import limits

router = APIRouter()


class ImpactParams(BaseModel):
    trigger_pct: float = 20.0       # a hit is where |excitation| first reaches this % of its peak
    pretrigger_pct: float = 5.0     # % of the block kept before the hit
    force_ms: float = 8.0           # the force window keeps the pulse only: this long after the trigger
    exp_end_pct: float = 1.0        # the exponential window on the response ends at this % of its start


class ModeParams(BaseModel):
    enabled: bool = True
    prominence_db: float = 6.0
    min_sep_hz: Optional[float] = None
    max_modes: int = 12
    method: str = "both"            # "half_power" | "fit" | "both"


class ComputeRequest(BaseModel):
    excitation: Optional[str] = None
    responses: List[str]
    estimator: str = "H1"           # H1 | H2 | HV
    averaging: str = "welch"        # welch (random / continuous) | impact
    nperseg: int = 4096
    overlap: float = 50.0
    window: str = "hann"
    detrend: str = "constant"
    response_type: str = "none"     # none | acceleration | velocity | displacement
    show_as: str = "none"
    fmin: float = 0.0
    fmax: Optional[float] = None
    unwrap: bool = False
    impact: ImpactParams = ImpactParams()
    modes: Optional[ModeParams] = None


@router.post("/{session_id}/load")
async def load_files(session_id: str, files: List[UploadFile] = File(...), file_ids: List[str] = Form(default=[]),
                     fs: Optional[float] = Form(default=None)):
    check_session_id(session_id)
    channels: List[frf.Channel] = []
    errors: List[Dict[str, str]] = []
    for k, up in enumerate(files):
        raw = await up.read()
        name = up.filename or "file"
        fid = usable_audio_id(file_ids[k] if k < len(file_ids) else None) or f"f{k}"
        try:
            limits.check_upload_size(name, len(raw))
            got = await anyio.to_thread.run_sync(frf.read_any, fid, name, raw, fs)
            channels.extend(got)
        except (frf.FrfError, limits.ResourceLimitError) as exc:
            errors.append({"file": name, "error": str(exc)})
    if channels:
        try:
            frf.store_channels(session_id, channels)
        except limits.ResourceLimitError as exc:
            raise HTTPException(status_code=413, detail=str(exc))
    return {"channels": [c.meta() for c in channels], "errors": errors}


@router.delete("/{session_id}/{file_id}")
def remove(session_id: str, file_id: str):
    check_session_id(session_id)
    frf.remove_file(session_id, file_id)
    return {"ok": True}


@router.post("/{session_id}/compute")
def compute(session_id: str, body: ComputeRequest):
    check_session_id(session_id)
    try:
        return frf.analyse(session_id, body.model_dump())
    except KeyError:
        # The server forgot these records (restart, or idle for too long): the browser re-sends them
        raise HTTPException(status_code=404, detail="The server no longer has these records.")
    except frf.FrfError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
