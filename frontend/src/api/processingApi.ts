import { AudioFile } from '../types'
import { apiFetch, checkResponse, newClientId } from './http'
import * as recovery from './recovery'

const BASE = '/api/processing'

/**
 * Apply a processing step. The browser names the new file and remembers the step, so the
 * file can be rebuilt (same id, same result) if the server forgets the session.
 */
async function post(sessionId: string, path: string, body: Record<string, unknown>, parents: string[]): Promise<AudioFile> {
  const res = await apiFetch(sessionId, path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, session_id: sessionId, new_audio_id: newClientId() }),
  })
  await checkResponse(res)
  const result: AudioFile = await res.json()
  await recovery.recordDerived(sessionId, result, path, body, parents)
  return result
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
  return post(sessionId, `${BASE}/filter`, {
    audio_id: audioId,
    filter_type: filterType,
    cutoff: cutoff ?? null,
    method,
    fundamental: fundamental ?? null,
    q_factor: qFactor,
    octave_gains_db: octaveGainsDb ?? null,
  }, [audioId])
}

/** The sections of a filter, to hear it while its settings are changed (see useLiveFilter). */
export async function fetchFilterSos(
  sessionId: string, audioId: string,
  p: { filterType: string; cutoff?: number | [number, number]; method: string; fundamental?: number; qFactor: number },
  signal?: AbortSignal,
): Promise<{ sos: number[][]; passes: number }> {
  const res = await apiFetch(sessionId, `${BASE}/filter-sos`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      session_id: sessionId, audio_id: audioId, filter_type: p.filterType, cutoff: p.cutoff ?? null,
      method: p.method, fundamental: p.fundamental ?? null, q_factor: p.qFactor,
    }),
  })
  await checkResponse(res)
  return res.json()
}

export async function applyWindow(
  sessionId: string, audioId: string,
  startSample: number, endSample: number,
  windowType: string,
): Promise<AudioFile> {
  return post(sessionId, `${BASE}/window`, {
    audio_id: audioId,
    start_sample: startSample, end_sample: endSample,
    window_type: windowType,
  }, [audioId])
}

export async function applyWeighting(
  sessionId: string, audioId: string,
  curve: string,
): Promise<AudioFile> {
  return post(sessionId, `${BASE}/weighting`, { audio_id: audioId, curve }, [audioId])
}

export async function applyLoudnessAdj(
  sessionId: string, audioId: string,
  referenceAudioId: string,
): Promise<AudioFile> {
  return post(sessionId, `${BASE}/loudness_adj`, {
    audio_id: audioId,
    reference_audio_id: referenceAudioId,
  }, [audioId, referenceAudioId])
}
