export interface AudioFile {
  audio_id: string
  name: string
  sample_rate: number
  channels: number
  duration_s: number
}

export type ViewMode = 'normal' | 'spectrogram' | 'octave' | 'envelope'

export type FieldType = 'free' | 'diffuse'

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
}

export interface WaveformData {
  t: number[]
  amplitude: number[]
  duration_s: number
  sample_rate: number
}

export interface SpectrumData {
  freqs: number[]
  magnitude_db: number[]
  calibrated?: boolean
}

export interface OctaveData {
  centres_hz: number[]
  levels_db: (number | null)[]
  calibrated?: boolean
}

export interface SpectrogramData {
  t: number[]
  f: number[]
  power_db: number[][]
  z_min: number
  z_max: number
  cmap?: string
  freq_scale?: string
}

export interface EnvelopeData {
  t: number[]
  signal: number[]
  envelope: number[]
  f_env: number[]
  env_spec_db: number[]
}

export interface BatchRow {
  audio_id: string
  name: string
  [metric: string]: string | number | null
}
