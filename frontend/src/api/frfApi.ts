import { errorText } from './errors'

const BASE = '/api/frf'

export interface FrfChannel {
  id: string
  name: string
  file: string
  kind: 'time' | 'frf'
  n: number
  unit: string
  fs?: number
  duration_s?: number
  f_min?: number
  f_max?: number
}

export type Estimator = 'H1' | 'H2' | 'HV'
export type Averaging = 'welch' | 'impact'
export type RespType = 'none' | 'acceleration' | 'velocity' | 'displacement'
export type ModeMethod = 'half_power' | 'fit' | 'both'

export interface FrfParams {
  estimator: Estimator
  averaging: Averaging
  nperseg: number
  overlap: number
  window: string
  detrend: string
  response_type: RespType
  show_as: RespType
  fmin: number
  fmax: number | null
  unwrap: boolean
  impact: { trigger_pct: number; pretrigger_pct: number; force_ms: number; exp_end_pct: number }
  modes: { enabled: boolean; prominence_db: number; min_sep_hz: number | null; max_modes: number; method: ModeMethod }
}

export interface FrfCurve {
  id: string
  name: string
  mag_db: number[]
  phase_deg: number[]
  real: number[]
  imag: number[]
  coherence: number[] | null
}

export interface FrfMode {
  fn_hz: number
  level_db: number
  zeta: number | null
  zeta_hp: number | null
  zeta_fit: number | null
  bandwidth_hz: number | null
  q: number | null
  fit_error: number | null
  coherence: number | null
  residues: number[][] | null
  warnings: string[]
}

export interface FrfResult {
  freqs: number[]
  responses: FrfCurve[]
  estimator: string
  averaging: Averaging
  n_averages: number
  df_hz: number
  coherence_valid: boolean
  quantity: string
  show_as: RespType
  exp_decay_rate: number
  warnings: string[]
  modes?: FrfMode[]
  mif_db?: number[]
}

/** The server no longer has these records (restart, or idle for a while): the browser sends them again. */
export class FrfExpiredError extends Error {
  constructor() { super('The server no longer has these records.') }
}

export async function loadFrfFiles(
  sessionId: string, items: { id: string; file: File }[], csvFs?: number,
): Promise<{ channels: FrfChannel[]; errors: { file: string; error: string }[] }> {
  const form = new FormData()
  items.forEach((it) => { form.append('files', it.file); form.append('file_ids', it.id) })
  if (csvFs) form.append('fs', String(csvFs))
  const res = await fetch(`${BASE}/${sessionId}/load`, { method: 'POST', body: form })
  if (!res.ok) throw new Error(await errorText(res))
  return res.json()
}

export async function removeFrfFile(sessionId: string, fileId: string): Promise<void> {
  try { await fetch(`${BASE}/${sessionId}/${fileId}`, { method: 'DELETE' }) } catch { /* nothing to undo */ }
}

export async function computeFrf(
  sessionId: string, excitation: string | null, responses: string[], p: FrfParams, signal?: AbortSignal,
): Promise<FrfResult> {
  const res = await fetch(`${BASE}/${sessionId}/compute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      excitation, responses, ...p,
      modes: p.modes.enabled ? { ...p.modes, min_sep_hz: p.modes.min_sep_hz ?? undefined } : null,
    }),
  })
  if (res.status === 404) throw new FrfExpiredError()
  if (!res.ok) throw new Error(await errorText(res))
  return res.json()
}
