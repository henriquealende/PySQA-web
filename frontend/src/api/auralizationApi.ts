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

export interface HrtfAsset {
  asset_id: string
  name: string
  sample_rate: number
  n_directions: number
  n_taps: number
  radius_m: number
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
const blocks = (h: HrtfParams) => ({ hrtf: { enabled: true, ...h } })

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch(`${BASE}/catalog`)
  await checkResponse(res)
  return res.json()
}

export async function listAssets(sessionId: string): Promise<HrtfAsset[]> {
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/assets`, undefined, false)
  if (!res.ok) return []
  return res.json()
}

export async function uploadHrtf(sessionId: string, file: File): Promise<HrtfAsset> {
  const form = new FormData()
  form.append('session_id', sessionId)
  form.append('kind', 'hrtf')
  form.append('file', file)
  const res = await apiFetch(sessionId, `${BASE}/assets`, { method: 'POST', body: form }, false)
  await checkResponse(res)
  return res.json()
}

export async function deleteAsset(sessionId: string, assetId: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}/assets/${assetId}`, { method: 'DELETE' })
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
  sessionId: string, audioId: string, h: HrtfParams, t0: number, signal?: AbortSignal,
): Promise<{ url: string; peakDbfs: number }> {
  const res = await apiFetch(sessionId, `${BASE}/preview`, {
    method: 'POST', headers: json, signal,
    body: JSON.stringify({ session_id: sessionId, audio_id: audioId, blocks: blocks(h), t0 }),
  })
  await checkResponse(res)
  const peak = Number(res.headers.get('X-Peak-Dbfs'))
  const blob = await res.blob()
  return { url: URL.createObjectURL(blob), peakDbfs: Number.isFinite(peak) ? peak : -200 }
}

/**
 * Render the whole file into a new stereo audio of the session. The browser names the new file; for the built-in
 * model it also remembers the step so the file can be rebuilt after a server restart (an uploaded SOFA lives only in
 * the server's memory, so those results cannot be rebuilt).
 */
export async function renderToSession(sessionId: string, audioId: string, h: HrtfParams): Promise<RenderResult> {
  const body = { audio_id: audioId, blocks: blocks(h) }
  const res = await apiFetch(sessionId, `${BASE}/render`, {
    method: 'POST', headers: json,
    body: JSON.stringify({ ...body, session_id: sessionId, new_audio_id: newClientId() }),
  })
  await checkResponse(res)
  const result: RenderResult = await res.json()
  if (h.asset === SPHERE_ID) await recovery.recordDerived(sessionId, result, `${BASE}/render`, body, [audioId])
  return result
}
