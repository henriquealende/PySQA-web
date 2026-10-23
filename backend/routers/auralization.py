"""Auralization router: prepare listening-test stimuli (phase 1: HRTF positioning)."""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import List, Optional

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

import services.audio_service as svc
from auralization import assets, chain as chain_mod, hrtf as hrtf_mod
from auralization.sofa_io import SofaError, read_sofa
from services.session_store import add_entry, check_session_id, get_entry
from utils import limits
from utils.lang import msg

router = APIRouter()

_CATALOG = json.loads((Path(__file__).parent.parent / "auralization" / "catalog.json").read_text(encoding="utf-8"))
_PREVIEW_MAX_S = 12.0


# ── Schemas ───────────────────────────────────────────────────────────────────

class HrtfBlock(BaseModel):
    enabled: bool = True
    asset: str = hrtf_mod.SPHERE_ID
    azimuth: float = Field(0.0, ge=-360, le=360)       # degrees, positive to the right
    elevation: float = Field(0.0, ge=-90, le=90)
    distance_m: float = Field(1.0, ge=0.1, le=100)


class Blocks(BaseModel):
    hrtf: HrtfBlock = HrtfBlock()


class RenderRequest(BaseModel):
    session_id: str
    audio_id: str
    blocks: Blocks = Blocks()
    t0: Optional[float] = None      # preview: where to start, in seconds
    new_audio_id: Optional[str] = None


class ResponseRequest(BaseModel):
    session_id: str
    hrtf: HrtfBlock = HrtfBlock()
    fs: int = 48000


class AssetMeta(BaseModel):
    asset_id: str
    kind: str = "hrtf"
    name: str
    sample_rate: float
    n_directions: int
    n_taps: int
    radius_m: float


# ── Helpers ───────────────────────────────────────────────────────────────────

def _entry(session_id: str, audio_id: str):
    check_session_id(session_id)
    e = get_entry(session_id, audio_id)
    if not e:
        raise HTTPException(404, msg("Áudio não encontrado", "Audio not found"))
    return e


def _chain(blocks: Blocks) -> chain_mod.Chain:
    h = blocks.hrtf
    return chain_mod.Chain(hrtf=chain_mod.HrtfStep(
        enabled=h.enabled, asset=h.asset, azimuth=h.azimuth, elevation=h.elevation, distance_m=h.distance_m))


def _run(session_id: str, mono: np.ndarray, fs: int, blocks: Blocks, kind: str) -> chain_mod.RenderResult:
    try:
        with limits.heavy_slot(kind=kind):
            return chain_mod.render(mono, fs, _chain(blocks), lambda aid: assets.get_hrtf(session_id, aid, fs))
    except chain_mod.ChainError as exc:
        raise HTTPException(400, str(exc))


# ── Catalogue and assets ──────────────────────────────────────────────────────

@router.get("/catalog")
def catalog():
    """Built-in items and the open datasets with their licence status (what may be embedded, what needs upload)."""
    return _CATALOG


@router.post("/assets", response_model=AssetMeta)
async def upload_asset(session_id: str = Form(...), kind: str = Form("hrtf"), file: UploadFile = File(...)):
    check_session_id(session_id)
    if kind != "hrtf":
        raise HTTPException(400, msg("Por enquanto só HRTF (SOFA).", "Only HRTF (SOFA) is supported for now."))
    name = file.filename or "hrtf.sofa"
    if not name.lower().endswith(".sofa"):
        raise HTTPException(400, msg(f"{name} não é um arquivo .sofa", f"{name} is not a .sofa file"))
    buf = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        buf += chunk
        limits.check_upload_size(name, len(buf))
    try:
        hset = read_sofa(bytes(buf), name)
    except SofaError as exc:
        raise HTTPException(400, str(exc))
    asset_id = assets.add_hrtf(session_id, hset)
    return AssetMeta(asset_id=asset_id, name=name, sample_rate=hset.fs, n_directions=hset.n_dirs,
                     n_taps=hset.n_taps, radius_m=hset.radius_m)


