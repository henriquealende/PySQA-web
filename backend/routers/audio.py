"""Audio router — upload, info, visualisation endpoints."""
from __future__ import annotations

import io
import re
from pathlib import Path
from typing import Dict, List, Optional

import soundfile as sf
import anyio
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile, Query
from fastapi.responses import FileResponse
from pydantic import BaseModel

import services.audio_service as svc
from services.session_store import (
    add_entry, check_session_id, ensure_room, get_entry, list_entries, new_audio_id, remove_entry, persist_session
)
from utils import limits
from utils.lang import msg

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
    t0: Optional[float] = None  # analyse only [t0, t1] seconds of the file
    t1: Optional[float] = None
    job: Optional[str] = None   # the browser's name for this request: lets /api/health say where it is in the queue


class BatchRequest(BaseModel):
    audio_ids: List[str]
    metric_keys: List[str]
    field_type: str = "free"
    sections: Optional[Dict[str, List[float]]] = None   # audio_id → [t0, t1]: files that use only a section


class CalibrateRequest(BaseModel):
    sensitivity_mv_pa: float   # microphone sensitivity in mV/Pa
    fs_voltage: float = 1.0    # full-scale voltage of recording chain (V)


# ── Upload ────────────────────────────────────────────────────────────────────

async def _read_upload(f: UploadFile) -> bytes:
    """Read an upload in chunks so an oversized file is refused before it fills the memory."""
    size = getattr(f, "size", None)
    if size:
        limits.check_upload_size(f.filename, size)
    buf = bytearray()
    while True:
        chunk = await f.read(1024 * 1024)
        if not chunk:
            break
        buf += chunk
        limits.check_upload_size(f.filename, len(buf))
    return bytes(buf)


@router.post("/upload", response_model=List[AudioMeta])
async def upload_audio(
    session_id: str = Form(...),
    files: List[UploadFile] = File(...),
    audio_ids: List[str] = Form(default=[]),     # optional, one per file, in the same order
):
    check_session_id(session_id)
    results = []
    for index, f in enumerate(files):
        if not f.filename.lower().endswith(".wav"):
            raise HTTPException(400, msg(f"{f.filename} não é um arquivo WAV", f"{f.filename} is not a WAV file"))
        data = await _read_upload(f)
        try:                                   # header only: no decoding before the limits are checked
            info = sf.info(io.BytesIO(data))
        except Exception:
            info = None
        if info is not None and info.samplerate:
            limits.check_upload_audio(f.filename, info.frames / info.samplerate)
            ensure_room(session_id, info.frames * info.channels * 8 / 1048576)
        entry = svc.load_wav(data, f.filename, audio_ids[index] if index < len(audio_ids) else None)
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
        raise HTTPException(404, msg("Áudio não encontrado", "Audio not found"))
    return FileResponse(
        path=str(entry.raw_path),
        media_type="audio/wav",
        filename=entry.name,
    )


# ── Visualisation endpoints ───────────────────────────────────────────────────

def _get(session_id, audio_id):
    entry = get_entry(session_id, audio_id)
    if not entry:
        raise HTTPException(404, msg("Áudio não encontrado", "Audio not found"))
    return entry


@router.get("/{session_id}/{audio_id}/waveform")
def waveform(session_id: str, audio_id: str):
    return svc.compute_waveform(_get(session_id, audio_id))


@router.get("/{session_id}/{audio_id}/spectrum")
def spectrum(
    session_id: str, audio_id: str,
    t0: Optional[float] = Query(None, ge=0),    # analyse only [t0, t1] seconds (the waveform stays whole)
    t1: Optional[float] = Query(None, ge=0),
):
    return svc.compute_spectrum(_get(session_id, audio_id), t0=t0, t1=t1)


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
    channel:    int   = Query(0, ge=0, le=1),            # 0 = left (or mono), 1 = right
    t0:         Optional[float] = Query(None, ge=0),
    t1:         Optional[float] = Query(None, ge=0),
):
    params = dict(nfft=nfft, overlap=overlap, window=window, kaiser_beta=kaiser_beta,
                  cmap=cmap, freq_scale=freq_scale, fmax=fmax, dyn_range=dyn_range, channel=channel)
    return svc.compute_spectrogram(_get(session_id, audio_id), params=params, t0=t0, t1=t1)


