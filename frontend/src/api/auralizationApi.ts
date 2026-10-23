import { AudioFile } from '../types'
import { apiFetch, checkResponse, newClientId } from './http'
import * as recovery from './recovery'

const BASE = '/api/auralization'

export const SPHERE_ID = 'builtin:sphere'

export interface HrtfParams {
  asset: string
  azimuth: number       // degrees, positive to the right of the listener
  elevation: number
  distance_m: number
}

export type EnvType = 'none' | 'rir' | 'brir'

export interface EnvParams {
  type: EnvType
  asset: string | null
  reverb_gain_db: number
}

export const NO_ENV: EnvParams = { type: 'none', asset: null, reverb_gain_db: 0 }

export type NoiseType = 'none' | 'white' | 'pink' | 'brown'

export interface NoiseParams {
  type: NoiseType
  snr_db: number
}

export const NO_NOISE: NoiseParams = { type: 'none', snr_db: 15 }

/** What the synthetic room needs: volume, source distance and the reverberation time of each octave band. */
export interface SynthParams {
  volume_m3: number
  distance_m: number
  rt60: Record<string, number>
}

export const BANDS = ['125', '250', '500', '1000', '2000', '4000'] as const

export interface Scene {
  id: 'kitchen' | 'living' | 'car' | 'aircraft'
  icon: string
  name: { pt: string; en: string }
  description: { pt: string; en: string }
  room: SynthParams
  hrtf: { azimuth: number; elevation: number; distance_m: number }
  noise: { type: NoiseType; snr_db: number } | null
}

/** A file the user uploaded: an HRTF set (SOFA) or a room response (WAV). */
export interface Asset {
  asset_id: string
  kind: 'hrtf' | 'rir'
  name: string
  sample_rate: number
  n_directions: number
  n_taps: number
  radius_m: number
  channels: number
  duration_s: number
  suggested_type: 'rir' | 'brir' | null
}

export interface RirInfo {
  channels: number
  sample_rate: number
  duration_s: number
  metrics: { rt60_t20: number | null; rt60_t30: number | null; edt: number | null; c50: number | null; c80: number | null; d50: number | null }
  bands: Record<string, number | null>
  decay: { t: number[]; db: number[] }
}

export interface CatalogDataset {
  id: string
  kind: 'hrtf' | 'headphone' | 'room'
  name: string
  license: string
  license_status: 'verified' | 'to_confirm' | 'per_item'
  ref: string
  url: string
  embedded: boolean
  note: string
}

export interface Catalog {
  builtin: { id: string; kind: string; name: string; description: { pt: string; en: string }; license: string }[]
  datasets: CatalogDataset[]
  scenes: Scene[]
  scenes_note: { pt: string; en: string }
}

export interface HrtfResponse {
  freq: number[]
  left_db: number[]
  right_db: number[]
  itd_ms: number
  azimuth: number
  elevation: number
  distance_gain_db: number
}

export interface RenderResult extends AudioFile {
  peak_dbfs: number
  azimuth: number
  elevation: number
  notes: string[]
}

const json = { 'Content-Type': 'application/json' }
const blocks = (h: HrtfParams, env: EnvParams, noise: NoiseParams) => ({
  hrtf: { enabled: env.type !== 'brir', ...h },
  environment: env,
  noise,
})

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch(`${BASE}/catalog`)
  await checkResponse(res)
  return res.json()
}

export async function listAssets(sessionId: string): Promise<Asset[]> {
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/assets`, undefined, false)
  if (!res.ok) return []
  return res.json()
}

async function upload(sessionId: string, kind: 'hrtf' | 'rir', file: File): Promise<Asset> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('kind', kind)
  form.append('file', file)
  const res = await apiFetch(sessionId, `${BASE}/assets`, { method: 'POST', body: form }, false)
  await checkResponse(res)
  return res.json()
}

export const uploadHrtf = (sessionId: string, file: File) => upload(sessionId, 'hrtf', file)
export const uploadRir = (sessionId: string, file: File) => upload(sessionId, 'rir', file)

export async function deleteAsset(sessionId: string, assetId: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}/assets/${assetId}`, { method: 'DELETE' })
}

/** A synthetic room response; the server returns it as an uploaded file (kind rir). */
export async function synthesizeRoom(sessionId: string, name: string, fs: number, p: SynthParams): Promise<Asset> {
  const res = await fetch(`${BASE}/rir/synth`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ session_id: sessionId, name, fs, ...p }),
  })
  await checkResponse(res)
  return res.json()
}

/** Preview with a synthetic room that is not kept on the server (the comparison demo of the Auralize Salas card). */
export async function fetchRoomPreview(
  sessionId: string, audioId: string, room: SynthParams, signal?: AbortSignal,
): Promise<string> {
  const res = await apiFetch(sessionId, `${BASE}/preview`, {
    method: 'POST', headers: json, signal,
    body: JSON.stringify({
      session_id: sessionId, audio_id: audioId, t0: 0,
      blocks: { hrtf: { enabled: true, asset: SPHERE_ID, azimuth: 20, elevation: 0, distance_m: 1 }, environment: { synth: room }, noise: NO_NOISE },
    }),
  })
  await checkResponse(res)
  return URL.createObjectURL(await res.blob())
}

export async function fetchRirInfo(sessionId: string, assetId: string, signal?: AbortSignal): Promise<RirInfo> {
  const res = await fetch(`${BASE}/${sessionId}/assets/${assetId}/info`, { signal })
  await checkResponse(res)
  return res.json()
}

export async function fetchHrtfResponse(sessionId: string, h: HrtfParams, fs: number, signal?: AbortSignal): Promise<HrtfResponse> {
  const res = await fetch(`${BASE}/response`, {
    method: 'POST', headers: json, signal,
    body: JSON.stringify({ session_id: sessionId, hrtf: h, fs }),
  })
  await checkResponse(res)
  return res.json()
}

/** A short stretch of the result, ready to play. The caller owns the object URL (revoke it when done). */
export async function fetchPreview(
  sessionId: string, audioId: string, h: HrtfParams, env: EnvParams, noise: NoiseParams, t0: number, signal?: AbortSignal,
): Promise<{ url: string; peakDbfs: number }> {
  const res = await apiFetch(sessionId, `${BASE}/preview`, {
    method: 'POST', headers: json, signal,
    body: JSON.stringify({ session_id: sessionId, audio_id: audioId, blocks: blocks(h, env, noise), t0 }),
  })
  await checkResponse(res)
  const peak = Number(res.headers.get('X-Peak-Dbfs'))
  const blob = await res.blob()
  return { url: URL.createObjectURL(blob), peakDbfs: Number.isFinite(peak) ? peak : -200 }
}

/**
 * Render the whole file into a new stereo audio of the session. The browser names the new file; when nothing from the
 * server's memory is needed (the built-in head model and no room response) it also remembers the step so the file can
 * be rebuilt after a server restart. Uploaded SOFA and room files live only in the server's memory, so results made
 * with them cannot be rebuilt.
 */
export async function renderToSession(sessionId: string, audioId: string, h: HrtfParams, env: EnvParams, noise: NoiseParams): Promise<RenderResult> {
  const body = { audio_id: audioId, blocks: blocks(h, env, noise) }
  const res = await apiFetch(sessionId, `${BASE}/render`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ ...body, session_id: sessionId, new_audio_id: newClientId() }),
  })
  await checkResponse(res)
  const result: RenderResult = await res.json()
  if (h.asset === SPHERE_ID && env.type === 'none') await recovery.recordDerived(sessionId, result, `${BASE}/render`, body, [audioId])
  return result
}
