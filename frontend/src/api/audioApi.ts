import { AudioFile, WaveformData, SpectrumData, SpectrogramData, OctaveData, EnvelopeData, MetricResult, MetricKey, Section, ServerLoad, SpectrogramParams, EnvelopeParams, FieldType } from '../types'
import { apiFetch, checkResponse, newClientId, SessionExpiredError, watched } from './http'
import * as recovery from './recovery'
import { cachedFetch, invalidateAudio } from './viewCache'

export { SessionExpiredError }
export { isAbort } from './viewCache'

const BASE = '/api/audio'

export async function uploadFiles(sessionId: string, files: File[]): Promise<AudioFile[]> {
  const ids = files.map(() => newClientId())      // the browser names what it uploads, so a restore can reuse the ids
  const form = new FormData()
  form.append('session_id', sessionId)
  ids.forEach((id) => form.append('audio_ids', id))
  files.forEach((f) => form.append('files', f))
  const res = await apiFetch(sessionId, `${BASE}/upload`, { method: 'POST', body: form }, false)
  await checkResponse(res)
  const uploaded: AudioFile[] = await res.json()
  // Keep a copy in this browser so the file can be put back if the server forgets it
  await Promise.all(uploaded.map((u, i) => recovery.recordUpload(sessionId, u, files[i])))
  return uploaded
}

export async function deleteAudio(sessionId: string, audioId: string): Promise<void> {
  await watched(() => fetch(`${BASE}/${sessionId}/${audioId}`, { method: 'DELETE' }))
  invalidateAudio(audioId)
  await recovery.recordDelete(sessionId, audioId)
}

export function getStreamUrl(sessionId: string, audioId: string): string {
  return `${BASE}/${sessionId}/${audioId}/stream`
}

// ── Analysis results ──────────────────────────────────────────────────────────
// Every call below keeps its answer in memory (see viewCache), accepts an AbortSignal, and the server
// analyses only [t0, t1] seconds when a section is given (nothing means the whole file).

async function readJson<T>(res: Response): Promise<{ data: T; size: number }> {
  await checkResponse(res)
  const text = await res.text()
  return { data: JSON.parse(text) as T, size: text.length * 2 }
}

const getJson = async <T>(sessionId: string, url: string, signal: AbortSignal) =>
  readJson<T>(await apiFetch(sessionId, url, { signal }))

const postJson = async <T>(sessionId: string, url: string, body: unknown, signal: AbortSignal) =>
  readJson<T>(await apiFetch(sessionId, url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  }))

function withSection(q: URLSearchParams, section?: Section | null): URLSearchParams {
  if (section) { q.set('t0', String(section[0])); q.set('t1', String(section[1])) }
  return q
}

const cacheKey = (sessionId: string, audioId: string, kind: string, detail = '') => `${sessionId}|${audioId}|${kind}|${detail}`

export function fetchWaveform(sessionId: string, audioId: string, signal?: AbortSignal): Promise<WaveformData> {
  return cachedFetch(audioId, cacheKey(sessionId, audioId, 'waveform'),
    (s) => getJson<WaveformData>(sessionId, `${BASE}/${sessionId}/${audioId}/waveform`, s), signal)
}

export function fetchSpectrum(sessionId: string, audioId: string, section?: Section | null, signal?: AbortSignal): Promise<SpectrumData> {
  const qs = withSection(new URLSearchParams(), section).toString()
  return cachedFetch(audioId, cacheKey(sessionId, audioId, 'spectrum', qs),
    (s) => getJson<SpectrumData>(sessionId, `${BASE}/${sessionId}/${audioId}/spectrum${qs ? '?' + qs : ''}`, s), signal)
}

export function fetchSpectrogram(
  sessionId: string,
  audioId: string,
  params?: Partial<SpectrogramParams>,
  section?: Section | null,
  signal?: AbortSignal,
): Promise<SpectrogramData> {
  const q = new URLSearchParams()
  if (params?.nfft      != null) q.set('nfft',       String(params.nfft))
  if (params?.overlap   != null) q.set('overlap',    String(params.overlap))
  if (params?.window    != null) q.set('window',     params.window)
  if (params?.kaiser_beta != null) q.set('kaiser_beta', String(params.kaiser_beta))
  if (params?.cmap      != null) q.set('cmap',       params.cmap)
  if (params?.freq_scale!= null) q.set('freq_scale', params.freq_scale)
  if (params?.fmax      != null) q.set('fmax',       String(params.fmax))
  if (params?.dyn_range != null) q.set('dyn_range',  String(params.dyn_range))
  const qs = withSection(q, section).toString()
  return cachedFetch(audioId, cacheKey(sessionId, audioId, 'spectrogram', qs),
    (s) => getJson<SpectrogramData>(sessionId, `${BASE}/${sessionId}/${audioId}/spectrogram${qs ? '?' + qs : ''}`, s), signal)
}

