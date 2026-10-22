/**
 * The tables behind what is on screen, ready to export. Each view is rebuilt from the same
 * server endpoints the plots use (metrics are cached on the server, so this is cheap).
 */
import type {
  EnvelopeParams, FieldType, MetricKey, Section, SpectrogramParams, ViewMode,
  WaveformData, SpectrumData,
} from '../types'
import { metricLabel } from '../components/MetricSelector'
import { t as tr } from '../i18n'
import {
  fetchEnvelope, fetchMetric, fetchOctave, fetchSpectrogram, fetchSpectrum, fetchWaveform,
} from './audioApi'

export type Column = (number | string | null)[]
export interface Sheet { id: string; name: string; columns: Record<string, Column> }
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
  section?: Section | null      // analyse only this part of the file (the waveform is always the whole file)
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
  const unit = wf.calibrated ? 'Pa' : tr('pp.export.fullScale')
  if (wf.reduced) {
    const m = splitMinMax(wf.t, wf.amplitude)
    return { id: 'waveform', name: tr('pp.export.sheetWaveform'), columns: { [tr('pp.export.colTime')]: m.time, [tr('pp.export.colMinimum', { unit })]: m.lo, [tr('pp.export.colMaximum', { unit })]: m.hi } }
  }
  return { id: 'waveform', name: tr('pp.export.sheetWaveform'), columns: { [tr('pp.export.colTime')]: wf.t, [tr('pp.export.colAmplitude', { unit })]: wf.amplitude } }
}

function spectrumSheet(sp: SpectrumData): Sheet {
  const unit = sp.calibrated ? 'dB SPL re 20 µPa' : 'dBFS'
  const columns: Record<string, Column> = { [tr('pp.export.colFrequency')]: sp.freqs }
  if (sp.average_db) {
    columns[tr('pp.export.colPeak', { unit })] = sp.magnitude_db
    columns[tr('pp.export.colAverage', { unit })] = sp.average_db
  } else {
    columns[tr('pp.export.colMagnitude', { unit })] = sp.magnitude_db
  }
  return { id: 'spectrum', name: tr('pp.export.sheetSpectrum'), columns }
}

async function buildSheets(req: ExportRequest): Promise<ExportData> {
  const { sessionId: sid, audioId: aid } = req
  const section = req.section ?? null

  // A metric is open: its summary, its values by band and its time series
  if (req.viewMode === 'normal' && req.metricKey !== 'none') {
    const label = metricLabel(req.metricKey)
    const r = await fetchMetric(sid, aid, req.metricKey, req.fieldType, section)
    if (r.error) throw new Error(r.error)
    const sheets: Sheet[] = [{
      id: 'summary',
      name: tr('pp.export.sheetSummary'),
      columns: {
        [tr('pp.export.colMetric')]: [label], [tr('pp.export.colGlobal')]: [r.global ?? null], [tr('pp.export.colUnit')]: [r.unit ?? ''], [tr('pp.export.colFieldType')]: [req.fieldType],
        [tr('pp.export.colSection')]: [section ? `${section[0]}-${section[1]} s` : tr('pp.export.wholeFile')],
      },
    }]
    if (r.x_axis && r.y_axis) {
      sheets.push({ id: 'byband', name: tr('pp.export.sheetByBand'), columns: { [r.x_label ?? 'x']: r.x_axis, [r.y_label ?? 'y']: r.y_axis } })
    }
    if (r.time_data) {
      sheets.push({ id: 'timevarying', name: tr('pp.export.sheetTimeVarying'), columns: { [tr('pp.export.colTime')]: r.time_data.t, [`${label} (${r.unit ?? ''})`]: r.time_data.values } })
    }
    return { label, sheets }
  }

  if (req.viewMode === 'spectrogram') {
    const d = await fetchSpectrogram(sid, aid, req.spectrogramParams, section)
    const columns: Record<string, Column> = { [tr('pp.export.colFrequency')]: d.f }
    d.t.forEach((time, j) => { columns[`${time.toFixed(3)} s`] = d.power_db.map((row) => row[j]) })
    return { label: tr('pp.export.labelSpectrogram'), sheets: [{ id: 'spectrogram', name: tr('pp.export.sheetSpectrogram'), columns }] }
  }

  if (req.viewMode === 'octave') {
    const d = await fetchOctave(sid, aid, req.octaveWeighting, section)
    const w = req.octaveWeighting
    const unit = d.calibrated
      ? (w === 'A' ? 'dB(A) SPL' : w === 'C' ? 'dB(C) SPL' : 'dB SPL re 20 µPa')
      : (w === 'A' ? 'dB(A)' : w === 'C' ? 'dB(C)' : 'dBFS')
    return {
      label: tr('pp.export.labelOctave'),
      sheets: [{ id: 'octave', name: tr('pp.export.sheetThirdOctave'), columns: { [tr('pp.export.colBandCentre')]: d.centres_hz, [tr('pp.export.colRms', { unit })]: d.levels_db } }],
    }
  }

  if (req.viewMode === 'envelope') {
    const d = await fetchEnvelope(sid, aid, req.envelopeParams, section)
    const env = d.reduced ? d.envelope.filter((_, i) => i % 2 === 0) : d.envelope   // the reduced envelope repeats each value twice
    let signal: Sheet
    if (d.reduced) {
      const m = splitMinMax(d.t, d.signal)
      signal = { id: 'envelope', name: tr('pp.export.sheetEnvelope'), columns: { [tr('pp.export.colTime')]: m.time, [tr('pp.export.colSignalMin')]: m.lo, [tr('pp.export.colSignalMax')]: m.hi, [tr('pp.export.colEnvelope')]: env } }
    } else {
      signal = { id: 'envelope', name: tr('pp.export.sheetEnvelope'), columns: { [tr('pp.export.colTime')]: d.t, [tr('pp.export.colSignal')]: d.signal, [tr('pp.export.colEnvelope')]: env } }
    }
    return {
      label: tr('pp.export.labelEnvelope'),
      sheets: [signal, { id: 'envspectrum', name: tr('pp.export.sheetEnvSpectrum'), columns: { [tr('pp.export.colFrequency')]: d.f_env, [tr('pp.export.colMagnitudeDb')]: d.env_spec_db } }],
    }
  }

  // Default view: waveform and spectrum
  const [wf, sp] = await Promise.all([fetchWaveform(sid, aid), fetchSpectrum(sid, aid, section)])
  return { label: tr('pp.export.labelWaveSpec'), sheets: [waveformSheet(wf), spectrumSheet(sp)] }
}

/** The tables of the view on screen. With a section, the analysis tables cover only that part. */
export async function buildExport(req: ExportRequest): Promise<ExportData> {
  const data = await buildSheets(req)
  if (!req.section) return data
  return { ...data, label: tr('pp.export.labelSection', { label: data.label, a: req.section[0], b: req.section[1] }) }
}