@router.get("/{session_id}/assets", response_model=List[AssetMeta])
def list_assets(session_id: str):
    check_session_id(session_id)
    return [AssetMeta(asset_id=aid, name=h.name, sample_rate=h.fs, n_directions=h.n_dirs, n_taps=h.n_taps,
                      radius_m=h.radius_m) for aid, h in assets.list_hrtf(session_id)]


@router.delete("/{session_id}/assets/{asset_id}")
def delete_asset(session_id: str, asset_id: str):
    check_session_id(session_id)
    assets.remove(session_id, asset_id)
    return {"deleted": asset_id}


# ── Render ────────────────────────────────────────────────────────────────────

@router.post("/preview")
def preview(body: RenderRequest):
    """A short stretch of the result as a WAV the browser can play (the original is played by the stream route)."""
    entry = _entry(body.session_id, body.audio_id)
    fs = entry.sample_rate
    start = int(max(0.0, body.t0 or 0.0) * fs)
    stop = min(entry.data.shape[0], start + int(_PREVIEW_MAX_S * fs))
    if stop <= start:
        raise HTTPException(400, msg("O início da prévia está depois do fim do áudio.", "The preview start is past the end of the audio."))
    res = _run(body.session_id, chain_mod.downmix(entry.data[start:stop]), fs, body.blocks, "auralization")
    buf = io.BytesIO()
    sf.write(buf, res.data.astype(np.float32), fs, format="WAV", subtype="FLOAT")
    return Response(buf.getvalue(), media_type="audio/wav",
                    headers={"X-Peak-Dbfs": f"{res.peak_dbfs:.2f}", "Access-Control-Expose-Headers": "X-Peak-Dbfs"})


@router.post("/render")
def render(body: RenderRequest):
    """Render the whole file; the result is a new stereo audio of the session, ready for Post-Processing."""
    entry = _entry(body.session_id, body.audio_id)
    res = _run(body.session_id, chain_mod.downmix(entry.data), entry.sample_rate, body.blocks, "auralization")
    tag = f"[aur {res.azimuth:+.0f}°]" if body.blocks.hrtf.enabled else "[aur]"
    new_entry = svc._derive(entry, res.data, tag, body.new_audio_id)
    new_entry.channels = 2
    new_entry.calibration_pa = None         # the pressure scale of the original recording does not carry over
    add_entry(body.session_id, new_entry)
    return {
        "audio_id": new_entry.audio_id,
        "name": new_entry.name,
        "sample_rate": new_entry.sample_rate,
        "channels": new_entry.channels,
        "duration_s": new_entry.duration_s,
        "peak_dbfs": round(res.peak_dbfs, 2),
        "azimuth": res.azimuth,
        "elevation": res.elevation,
        "notes": res.notes,
    }


@router.post("/response")
def response(body: ResponseRequest):
    """Magnitude of both ears and interaural delay for the chosen direction (for the plot)."""
    check_session_id(body.session_id)
    h = body.hrtf
    hset = assets.get_hrtf(body.session_id, h.asset, body.fs)
    if hset is None:
        raise HTTPException(400, msg("O conjunto de HRTF não está mais no servidor. Envie o arquivo SOFA de novo.",
                                     "The HRTF set is no longer on the server. Upload the SOFA file again."))
    hr, az, el = hrtf_mod.hrir_for(hset, h.azimuth, h.elevation, body.fs)
    freq, db = hrtf_mod.magnitude_db(hr, body.fs)
    return {
        "freq": np.round(freq, 2).tolist(),
        "left_db": np.round(db[0], 2).tolist(),
        "right_db": np.round(db[1], 2).tolist(),
        "itd_ms": round(hrtf_mod.itd_ms(hr, body.fs), 3),
        "azimuth": az,
        "elevation": el,
        "distance_gain_db": round(20 * np.log10(chain_mod.distance_gain(h.distance_m)), 2),
    }
