import { AudioFile, WaveformData, SpectrumData, SpectrogramData, OctaveData, EnvelopeData, MetricResult, MetricKey, Section, SpectrogramParams, EnvelopeParams, FieldType } from '../types'
import { apiFetch, checkResponse, newClientId, SessionExpiredError, watched } from './http'
import * as recovery from './recovery'

export { SessionExpiredError }

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
  await recovery.recordDelete(sessionId, audioId)
}

export function getStreamUrl(sessionId: string, audioId: string): string {
  return `${BASE}/${sessionId}/${audioId}/stream`
}

export async function fetchWaveform(sessionId: string, audioId: string): Promise<WaveformData> {
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/waveform`)
  await checkResponse(res)
  return res.json()
}

/** `t0` and `t1` (seconds) ask the server to analyse only that part of the file; nothing means the whole file. */
function withSection(q: URLSearchParams, section?: Section | null): URLSearchParams {
  if (section) { q.set('t0', String(section[0])); q.set('t1', String(section[1])) }
  return q
}

export async function fetchSpectrum(sessionId: string, audioId: string, section?: Section | null): Promise<SpectrumData> {
  const qs = withSection(new URLSearchParams(), section).toString()
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/spectrum${qs ? '?' + qs : ''}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchSpectrogram(
  sessionId: string,
  audioId: string,
  params?: Partial<SpectrogramParams>,
  section?: Section | null,
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
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/spectrogram${qs ? '?' + qs : ''}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchOctave(
  sessionId: string,
  audioId: string,
  weighting = 'Z',
  section?: Section | null,
): Promise<OctaveData> {
  const qs = withSection(new URLSearchParams({ weighting }), section).toString()
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/octave?${qs}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchEnvelope(
  sessionId: string,
  audioId: string,
  params?: Partial<EnvelopeParams>,
  section?: Section | null,
): Promise<EnvelopeData> {
  const q = new URLSearchParams()
  if (params?.smoothing_ms != null) q.set('smoothing_ms', String(params.smoothing_ms))
  if (params?.lpf_hz       != null) q.set('lpf_hz',       String(params.lpf_hz))
  const qs = withSection(q, section).toString()
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/envelope${qs ? '?' + qs : ''}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchMetric(
  sessionId: string,
  audioId: string,
  metricKey: MetricKey,
  fieldType: FieldType = 'free',
  section?: Section | null,
): Promise<MetricResult> {
  const res = await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metric_key: metricKey, field_type: fieldType, ...(section ? { t0: section[0], t1: section[1] } : {}) }),
  })
  await checkResponse(res)
  return res.json()
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
  await recovery.recordCalibration(sessionId, audioId, { sensitivityMvPa, fsVoltage })
  return res.json()
}

export async function clearCalibration(sessionId: string, audioId: string): Promise<void> {
  await apiFetch(sessionId, `${BASE}/${sessionId}/${audioId}/calibrate`, { method: 'DELETE' })
  await recovery.recordCalibration(sessionId, audioId, null)
}