@router.get("/{session_id}/{audio_id}/octave")
def octave(
    session_id: str, audio_id: str,
    weighting: str = Query("Z"),   # "Z" | "A" | "C"
    t0: Optional[float] = Query(None, ge=0),
    t1: Optional[float] = Query(None, ge=0),
):
    return svc.compute_octave_bands(_get(session_id, audio_id), weighting=weighting, t0=t0, t1=t1)


@router.get("/{session_id}/{audio_id}/envelope")
def envelope(
    session_id: str, audio_id: str,
    smoothing_ms: float = Query(0.0, ge=0),
    lpf_hz:       Optional[float] = Query(None),
    t0:           Optional[float] = Query(None, ge=0),
    t1:           Optional[float] = Query(None, ge=0),
):
    return svc.compute_envelope(
        _get(session_id, audio_id),
        smoothing_ms=smoothing_ms,
        lpf_hz=lpf_hz,
        t0=t0, t1=t1,
    )


# ── Metrics ───────────────────────────────────────────────────────────────────

_JOB_ID = re.compile(r"^[A-Za-z0-9_-]{1,40}$")


@router.post("/{session_id}/{audio_id}/metrics")
def compute_metric(session_id: str, audio_id: str, body: MetricRequest, background_tasks: BackgroundTasks, request: Request):
    entry = _get(session_id, audio_id)
    job = body.job if body.job and _JOB_ID.match(body.job) else ""
    # This runs in a worker thread: ask the event loop whether the browser is still there
    gone = lambda: anyio.from_thread.run(request.is_disconnected)
    try:
        result = svc.compute_metric(entry, body.metric_key, field_type=body.field_type, t0=body.t0, t1=body.t1,
                                    cancelled=gone, job=job)
        background_tasks.add_task(persist_session, session_id)
        return result
    except (limits.ResourceLimitError, limits.ServerBusyError, limits.RequestCancelled, svc.SectionError):
        raise                                  # answered as 413 / 503 / 499 / 400 with a readable message
    except Exception as e:
        raise HTTPException(500, str(e))


@router.post("/{session_id}/{audio_id}/calibrate")
def calibrate(session_id: str, audio_id: str, body: CalibrateRequest, background_tasks: BackgroundTasks):
    """Store microphone calibration. calibration_pa = (fs_voltage * 1000) / sensitivity_mv_pa."""
    entry = _get(session_id, audio_id)
    if body.sensitivity_mv_pa <= 0:
        raise HTTPException(400, msg("A sensibilidade (mV/Pa) precisa ser maior que 0", "sensitivity_mv_pa must be > 0"))
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
    skipped = []      # calculations refused to protect the server, with the reason
    for aid in body.audio_ids:
        entry = get_entry(session_id, aid)
        if not entry:
            continue
        row = {"audio_id": aid, "name": entry.name}
        span = (body.sections or {}).get(aid)
        t0, t1 = (span[0], span[1]) if span and len(span) == 2 else (None, None)
        try:
            row["section"] = svc.section_span(entry, t0, t1)      # None: the whole file
        except svc.SectionError as exc:
            for mk in body.metric_keys:
                row[mk] = None
            row["section"] = None
            skipped.append({"audio_id": aid, "name": entry.name, "metric": "section", "reason": str(exc)})
            rows.append(row)
            continue
        for mk in body.metric_keys:
            try:
                res = svc.compute_metric(entry, mk, field_type=body.field_type, t0=t0, t1=t1)
                row[mk] = res.get("global")
            except (limits.ResourceLimitError, limits.ServerBusyError) as exc:
                row[mk] = None
                skipped.append({"audio_id": aid, "name": entry.name, "metric": mk, "reason": str(exc)})
            except Exception:
                row[mk] = None
        rows.append(row)
    background_tasks.add_task(persist_session, session_id)
    return {"rows": rows, "metric_keys": body.metric_keys, "skipped": skipped}
