import type { BatchLimit, EnvelopeParams, FieldType, MetricKey, Section, SpectrogramParams, TonalityPrecision, ViewMode } from '../types'

/**
 * The analysis set-up written to a .json file so it can be repeated later: view, metric, field type, spectrogram and envelope
 * options, the batch (metrics, annoyance models, limits) and, per file name, the calibration and the section.
 * Files are matched by name when the setup is loaded, because file ids change from one session to the next.
 */
export const CONFIG_APP = 'pysqa-web'
export const CONFIG_VERSION = 1

export interface FileSetup {
  name: string
  calibration_mv_pa: number | null
  section: Section | null
}

export interface AnalysisConfig {
  app: typeof CONFIG_APP
  version: number
  saved_at: string
  view: {
    viewMode: ViewMode
    metricKey: MetricKey
    fieldType: FieldType
    precision: TonalityPrecision
    octaveWeighting: string
    spectrogram: SpectrogramParams
    envelope: EnvelopeParams
  }
  batch: {
    metrics: MetricKey[]
    annoyance: string[]
    limits: Record<string, BatchLimit>
  }
  files: FileSetup[]
}

export type ConfigErrorCode = 'notJson' | 'notPysqa' | 'newer'

export class ConfigError extends Error {
  constructor(public code: ConfigErrorCode) { super(code) }
}

const VIEW_MODES: ViewMode[] = ['normal', 'spectrogram', 'octave', 'envelope']
const METRICS: MetricKey[] = [
  'none', 'loudness_zwk', 'loudness_ecma', 'sharpness_din', 'roughness_dw', 'roughness_ecma', 'fluctuation_strength', 'tonality_ecma', 'ipm',
]
const ANNOYANCE = ['sil', 'zwk']

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v)
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback)

export function buildConfig(s: {
  viewMode: ViewMode; metricKey: MetricKey; fieldType: FieldType; precision: TonalityPrecision; octaveWeighting: string
  spectrogramParams: SpectrogramParams; envelopeParams: EnvelopeParams
  batchMetrics: MetricKey[]; batchAnnoyance: string[]; batchLimits: Record<string, BatchLimit>
  files: { audio_id: string; name: string }[]
  calibrations: Record<string, number | null>; sections: Record<string, Section | undefined>
}): AnalysisConfig {
  return {
    app: CONFIG_APP,
    version: CONFIG_VERSION,
    saved_at: new Date().toISOString(),
    view: {
      viewMode: s.viewMode, metricKey: s.metricKey, fieldType: s.fieldType, precision: s.precision,
      octaveWeighting: s.octaveWeighting, spectrogram: s.spectrogramParams, envelope: s.envelopeParams,
    },
    batch: { metrics: s.batchMetrics, annoyance: s.batchAnnoyance, limits: s.batchLimits },
    files: s.files.map(f => ({
      name: f.name,
      calibration_mv_pa: s.calibrations[f.audio_id] ?? null,
      section: s.sections[f.audio_id] ?? null,
    })),
  }
}

/** Reads and cleans a setup file: anything that is not valid is dropped, never trusted. Throws a ConfigError if it is not ours. */
export function parseConfig(text: string, current: { spectrogram: SpectrogramParams; envelope: EnvelopeParams }): AnalysisConfig {
  let raw: unknown
  try { raw = JSON.parse(text) } catch { throw new ConfigError('notJson') }
  if (!isObj(raw) || raw.app !== CONFIG_APP) throw new ConfigError('notPysqa')
  if (typeof raw.version !== 'number' || raw.version > CONFIG_VERSION) throw new ConfigError('newer')

  const v = isObj(raw.view) ? raw.view : {}
  const sp = isObj(v.spectrogram) ? v.spectrogram : {}
  const en = isObj(v.envelope) ? v.envelope : {}
  const b = isObj(raw.batch) ? raw.batch : {}

  const spectrogram: SpectrogramParams = {
    ...current.spectrogram,
    ...(num(sp.nfft) != null && { nfft: num(sp.nfft)! }),
    ...(num(sp.overlap) != null && { overlap: num(sp.overlap)! }),
    ...(typeof sp.window === 'string' && { window: sp.window }),
    ...(num(sp.kaiser_beta) != null && { kaiser_beta: num(sp.kaiser_beta)! }),
    ...(typeof sp.cmap === 'string' && { cmap: sp.cmap }),
    ...(typeof sp.freq_scale === 'string' && { freq_scale: sp.freq_scale }),
    ...('fmax' in sp && { fmax: num(sp.fmax) }),
    ...(num(sp.dyn_range) != null && { dyn_range: num(sp.dyn_range)! }),
    ...(num(sp.channel) != null && { channel: num(sp.channel)! }),
  }
  const envelope: EnvelopeParams = {
    ...current.envelope,
    ...(num(en.smoothing_ms) != null && { smoothing_ms: num(en.smoothing_ms)! }),
    ...('lpf_hz' in en && { lpf_hz: num(en.lpf_hz) }),
  }

  const limits: Record<string, BatchLimit> = {}
  if (isObj(b.limits)) {
    for (const [k, l] of Object.entries(b.limits)) {
      if (!isObj(l)) continue
      const min = num(l.min), max = num(l.max)
      if (min != null || max != null) limits[k] = { min, max }
    }
  }

  const files: FileSetup[] = []
  if (Array.isArray(raw.files)) {
    for (const f of raw.files) {
      if (!isObj(f) || typeof f.name !== 'string') continue
      const cal = num(f.calibration_mv_pa)
      const sec = Array.isArray(f.section) && f.section.length === 2 && num(f.section[0]) != null && num(f.section[1]) != null
        && f.section[1] > f.section[0] ? [f.section[0], f.section[1]] as Section : null
      files.push({ name: f.name, calibration_mv_pa: cal != null && cal > 0 ? cal : null, section: sec })
    }
  }

  return {
    app: CONFIG_APP,
    version: raw.version,
    saved_at: typeof raw.saved_at === 'string' ? raw.saved_at : '',
    view: {
      viewMode: oneOf(v.viewMode, VIEW_MODES, 'normal'),
      metricKey: oneOf(v.metricKey, METRICS, 'none'),
      fieldType: oneOf(v.fieldType, ['free', 'diffuse'] as const, 'free'),
      precision: oneOf(v.precision, ['exact', 'fast'] as const, 'exact'),
      octaveWeighting: oneOf(v.octaveWeighting, ['Z', 'A'] as const, 'Z'),
      spectrogram,
      envelope,
    },
    batch: {
      metrics: Array.isArray(b.metrics) ? b.metrics.filter((k: unknown): k is MetricKey => METRICS.includes(k as MetricKey) && k !== 'none') : [],
      annoyance: Array.isArray(b.annoyance) ? b.annoyance.filter((k: unknown): k is string => ANNOYANCE.includes(k as string)) : [],
      limits,
    },
    files,
  }
}
