import { AudioFile } from '../types'

const BASE = '/api/processing'

async function post(url: string, body: object): Promise<AudioFile> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export async function applyFilter(
  sessionId: string, audioId: string,
  filterType: string,
  cutoff?: number | [number, number],
  method = 'Butterworth',
  fundamental?: number,
  qFactor = 30,
  octaveGainsDb?: number[],
): Promise<AudioFile> {
  return post(`${BASE}/filter`, {
    session_id: sessionId, audio_id: audioId,
    filter_type: filterType,
    cutoff: cutoff ?? null,
    method,
    fundamental: fundamental ?? null,
    q_factor: qFactor,
    octave_gains_db: octaveGainsDb ?? null,
  })
}

export async function applyWindow(
  sessionId: string, audioId: string,
  startSample: number, endSample: number,
  windowType: string,
): Promise<AudioFile> {
  return post(`${BASE}/window`, {
    session_id: sessionId, audio_id: audioId,
    start_sample: startSample, end_sample: endSample,
    window_type: windowType,
  })
}

export async function applyWeighting(
  sessionId: string, audioId: string,
  curve: string,
): Promise<AudioFile> {
  return post(`${BASE}/weighting`, {
    session_id: sessionId, audio_id: audioId, curve,
  })
}

export async function applyLoudnessAdj(
  sessionId: string, audioId: string,
  referenceAudioId: string,
): Promise<AudioFile> {
  return post(`${BASE}/loudness_adj`, {
    session_id: sessionId, audio_id: audioId,
    reference_audio_id: referenceAudioId,
  })
}
