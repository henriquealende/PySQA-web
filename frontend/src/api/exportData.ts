/**
 * The tables behind what is on screen, ready to export. Each view is rebuilt from the same
 * server endpoints the plots use (metrics are cached on the server, so this is cheap).
 */
import type {
  EnvelopeParams, FieldType, MetricKey, SpectrogramParams, ViewMode,
  WaveformData, SpectrumData,
} from '../types'
import { metricLabel } from '../components/MetricSelector'
import {
  fetchEnvelope, fetchMetric, fetchOctave, fetchSpectrogram, fetchSpectrum, fetchWaveform,
} from './audioApi'

export type Column = (number | string | null)[]
export interface Sheet { name: string; columns: Record<string, Column> }
export interface ExportData { label: string; sheets: Sheet[] }

export interface ExportRequest {
  sessionId: string
  audioId: string
  viewMode: ViewMode
  metricKey: MetricKey
  fieldType: FieldType
  octaveWeighting: string
  spectrogramParams: SpectrogramParams
  envelopeParams: EnvelopeParams
}

/** Rows of the longest column. */
export const rowCount = (sheet: Sheet) => Math.max(0, ...Object.values(sheet.columns).map((c) => c.length))

/** The server reduces long signals to the min and max of each bucket, interleaved: split them again. */
function splitMinMax(t: number[], y: number[]) {
  const time: number[] = [], lo: number[] = [], hi: number[] = []
  for (let i = 0; i + 1 < y.length; i += 2) { time.push(t[i]); lo.push(y[i]); hi.push(y[i + 1]) }
  return { time, lo, hi }
}

function waveformSheet(wf: WaveformData): Sheet {
  const unit = wf.calibrated ? 'Pa' : 'full scale'
  if (wf.reduced) {
    const m = splitMinMax(wf.t, wf.amplitude)
    return { name: 'Waveform', columns: { 'Time (s)': m.time, [`Minimum (${unit})`]: m.lo, [`Maximum (${unit})`]: m.hi } }
  }
  return { name: 'Waveform', columns: { 'Time (s)': wf.t, [`Amplitude (${unit})`]: wf.amplitude } }
}

function spectrumSheet(sp: SpectrumData): Sheet {
  const unit = sp.calibrated ? 'dB SPL re 20 µPa' : 'dBFS'
  const columns: Record<string, Column> = { 'Frequency (Hz)': sp.freqs }
  if (sp.average_db) {
    columns[`Peak (${unit})`] = sp.magnitude_db
    columns[`Average (${unit})`] = sp.average_db
  } else {
    columns[`Magnitude (${unit})`] = sp.magnitude_db
  }
  return { name: 'Spectrum', columns }
}

export async function buildExport(req: ExportRequest): Promise<ExportData> {
  const { sessionId: sid, audioId: aid } = req

  // A metric is open: its summary, its values by band and its time series
  if (req.viewMode === 'normal' && req.metricKey !== 'none') {
    const label = metricLabel(req.metricKey)
    const r = await fetchMetric(sid, aid, req.metricKey, req.fieldType)
    if (r.error) throw new Error(r.error)
    const sheets: Sheet[] = [{
      name: 'Summary',
      columns: { Metric: [label], 'Global value': [r.global ?? null], Unit: [r.unit ?? ''], 'Field type': [req.fieldType] },
    }]
    if (r.x_axis && r.y_axis) {
      sheets.push({ name: 'By band', columns: { [r.x_label ?? 'x']: r.x_axis, [r.y_label ?? 'y']: r.y_axis } })
    }
    if (r.time_data) {
      sheets.push({ name: 'Time-varying', columns: { 'Time (s)': r.time_data.t, [`${label} (${r.unit ?? ''})`]: r.time_data.values } })
    }
    return { label, sheets }
  }

  if (req.viewMode === 'spectrogram') {
    const d = await fetchSpectrogram(sid, aid, req.spectrogramParams)
    const columns: Record<string, Column> = { 'Frequency (Hz)': d.f }
    d.t.forEach((time, j) => { columns[`${time.toFixed(3)} s`] = d.power_db.map((row) => row[j]) })
    return { label: 'Spectrogram (dB)', sheets: [{ name: 'Spectrogram', columns }] }
  }

  if (req.viewMode === 'octave') {
    const d = await fetchOctave(sid, aid, req.octaveWeighting)
    const w = req.octaveWeighting
    const unit = d.calibrated
      ? (w === 'A' ? 'dB(A) SPL' : w === 'C' ? 'dB(C) SPL' : 'dB SPL re 20 µPa')
      : (w === 'A' ? 'dB(A)' : w === 'C' ? 'dB(C)' : 'dBFS')
    return {
      label: '1/3-octave bands',
      sheets: [{ name: 'Third-octave', columns: { 'Band centre (Hz)': d.centres_hz, [`RMS level (${unit})`]: d.levels_db } }],
    }
  }

  if (req.viewMode === 'envelope') {
    const d = await fetchEnvelope(sid, aid, req.envelopeParams)
    const env = d.reduced ? d.envelope.filter((_, i) => i % 2 === 0) : d.envelope   // the reduced envelope repeats each value twice
    let signal: Sheet
    if (d.reduced) {
      const m = splitMinMax(d.t, d.signal)
      signal = { name: 'Envelope', columns: { 'Time (s)': m.time, 'Signal minimum': m.lo, 'Signal maximum': m.hi, Envelope: env } }
    } else {
      signal = { name: 'Envelope', columns: { 'Time (s)': d.t, Signal: d.signal, Envelope: env } }
    }
    return {
      label: 'Envelope',
      sheets: [signal, { name: 'Envelope spectrum', columns: { 'Frequency (Hz)': d.f_env, 'Magnitude (dB)': d.env_spec_db } }],
    }
  }

  // Default view: waveform and spectrum
  const [wf, sp] = await Promise.all([fetchWaveform(sid, aid), fetchSpectrum(sid, aid)])
  return { label: 'Waveform and spectrum', sheets: [waveformSheet(wf), spectrumSheet(sp)] }
}
