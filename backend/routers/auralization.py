"""Audio Preparation router (internal name: auralization): prepare listening-test stimuli.

Phase 1: HRTF positioning. Phase 2: room response (RIR or BRIR) with its acoustic parameters.
"""
from __future__ import annotations

import io
import json
from pathlib import Path
from typing import Dict, List, Literal, Optional

import numpy as np
import soundfile as sf
from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field

import services.audio_service as svc
from auralization import assets, chain as chain_mod, headphone as hp_mod, hrtf as hrtf_mod, level as level_mod, noise as noise_mod, rir as rir_mod, rir_synth
from auralization.rir import RirError, read_rir
from auralization.sofa_io import HrtfSet, SofaError, read_sofa
from services.session_store import add_entry, check_session_id, get_entry
from utils import limits
from utils.lang import msg

router = APIRouter()

_CATALOG = json.loads((Path(__file__).parent.parent / "auralization" / "catalog.json").read_text(encoding="utf-8"))
_PREVIEW_MAX_S = 12.0
_INLINE_ID = "inline:synth"


# ── Schemas ───────────────────────────────────────────────────────────────────

class HrtfBlock(BaseModel):
    enabled: bool = True
    asset: str = hrtf_mod.SPHERE_ID
    azimuth: float = Field(0.0, ge=-360, le=360)       # degrees, positive to the right
    elevation: float = Field(0.0, ge=-90, le=90)
    distance_m: float = Field(1.0, ge=0.1, le=100)


class InlineSynth(BaseModel):
    """A synthetic room used for one call only (not stored): the comparison demo in the Auralize Salas card."""
    volume_m3: float = Field(30.0, ge=0.5, le=5000)
    distance_m: float = Field(2.0, ge=0.1, le=50)
    rt60: Dict[str, float]


class EnvironmentBlock(BaseModel):
    type: Literal["none", "rir", "brir"] = "none"
    asset: Optional[str] = None
    reverb_gain_db: float = Field(0.0, ge=-40, le=20)
    synth: Optional[InlineSynth] = None             # when given, it replaces `asset` (type is taken as "rir")


class NoiseBlock(BaseModel):
    type: Literal["none", "white", "pink", "brown"] = "none"
    snr_db: float = Field(15.0, ge=-20, le=60)


class HeadphoneBlock(BaseModel):
    mode: Literal["off", "compensate", "simulate"] = "off"
    asset: Optional[str] = None
    max_boost_db: float = Field(12.0, ge=0, le=24)


class LevelBlock(BaseModel):
    mode: Literal["off", "spl", "source"] = "off"
    target_db_spl: float = Field(60.0, ge=0, le=140)
    fs_db_spl: float = Field(100.0, ge=40, le=160)       # SPL at the ear of a full-scale sine on the user's equipment
    weighting: Literal["A", "Z"] = "A"


class Blocks(BaseModel):
    hrtf: HrtfBlock = HrtfBlock()
    environment: EnvironmentBlock = EnvironmentBlock()
    noise: NoiseBlock = NoiseBlock()
    headphone: HeadphoneBlock = HeadphoneBlock()
    level: LevelBlock = LevelBlock()


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


class SynthRequest(BaseModel):
    session_id: str
    name: str = Field("Sala sintética", max_length=60)
    fs: int = Field(48000, ge=8000, le=192000)
    volume_m3: float = Field(30.0, ge=0.5, le=5000)
    distance_m: float = Field(2.0, ge=0.1, le=50)
    rt60: Dict[str, float]                      # octave band (Hz, as text) -> seconds
    seed: int = 1234


class AssetMeta(BaseModel):
    asset_id: str
    kind: Literal["hrtf", "rir", "headphone"] = "hrtf"
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
    # headphone response
    n_points: int = 0
    f_min: float = 0.0
    f_max: float = 0.0


# ── Helpers ───────────────────────────────────────────────────────────────────

def _entry(session_id: str, audio_id: str):
    check_session_id(session_id)
    e = get_entry(session_id, audio_id)
    if not e:
        raise HTTPException(404, msg("Áudio não encontrado", "Audio not found"))
    return e


