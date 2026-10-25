export interface AudioFile {
  audio_id: string
  name: string
  sample_rate: number
  channels: number
  duration_s: number
}

export type ViewMode = 'normal' | 'spectrogram' | 'octave' | 'envelope'

export type FieldType = 'free' | 'diffuse'
/** Tonality ECMA-418-2: the exact calculation, or a faster one that is a little approximate. */
export type TonalityPrecision = 'exact' | 'fast'

/** The part of a file to analyse, [start, end] in seconds; no section means the whole file. */
export type Section = [number, number]

export type MetricKey =
  | 'none'
  | 'loudness_zwk'
  | 'loudness_ecma'
  | 'sharpness_din'
  | 'roughness_dw'
  | 'roughness_ecma'
  | 'fluctuation_strength'
  | 'tonality_ecma'
  | 'ipm'

export interface SpectrogramParams {
  nfft: number
  overlap: number
  window: string
  kaiser_beta: number
  cmap: string
  freq_scale: string
  fmax: number | null
  dyn_range: number
  channel?: number        // 0 = left (default), 1 = right
}

export interface EnvelopeParams {
  smoothing_ms: number
  lpf_hz: number | null
}

/** Statistics of a metric over time (N5 = value exceeded in 5 % of the time). */
export interface MetricStats {
  n: number
  mean: number
  std: number
  min: number
  max: number
  t_min: number
  t_max: number
  duration_s: number
  exceeded: Record<'5' | '10' | '50' | '90' | '95', number>
}

export interface MetricResult {
  global?: number
  stats?: MetricStats
  precision?: TonalityPrecision      // set by Tonality ECMA-418-2: how it was calculated
  unit?: string
  x_axis?: number[]
  x_label?: string
  y_axis?: number[]
  y_label?: string
  plot_type?: 'bar_or_line' | 'bar' | 'line'
  time_data?: { t: number[]; values: number[] }
  threshold?: number
  threshold_label?: string
  error?: string
  requires?: string
  section?: Section | null
}

/** Samples of the whole file (Pa when calibrated, full scale otherwise) and, when calibrated, levels in dB re 20 µPa (null: silence). */
export interface WaveStats {
  mean: number
  std: number
  min: number
  max: number
  levels: { lzeq: number | null; laeq: number | null; lzmax: number | null; lamax: number | null; lpeak: number | null } | null
}

export interface WaveformData {
  t: number[]
  amplitude: number[]
  peak?: number          // highest absolute sample of the whole file (full scale = 1)
  reduced?: boolean      // true: min and max of each bucket, interleaved (long signals)
  calibrated?: boolean   // amplitude is in Pa instead of full scale
  stats?: WaveStats | null
  channels?: { name: string; amplitude: number[]; peak: number; stats?: WaveStats | null }[]   // left and right of a file with two channels
  duration_s: number
  sample_rate: number
}

export interface SpectrumData {
  freqs: number[]
  magnitude_db: number[]  // first channel; per-bucket peak when the spectrum was reduced for plotting
  channels?: { name: string; magnitude_db: number[] }[]   // left and right, only for a file with two or more channels
  calibrated?: boolean
  section?: Section | null
}

export interface OctaveData {
  centres_hz: number[]
  levels_db: (number | null)[]
  channels?: { name: string; levels_db: (number | null)[] }[]
  calibrated?: boolean
  section?: Section | null
}

export interface SpectrogramData {
  t: number[]
  f: number[]
  power_db: number[][]
  z_min: number
  z_max: number
  cmap?: string
  freq_scale?: string
  section?: Section | null
}

export interface EnvelopeData {
  reduced?: boolean
  t: number[]
  signal: number[]
  envelope: number[]
  f_env: number[]
  env_spec_db: number[]
  channels?: { name: string; signal: number[]; envelope: number[]; f_env: number[]; env_spec_db: number[] }[]
  section?: Section | null
}

/** What /api/health says about the compute queue and how long calculations usually take. */
export interface ServerLoad {
  heavy?: {
    tracked: boolean
    running_job: string | null
    running_kind: string | null
    running_for_s: number | null
    queue: string[]
  }
  timing_s_per_audio_s?: Record<string, number>
}

export interface BatchRow {
  audio_id: string
  name: string
  [metric: string]: string | number | null
}

/** A pass/fail limit of a batch column; a side left null is not checked. */
export interface BatchLimit {
  min: number | null
  max: number | null
}

/** A user-defined index for the batch: intercept + Σ weight · global value of each metric. */
export interface BatchModel {
  id: string
  name: string
  unit: string
  intercept: number
  weights: Partial<Record<MetricKey, number>>
  on: boolean
}
