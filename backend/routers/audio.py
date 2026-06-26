"""Audio router — upload, info, visualisation endpoints."""
from __future__ import annotations

from pathlib import Path
from typing import List, Optional

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

import services.audio_service as svc
from services.session_store import (
    add_entry, get_entry, list_entries, new_audio_id, remove_entry, persist_session
)

router = APIRouter()


# ── Schemas ───────────────────────────────────────────────────────────────────

class AudioMeta(BaseModel):
    audio_id: str
    name: str
    sample_rate: int
    channels: int
    duration_s: float


class MetricRequest(BaseModel):
    metric_key: str
    field_type: str = "free"   # "free" | "diffuse"


class BatchRequest(BaseModel):
    audio_ids: List[str]
    metric_keys: List[str]
    field_type: str = "free"


class CalibrateRequest(BaseModel):
    sensitivity_mv_pa: float   # microphone sensitivity in mV/Pa
    fs_voltage: float = 1.0    # full-scale voltage of recording chain (V)


# ── Upload ────────────────────────────────────────────────────────────────────

@router.post("/upload", response_model=List[AudioMeta])
async def upload_audio(
    session_id: str = Form(...),
    files: List[UploadFile] = File(...),
):
    results = []
    for f in files:
        if not f.filename.lower().endswith(".wav"):
            raise HTTPException(400, f"{f.filename} is not a WAV file")
        data = await f.read()
        entry = svc.load_wav(data, f.filename)
        add_entry(session_id, entry)
        results.append(AudioMeta(
            audio_id=entry.audio_id,
            name=entry.name,
            sample_rate=entry.sample_rate,
            channels=entry.channels,
            duration_s=entry.duration_s,
        ))
    return results


@router.delete("/{session_id}/{audio_id}")
def delete_audio(session_id: str, audio_id: str):
    remove_entry(session_id, audio_id)
    return {"deleted": audio_id}


@router.get("/list/{session_id}", response_model=List[AudioMeta])
def list_audio(session_id: str):
    return [
        AudioMeta(audio_id=e.audio_id, name=e.name,
                  sample_rate=e.sample_rate, channels=e.channels,
                  duration_s=e.duration_s)
        for e in list_entries(session_id)
    ]


# ── Stream (playback) ─────────────────────────────────────────────────────────

@router.get("/{session_id}/{audio_id}/stream")
def stream_audio(session_id: str, audio_id: str):
    entry = get_entry(session_id, audio_id)
    if not entry:
        raise HTTPException(404, "Audio not found")
    return FileResponse(
        path=str(entry.raw_path),
        media_type="audio/wav",
        filename=entry.name,
    )


# ── Visualisation endpoints ───────────────────────────────────────────────────

def _get(session_id, audio_id):
    entry = get_entry(session_id, audio_id)
    if not entry:
        raise HTTPException(404, "Audio not found")
    return entry


@router.get("/{session_id}/{audio_id}/waveform")
def waveform(session_id: str, audio_id: str):
    return svc.compute_waveform(_get(session_id, audio_id))


@router.get("/{session_id}/{audio_id}/spectrum")
def spectrum(session_id: str, audio_id: str):
    return svc.compute_spectrum(_get(session_id, audio_id))


@router.get("/{session_id}/{audio_id}/spectrogram")
def spectrogram(
    session_id: str, audio_id: str,
    nfft:       int   = Query(2048, ge=64, le=16384),
    overlap:    float = Query(75.0, ge=0,  le=95),
    window:     str   = Query("hann"),
    kaiser_beta: float = Query(14.0),
    cmap:       str   = Query("magma"),
    freq_scale: str   = Query("log"),
    fmax:       Optional[float] = Query(None),
    dyn_range:  float = Query(90.0, ge=20, le=160),
):
    params = dict(nfft=nfft, overlap=overlap, window=window, kaiser_beta=kaiser_beta,
                  cmap=cmap, freq_scale=freq_scale, fmax=fmax, dyn_range=dyn_range)
    return svc.compute_spectrogram(_get(session_id, audio_id), params=params)


@router.get("/{session_id}/{audio_id}/octave")
def octave(
    session_id: str, audio_id: str,
    weighting: str = Query("Z"),   # "Z" | "A" | "C"
):
    return svc.compute_octave_bands(_get(session_id, audio_id), weighting=weighting)


@router.get("/{session_id}/{audio_id}/envelope")
def envelope(
    session_id: str, audio_id: str,
    smoothing_ms: float = Query(0.0, ge=0),
    lpf_hz:       Optional[float] = Query(None),
):
    return svc.compute_envelope(
        _get(session_id, audio_id),
        smoothing_ms=smoothing_ms,
        lpf_hz=lpf_hz,
    )


# ── Metrics ───────────────────────────────────────────────────────────────────

@router.post("/{session_id}/{audio_id}/metrics")
def compute_metric(session_id: str, audio_id: str, body: MetricRequest, background_tasks: BackgroundTasks):
    entry = _get(session_id, audio_id)
    try:
        result = svc.compute_metric(entry, body.metric_key, field_type=body.field_type)
        background_tasks.add_task(persist_session, session_id)
        return result
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{session_id}/{audio_id}/calibrate")
def calibrate(session_id: str, audio_id: str, body: CalibrateRequest, background_tasks: BackgroundTasks):
    """Store microphone calibration. calibration_pa = (fs_voltage * 1000) / sensitivity_mv_pa."""
    entry = _get(session_id, audio_id)
    if body.sensitivity_mv_pa <= 0:
        raise HTTPException(400, "sensitivity_mv_pa must be > 0")
    entry.calibration_pa = (body.fs_voltage * 1000.0) / body.sensitivity_mv_pa
    entry.invalidate_cache()
    background_tasks.add_task(persist_session, session_id)
    return {"audio_id": audio_id, "calibration_pa": entry.calibration_pa}


@router.delete("/{session_id}/{audio_id}/calibrate")
def clear_calibration(session_id: str, audio_id: str, background_tasks: BackgroundTasks):
    """Remove calibration (revert to normalised float signal)."""
    entry = _get(session_id, audio_id)
    entry.calibration_pa = None
    entry.invalidate_cache()
    background_tasks.add_task(persist_session, session_id)
    return {"audio_id": audio_id, "calibration_pa": None}


@router.post("/{session_id}/batch")
def batch_metrics(session_id: str, body: BatchRequest, background_tasks: BackgroundTasks):
    rows = []
    for aid in body.audio_ids:
        entry = get_entry(session_id, aid)
        if not entry:
            continue
        row = {"audio_id": aid, "name": entry.name}
        for mk in body.metric_keys:
            try:
                res = svc.compute_metric(entry, mk, field_type=body.field_type)
                row[mk] = res.get("global")
            except Exception:
                row[mk] = None
        rows.append(row)
    background_tasks.add_task(persist_session, session_id)
    return {"rows": rows, "metric_keys": body.metric_keys}