def _parse_rt60(raw: Dict[str, float]) -> Dict[int, float]:
    times: Dict[int, float] = {}
    for k, v in raw.items():
        try:
            band = int(k)
        except ValueError:
            raise HTTPException(400, msg("As bandas do tempo de reverberação são números (125, 250, ... 4000).", "The reverberation-time bands are numbers (125, 250, ... 4000)."))
        if band not in rir_mod.BANDS_HZ or not (0.02 <= v <= 6.0):
            raise HTTPException(400, msg("Use as bandas 125 a 4000 Hz e tempos entre 0,02 e 6 s.", "Use the bands 125 to 4000 Hz and times between 0.02 and 6 s."))
        times[band] = float(v)
    if not times:
        raise HTTPException(400, msg("Informe ao menos um tempo de reverberação.", "Give at least one reverberation time."))
    return times


def _chain(blocks: Blocks) -> chain_mod.Chain:
    h, e, nz = blocks.hrtf, blocks.environment, blocks.noise
    inline = e.synth is not None
    return chain_mod.Chain(
        hrtf=chain_mod.HrtfStep(enabled=h.enabled, asset=h.asset, azimuth=h.azimuth, elevation=h.elevation, distance_m=h.distance_m),
        environment=chain_mod.EnvironmentStep(type="rir" if inline else e.type, asset=_INLINE_ID if inline else e.asset, reverb_gain_db=e.reverb_gain_db),
        noise=chain_mod.NoiseStep(type=nz.type, snr_db=nz.snr_db),
        headphone=chain_mod.HeadphoneStep(mode=blocks.headphone.mode, asset=blocks.headphone.asset, max_boost_db=blocks.headphone.max_boost_db),
        level=chain_mod.LevelStep(mode=blocks.level.mode, target_db_spl=blocks.level.target_db_spl, fs_db_spl=blocks.level.fs_db_spl, weighting=blocks.level.weighting),
    )


def _run(session_id: str, mono: np.ndarray, fs: int, blocks: Blocks, kind: str, calibration_pa: Optional[float] = None) -> chain_mod.RenderResult:
    inline = None
    if blocks.environment.synth is not None:
        s = blocks.environment.synth
        inline = rir_synth.synth_rirset("inline", fs, _parse_rt60(s.rt60), s.volume_m3, s.distance_m)
    try:
        with limits.heavy_slot(kind=kind):
            source_spl = None
            if blocks.level.mode == "source" and calibration_pa:
                source_spl = level_mod.calibrated_spl_db(mono, fs, calibration_pa, blocks.level.weighting)
            return chain_mod.render(
                mono, fs, _chain(blocks),
                lambda aid: assets.get_hrtf(session_id, aid, fs),
                lambda aid: inline if (inline is not None and aid == _INLINE_ID) else assets.get_rir(session_id, aid),
                lambda aid: assets.get_headphone(session_id, aid),
                source_spl,
            )
    except chain_mod.ChainError as exc:
        raise HTTPException(400, str(exc))


def _meta(asset_id: str, a) -> AssetMeta:
    if isinstance(a, HrtfSet):
        return AssetMeta(asset_id=asset_id, kind="hrtf", name=a.name, sample_rate=a.fs, n_directions=a.n_dirs,
                         n_taps=a.n_taps, radius_m=a.radius_m)
    if isinstance(a, hp_mod.HeadphoneSet):
        return AssetMeta(asset_id=asset_id, kind="headphone", name=a.name, sample_rate=0.0, n_points=a.n_points,
                         f_min=float(a.freq[0]), f_max=float(a.freq[-1]))
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
    elif kind == "headphone":
        if not name.lower().endswith((".csv", ".txt")):
            raise HTTPException(400, msg(f"{name} não é um arquivo .csv ou .txt", f"{name} is not a .csv or .txt file"))
        data = await _read_upload(file, name)
        try:
            asset = hp_mod.read_headphone_csv(data, name)
        except hp_mod.HeadphoneError as exc:
            raise HTTPException(400, str(exc))
    else:
        raise HTTPException(400, msg("Tipo de arquivo desconhecido.", "Unknown file kind."))
    return _meta(assets.add(session_id, asset), asset)


