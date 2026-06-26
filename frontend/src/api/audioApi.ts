import { AudioFile, WaveformData, SpectrumData, SpectrogramData, OctaveData, EnvelopeData, MetricResult, MetricKey, SpectrogramParams, EnvelopeParams, FieldType } from '../types'

export class SessionExpiredError extends Error {
  constructor() { super('Session expired — please re-upload your files.') }
}

async function checkResponse(res: Response): Promise<Response> {
  if (res.status === 404) throw new SessionExpiredError()
  if (!res.ok) throw new Error(await res.text())
  return res
}

const BASE = '/api/audio'

export async function uploadFiles(sessionId: string, files: File[]): Promise<AudioFile[]> {
  const form = new FormData()
  form.append('session_id', sessionId)
  files.forEach((f) => form.append('files', f))
  const res = await fetch(`${BASE}/upload`, { method: 'POST', body: form })
  await checkResponse(res)
  return res.json()
}

export async function deleteAudio(sessionId: string, audioId: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}/${audioId}`, { method: 'DELETE' })
}

export function getStreamUrl(sessionId: string, audioId: string): string {
  return `${BASE}/${sessionId}/${audioId}/stream`
}

export async function fetchWaveform(sessionId: string, audioId: string): Promise<WaveformData> {
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/waveform`)
  await checkResponse(res)
  return res.json()
}

export async function fetchSpectrum(sessionId: string, audioId: string): Promise<SpectrumData> {
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/spectrum`)
  await checkResponse(res)
  return res.json()
}

export async function fetchSpectrogram(
  sessionId: string,
  audioId: string,
  params?: Partial<SpectrogramParams>,
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
  const qs = q.toString()
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/spectrogram${qs ? '?' + qs : ''}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchOctave(
  sessionId: string,
  audioId: string,
  weighting = 'Z',
): Promise<OctaveData> {
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/octave?weighting=${weighting}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchEnvelope(
  sessionId: string,
  audioId: string,
  params?: Partial<EnvelopeParams>,
): Promise<EnvelopeData> {
  const q = new URLSearchParams()
  if (params?.smoothing_ms != null) q.set('smoothing_ms', String(params.smoothing_ms))
  if (params?.lpf_hz       != null) q.set('lpf_hz',       String(params.lpf_hz))
  const qs = q.toString()
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/envelope${qs ? '?' + qs : ''}`)
  await checkResponse(res)
  return res.json()
}

export async function fetchMetric(
  sessionId: string,
  audioId: string,
  metricKey: MetricKey,
  fieldType: FieldType = 'free',
): Promise<MetricResult> {
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/metrics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ metric_key: metricKey, field_type: fieldType }),
  })
  await checkResponse(res)
  return res.json()
}

export async function fetchBatch(
  sessionId: string,
  audioIds: string[],
  metricKeys: MetricKey[],
  fieldType: FieldType = 'free',
): Promise<{ rows: any[]; metric_keys: string[] }> {
  const res = await fetch(`${BASE}/${sessionId}/batch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ audio_ids: audioIds, metric_keys: metricKeys, field_type: fieldType }),
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
  const res = await fetch(`${BASE}/${sessionId}/${audioId}/calibrate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sensitivity_mv_pa: sensitivityMvPa, fs_voltage: fsVoltage }),
  })
  await checkResponse(res)
  return res.json()
}

export async function clearCalibration(sessionId: string, audioId: string): Promise<void> {
  await fetch(`${BASE}/${sessionId}/${audioId}/calibrate`, { method: 'DELETE' })
}