export function fetchOctave(
  sessionId: string,
  audioId: string,
  weighting = 'Z',
  section?: Section | null,
  signal?: AbortSignal,
): Promise<OctaveData> {
  const qs = withSection(new URLSearchParams({ weighting }), section).toString()
  return cachedFetch(audioId, cacheKey(sessionId, audioId, 'octave', qs),
    (s) => getJson<OctaveData>(sessionId, `${BASE}/${sessionId}/${audioId}/octave?${qs}`, s), signal)
}

export function fetchEnvelope(
  sessionId: string,
  audioId: string,
  params?: Partial<EnvelopeParams>,
  section?: Section | null,
  signal?: AbortSignal,
): Promise<EnvelopeData> {
  const q = new URLSearchParams()
  if (params?.smoothing_ms != null) q.set('smoothing_ms', String(params.smoothing_ms))
  if (params?.lpf_hz       != null) q.set('lpf_hz',       String(params.lpf_hz))
  const qs = withSection(q, section).toString()
  return cachedFetch(audioId, cacheKey(sessionId, audioId, 'envelope', qs),
    (s) => getJson<EnvelopeData>(sessionId, `${BASE}/${sessionId}/${audioId}/envelope${qs ? '?' + qs : ''}`, s), signal)
}

/**
 * A psychoacoustic metric. It can take a while on a small server: `job` names this request so that
 * /api/health tells where it is (running, or how many are ahead of it), and aborting the signal removes
 * it from the server's queue if it has not started yet.
 */
export function fetchMetric(
  sessionId: string,
  audioId: string,
  metricKey: MetricKey,
  fieldType: FieldType = 'free',
  section?: Section | null,
  opts?: { signal?: AbortSignal; job?: string },
): Promise<MetricResult> {
  const detail = `${metricKey}|${fieldType}|${section ? section.join('-') : ''}`
  return cachedFetch(audioId, cacheKey(sessionId, audioId, 'metric', detail),
    (s) => postJson<MetricResult>(sessionId, `${BASE}/${sessionId}/${audioId}/metrics`, {
      metric_key: metricKey, field_type: fieldType,
      ...(section ? { t0: section[0], t1: section[1] } : {}),
      ...(opts?.job ? { job: opts.job } : {}),
    }, s), opts?.signal)
}

/** What the server is doing and how long its calculations usually take (null if it cannot be reached). */
export async function fetchServerLoad(): Promise<ServerLoad | null> {
  try {
    const res = await fetch('/api/health', { cache: 'no-store' })
    if (!res.ok) return null
    const h = await res.json()
    return { heavy: h.limits?.heavy, timing_s_per_audio_s: h.limits?.timing_s_per_audio_s }
  } catch { return null }
}

export async function fetchBatch(
  sessionId: string,
  audioIds: string[],
  metricKeys: MetricKey[],
  fieldType: FieldType = 'free',
  sections?: Record<string, Section>,      // audio_id → the part of that file to use (files not listed use all of it)
): Promise<{
  rows: any[]
  metric_keys: string[]
  skipped?: { audio_id: string; name: string; metric: string; reason: string }[]
}> {
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_ids: audioIds, metric_keys: metricKeys, field_type: fieldType, ...(sections && Object.keys(sections).length ? { sections } : {}) }),
  })
  await checkResponse(res)
  return res.json()
}

export async function setCalibration(
  sessionId: string,
  audioId: string,
  sensitivityMvPa: number,
  fsVoltage = 1.0,
): Promise<{ calibration_pa: number }> {
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/calibrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensitivity_mv_pa: sensitivityMvPa, fs_voltage: fsVoltage }),
  })
  await checkResponse(res)
  invalidateAudio(audioId)                 // everything calculated for this file used the old calibration
  await recovery.recordCalibration(sessionId, audioId, { sensitivityMvPa, fsVoltage })
  return res.json()
}

export async function clearCalibration(sessionId: string, audioId: string): Promise<void> {
  await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/calibrate`, { method: 'DELETE' })
  invalidateAudio(audioId)
  await recovery.recordCalibration(sessionId, audioId, null)
}