@router.post("/rir/synth", response_model=AssetMeta)
def synthesize_room(body: SynthRequest):
    """A synthetic room response from reverberation times per octave band, room volume and source distance."""
    check_session_id(body.session_id)
    times = _parse_rt60(body.rt60)
    with limits.heavy_slot(kind="auralization"):
        asset = rir_synth.synth_rirset(body.name, body.fs, times, body.volume_m3, body.distance_m, body.seed)
    return _meta(assets.add(body.session_id, asset), asset)


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
    res = _run(body.session_id, chain_mod.downmix(entry.data[start:stop]), fs, body.blocks, "auralization", entry.calibration_pa)
    buf = io.BytesIO()
    sf.write(buf, res.data.astype(np.float32), fs, format="WAV", subtype="FLOAT")
    headers = {"X-Peak-Dbfs": f"{res.peak_dbfs:.2f}", "Access-Control-Expose-Headers": "X-Peak-Dbfs, X-Gain-Db"}
    if res.gain_db is not None:
        headers["X-Gain-Db"] = f"{res.gain_db:.2f}"
    return Response(buf.getvalue(), media_type="audio/wav", headers=headers)


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
    res = _run(body.session_id, chain_mod.downmix(entry.data), entry.sample_rate, body.blocks, "auralization", entry.calibration_pa)
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
        "gain_db": None if res.gain_db is None else round(res.gain_db, 2),
        "level_db_spl": None if res.level_db_spl is None else round(res.level_db_spl, 1),
        "azimuth": res.azimuth,
        "elevation": res.elevation,
        "notes": res.notes,
    }


class HeadphoneResponseRequest(BaseModel):
    session_id: str
    asset: str
    mode: Literal["compensate", "simulate"] = "compensate"
    max_boost_db: float = Field(12.0, ge=0, le=24)
    fs: int = 48000


@router.post("/headphone/response")
def headphone_response(body: HeadphoneResponseRequest):
    """Measured response (levelled), the correction asked for and what the FIR really does, for the plot."""
    check_session_id(body.session_id)
    hp = assets.get_headphone(body.session_id, body.asset)
    if hp is None:
        raise HTTPException(400, msg("A resposta do fone não está mais no servidor. Envie o arquivo de novo.", "The headphone response is no longer on the server. Upload the file again."))
    freq, measured, corr = hp_mod.correction_db(hp, body.fs, body.mode, body.max_boost_db)
    fir = hp_mod.min_phase_fir(freq, corr, body.fs)
    return {
        "freq": np.round(freq, 2).tolist(),
        "measured_db": np.round(measured, 2).tolist(),
        "target_db": np.round(corr, 2).tolist(),
        "filter_db": np.round(hp_mod.response_db(fir, body.fs, freq), 2).tolist(),
        "result_db": np.round(measured + hp_mod.response_db(fir, body.fs, freq), 2).tolist() if body.mode == "compensate" else None,
        "max_boost_db": body.max_boost_db,
    }


@router.post("/noise/spectrum")
def noise_spectrum(body: RenderRequest):
    """1/3-octave levels of the signal (room and head applied, before the noise) and of each noise colour at the chosen SNR."""
    entry = _entry(body.session_id, body.audio_id)
    fs = entry.sample_rate
    start = int(max(0.0, body.t0 or 0.0) * fs)
    stop = min(entry.data.shape[0], start + int(_PREVIEW_MAX_S * fs))
    if stop <= start:
        raise HTTPException(400, msg("O início está depois do fim do áudio.", "The start is past the end of the audio."))
    dry = Blocks(hrtf=body.blocks.hrtf, environment=body.blocks.environment)       # no noise, headphone or level: the bare signal
    res = _run(body.session_id, chain_mod.downmix(entry.data[start:stop]), fs, dry, "auralization", entry.calibration_pa)
    centres, sig = noise_mod.third_octave_levels(res.data, fs)
    snr = body.blocks.noise.snr_db
    noises = {}
    for color in noise_mod.COLORS:
        comp = noise_mod.noise_component(res.data, fs, color, snr)
        noises[color] = np.round(noise_mod.third_octave_levels(comp, fs)[1], 2).tolist()
    return {
        "freq": centres.tolist(),
        "signal_db": np.round(sig, 2).tolist(),
        "noises": noises,
        "selected": body.blocks.noise.type,
        "snr_db": snr,
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
