"""Audio Preparation router (internal name: auralization): prepare listening-test stimuli.

Phase 1: HRTF positioning. Phase 2: room response (RIR or BRIR) with its acoustic parameters.
"""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import List, Literal, Optional

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

import services.audio_service as svc
from auralization import assets, chain as chain_mod, hrtf as hrtf_mod, rir as rir_mod
from auralization.rir import RirError, read_rir
from auralization.sofa_io import HrtfSet, SofaError, read_sofa
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


class EnvironmentBlock(BaseModel):
    type: Literal["none", "rir", "brir"] = "none"
    asset: Optional[str] = None
    reverb_gain_db: float = Field(0.0, ge=-40, le=20)


class Blocks(BaseModel):
    hrtf: HrtfBlock = HrtfBlock()
    environment: EnvironmentBlock = EnvironmentBlock()


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
    kind: Literal["hrtf", "rir"] = "hrtf"
    name: str
    sample_rate: float
    # HRTF
    n_directions: int = 0
    n_taps: int = 0
    radius_m: float = 0.0
    # room response
    channels: int = 0
    duration_s: float = 0.0
    suggested_type: Optional[str] = None      # "rir" (1 channel) or "brir" (2 channels)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _entry(session_id: str, audio_id: str):
    check_session_id(session_id)
    e = get_entry(session_id, audio_id)
    if not e:
        raise HTTPException(404, msg("Áudio não encontrado", "Audio not found"))
    return e


def _chain(blocks: Blocks) -> chain_mod.Chain:
    h, e = blocks.hrtf, blocks.environment
    return chain_mod.Chain(
        hrtf=chain_mod.HrtfStep(enabled=h.enabled, asset=h.asset, azimuth=h.azimuth, elevation=h.elevation, distance_m=h.distance_m),
        environment=chain_mod.EnvironmentStep(type=e.type, asset=e.asset, reverb_gain_db=e.reverb_gain_db),
    )


def _run(session_id: str, mono: np.ndarray, fs: int, blocks: Blocks, kind: str) -> chain_mod.RenderResult:
    try:
        with limits.heavy_slot(kind=kind):
            return chain_mod.render(
                mono, fs, _chain(blocks),
                lambda aid: assets.get_hrtf(session_id, aid, fs),
                lambda aid: assets.get_rir(session_id, aid),
            )
    except chain_mod.ChainError as exc:
        raise HTTPException(400, str(exc))


def _meta(asset_id: str, a) -> AssetMeta:
    if isinstance(a, HrtfSet):
        return AssetMeta(asset_id=asset_id, kind="hrtf", name=a.name, sample_rate=a.fs, n_directions=a.n_dirs,
                         n_taps=a.n_taps, radius_m=a.radius_m)
    return AssetMeta(asset_id=asset_id, kind="rir", name=a.name, sample_rate=a.fs, channels=a.channels,
                     duration_s=round(a.duration_s, 3), suggested_type="brir" if a.channels == 2 else "rir")


async def _read_upload(file: UploadFile, name: str) -> bytes:
    buf = bytearray()
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        buf += chunk
        limits.check_upload_size(name, len(buf))
    return bytes(buf)


# ── Catalogue and assets ──────────────────────────────────────────────────────

@router.get("/catalog")
def catalog():
    """Built-in items and the open datasets with their licence status (what may be embedded, what needs upload)."""
    return _CATALOG


@router.post("/assets", response_model=AssetMeta)
async def upload_asset(session_id: str = Form(...), kind: str = Form("hrtf"), file: UploadFile = File(...)):
    check_session_id(session_id)
    name = file.filename or "file"
    if kind == "hrtf":
        if not name.lower().endswith(".sofa"):
            raise HTTPException(400, msg(f"{name} não é um arquivo .sofa", f"{name} is not a .sofa file"))
        data = await _read_upload(file, name)
        try:
            asset = read_sofa(data, name)
        except SofaError as exc:
            raise HTTPException(400, str(exc))
    elif kind == "rir":
        if not name.lower().endswith(".wav"):
            raise HTTPException(400, msg(f"{name} não é um arquivo .wav", f"{name} is not a .wav file"))
        data = await _read_upload(file, name)
        try:
            asset = read_rir(data, name)
        except RirError as exc:
            raise HTTPException(400, str(exc))
    else:
        raise HTTPException(400, msg("Tipo de arquivo desconhecido.", "Unknown file kind."))
    return _meta(assets.add(session_id, asset), asset)


@router.get("/{session_id}/assets", response_model=List[AssetMeta])
def list_assets(session_id: str):
    check_session_id(session_id)
    return [_meta(aid, a) for aid, a in assets.list_all(session_id)]


@router.get("/{session_id}/assets/{asset_id}/info")
def asset_info(session_id: str, asset_id: str):
    """Acoustic parameters, octave-band reverberation times and the decay curve of a room response."""
    check_session_id(session_id)
    a = assets.get(session_id, asset_id)
    if a is None:
        raise HTTPException(404, msg("Arquivo não encontrado", "File not found"))
    if not isinstance(a, rir_mod.RirSet):
        raise HTTPException(400, msg("Este arquivo não é uma resposta de ambiente.", "This file is not a room response."))
    return rir_mod.info(a)


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


def _tag(blocks: Blocks, res: chain_mod.RenderResult) -> str:
    env, h = blocks.environment, blocks.hrtf
    parts = ["prep"]
    if env.type == "rir":
        parts.append("sala")
    elif env.type == "brir":
        parts.append("BRIR")
    if h.enabled and env.type != "brir":
        parts.append(f"{res.azimuth:+.0f}°")
    return "[" + " ".join(parts) + "]"


@router.post("/render")
def render(body: RenderRequest):
    """Render the whole file; the result is a new stereo audio of the session, ready for Post-Processing."""
    entry = _entry(body.session_id, body.audio_id)
    res = _run(body.session_id, chain_mod.downmix(entry.data), entry.sample_rate, body.blocks, "auralization")
    new_entry = svc._derive(entry, res.data, _tag(body.blocks, res), body.new_audio_id)
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
