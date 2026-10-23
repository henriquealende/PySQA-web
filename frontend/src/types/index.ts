export interface AudioFile {
  audio_id: string
  name: string
  sample_rate: number
  channels: number
  duration_s: number
}

export type ViewMode = 'normal' | 'spectrogram' | 'octave' | 'envelope'

export type FieldType = 'free' | 'diffuse'

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
}

export interface EnvelopeParams {
  smoothing_ms: number
  lpf_hz: number | null
}

export interface MetricResult {
  global?: number
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

export interface WaveformData {
  t: number[]
  amplitude: number[]
  peak?: number          // highest absolute sample of the whole file (full scale = 1)
  reduced?: boolean      // true: min and max of each bucket, interleaved (long signals)
  calibrated?: boolean   // amplitude is in Pa instead of full scale
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
