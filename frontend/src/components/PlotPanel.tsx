import { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import Plot from './Plot'
import { Loader2, Settings } from 'lucide-react'
import { useStore } from '../store/useStore'
import { audioElementRef, audioTimeListeners } from '../hooks/useAudioPlayer'
import { SessionExpiredError, isAbort } from '../api/audioApi'
import { newClientId } from '../api/http'
import {
  fetchWaveform, fetchSpectrum, fetchSpectrogram,
  fetchOctave, fetchEnvelope, fetchMetric,
} from '../api/audioApi'
import type {
  WaveformData, SpectrumData, SpectrogramData,
  OctaveData, EnvelopeData, MetricResult,
  SpectrogramParams, EnvelopeParams, Section,
} from '../types'
import SectionBar, { sectionKey, toSection } from './SectionBar'
import MetricProgress from './MetricProgress'
import MetricStats from './MetricStats'
import WaveStatsTable from './WaveStatsTable'
import SpectrumBar from './SpectrumBar'
import PlotMenu, { type MenuItem } from './PlotMenu'
import { useT } from '../i18n'
import { serverLabel } from '../i18n/serverLabels'
import { LEGEND_INSIDE } from './plotLegend'

// ─── Colors ─────────────────────────────────────────────────────────────────
const C_TEAL   = '#50b89e'   // primary time
const C_ORANGE = '#ed693b'   // primary freq
const C_AMBER  = '#ffa94d'   // envelope
const C_RIGHT  = '#4cc9f0'   // right channel in the frequency charts (the left one is C_ORANGE)
const C_VIOLET = '#c084fc'   // right channel in the time charts (the left one is C_TEAL)
const C_PINK   = '#f472b6'   // right-channel envelope (the left one is C_AMBER)
const C_BLUE   = '#60a5fa'   // compare time
const C_YELLOW = '#fbbf24'   // compare freq

// ─── Layout base ────────────────────────────────────────────────────────────
const BASE_LAYOUT: Partial<Plotly.Layout> = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#111c28',
  font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
  margin: { l: 58, r: 16, t: 32, b: 48 },
  xaxis: { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9' },
  yaxis: { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9' },
  autosize: true,
  hovermode: 'x unified',
  hoverlabel: { bgcolor: '#1c2a38', bordercolor: '#50b89e', font: { color: 'white', size: 11 } },
  modebar: {
    orientation: 'h',
    bgcolor: 'rgba(17,28,40,0.75)',
    color: '#8ab4c9',
    activecolor: '#50b89e',
  } as any,
}

const PLOT_CONFIG = {
  displayModeBar: true,
  modeBarButtonsToRemove: [
    'sendDataToCloud', 'lasso2d', 'select2d',
    'toggleSpikelines', 'hoverClosestCartesian', 'hoverCompareCartesian',
  ] as any,
  displaylogo: false,
  responsive: true,
}

// ─── Bark ↔ Hz ──────────────────────────────────────────────────────────────
function hz2bark(f: number): number {
  // Traunmüller (1990) — inverse: Hz → Bark
  return (26.28 * f - 0.53 * 1960) / (f + 1960)
}
function hz2barkHMS(f: number): number {
  // ECMA-418-2 inverse: Hz → Bark HMS
  return Math.asinh(f / 81.9289) / 0.1618
}

// Octave-band centre frequencies (ISO 266)
const OCTAVE_HZ = [16, 31.5, 63, 125, 250, 500, 1000, 2000, 4000, 8000, 16000, 20000]

function barkTicksHz(barkValues: number[], isHMS = false): { tickvals: number[]; ticktext: string[] } {
  if (!barkValues.length) return { tickvals: [], ticktext: [] }
  const toBark = isHMS ? hz2barkHMS : hz2bark
  const minB = Math.min(...barkValues), maxB = Math.max(...barkValues)
  const tickvals: number[] = [], ticktext: string[] = []
  for (const hz of OCTAVE_HZ) {
    const b = toBark(hz)
    if (b < minB || b > maxB) continue          // outside data range
    tickvals.push(b)
    ticktext.push(hz >= 1000 ? `${hz/1000}k` : `${hz}`)
  }
  return { tickvals, ticktext }
}

/** Plotly also starts a zoom when the right button is dragged. That button is kept for the cursor menu, so it never reaches the chart. */
const rightButtonFree = {
  onMouseDownCapture: (e: React.MouseEvent) => { if (e.button === 2) e.stopPropagation() },
  onMouseUpCapture: (e: React.MouseEvent) => { if (e.button === 2) e.stopPropagation() },
}

// ─── Harmonic cursor ────────────────────────────────────────────────────────
const MAX_HARMONICS = 40
const LABELLED_HARMONICS = 10
/** Lines at f0, 2·f0, 3·f0 … up to the top of the axis (at most MAX_HARMONICS), the first one solid. */
function harmonicCount(f0: number, fMax: number): number {
  return Math.max(1, Math.min(MAX_HARMONICS, Math.floor(fMax / f0)))
}
function harmonicShapes(f0: number, fMax: number, color = C_ORANGE): any[] {
  return Array.from({ length: harmonicCount(f0, fMax) }, (_, i) => ({
    type: 'line', xref: 'x', yref: 'paper',
    x0: f0*(i+1), x1: f0*(i+1), y0: 0, y1: 1,
    line: { color, width: i===0 ? 1.5 : 1, dash: i===0 ? 'solid' : 'dot' },
  }))
}
/** "f₀, 2×, 3× …" above the first lines, so it is clear which line is which. */
function harmonicLabels(f0: number, fMax: number, color = C_ORANGE): any[] {
  return Array.from({ length: Math.min(LABELLED_HARMONICS, harmonicCount(f0, fMax)) }, (_, i) => ({
    x: Math.log10(f0*(i+1)), xref: 'x', y: 1, yref: 'paper', yanchor: 'bottom', showarrow: false,
    text: i === 0 ? 'f₀' : `${i+1}×`, font: { size: 9, color },
  }))
}

/** The point of the curve nearest (in log frequency) to f. */
function nearestPoint(freqs: number[], mags: number[], f: number): { x: number; y: number } | null {
  let best = -1, bd = Infinity
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] <= 0) continue
    const d = Math.abs(Math.log(freqs[i] / f))
    if (d < bd) { bd = d; best = i }
  }
  return best < 0 ? null : { x: freqs[best], y: mags[best] }
}
/** The highest point of the curve within 1/3 octave around f (1/6 each side): the peak the user is pointing at. */
function nearestPeak(freqs: number[], mags: number[], f: number): { x: number; y: number } | null {
  const lo = f * 2 ** (-1 / 6), hi = f * 2 ** (1 / 6)
  let best = -1
  for (let i = 0; i < freqs.length; i++) {
    if (freqs[i] < lo || freqs[i] <= 0) continue
    if (freqs[i] > hi) break
    if (best < 0 || mags[i] > mags[best]) best = i
  }
  return best < 0 ? nearestPoint(freqs, mags, f) : { x: freqs[best], y: mags[best] }
}

// ─── Helper components ───────────────────────────────────────────────────────
function Spinner() {
  const t = useT()
  return (
    <div className="flex flex-1 items-center justify-center gap-2 text-muted">
      <Loader2 size={18} className="animate-spin text-teal" />
      <span className="text-xs">{t('plot.loading')}</span>
    </div>
  )
}

function ErrorMsg({ msg }: { msg: string }) {
  return <div className="flex flex-1 items-center justify-center"><p className="text-xs text-red-400 max-w-sm text-center">{msg}</p></div>
}

function SessionExpiredMsg() {
  const t = useT()
  const clearSession = useStore(s => s.clearSession)
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-4">
      <p className="text-xs text-amber-400 max-w-xs">{t('plot.expired')}</p>
      <button onClick={clearSession} className="btn btn-primary">
        {t('plot.clearReupload')}
      </button>
    </div>
  )
}

// Shown after the user cancels a slow calculation
function CancelledPanel({ wasRunning, onRetry, onBack }: { wasRunning: boolean; onRetry: () => void; onBack: () => void }) {
  const t = useT()
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center px-6 h-full">
      <p className="text-xs text-muted max-w-sm">
        {t('plot.cancelled.title')}{' '}
        {wasRunning
          ? t('plot.cancelled.running')
          : t('plot.cancelled.queued')}
      </p>
      <div className="flex gap-2">
        <button onClick={onRetry}
          className="btn btn-primary">
          {t('plot.cancelled.retry')}
        </button>
        <button onClick={onBack}
          className="px-3 py-1.5 text-xs text-muted hover:text-white border border-border rounded transition-colors">
          {t('plot.cancelled.back')}
        </button>
      </div>
    </div>
  )
}

// Compare badge shown when a comparison file is active
function CompareBadge({ name, color }: { name: string; color: string }) {
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full border text-[11px]"
      style={{ borderColor: color + '60', background: color + '15', color }}>
      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
      {name.replace(/\.wav$/i, '')}
    </div>
  )
}

// ─── Settings helpers ────────────────────────────────────────────────────────
function SettingsOverlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  const t = useT()
  return (
    <div className="absolute inset-0 z-10 flex items-start justify-end pointer-events-none">
      <div className="pointer-events-auto mt-10 mr-2 w-64 bg-surface border border-border rounded-lg shadow-xl p-3 text-xs">
        <div className="flex items-center justify-between mb-2">
          <span className="font-semibold text-white text-[11px] uppercase tracking-wider">{t('plot.settings')}</span>
          <button onClick={onClose} className="text-muted hover:text-white transition-colors text-base leading-none">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}
function LabeledRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-muted w-24 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
const inputCls  = 'w-full bg-panel border border-field rounded px-2 py-0.5 text-white text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal'
const selectCls = 'w-full bg-panel border border-field rounded px-2 py-0.5 text-white text-xs focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal'

function SpectrogramSettings({ params, onChange }: { params: SpectrogramParams; onChange: (p: Partial<SpectrogramParams>) => void }) {
  const t = useT()
  return (
    <div className="space-y-0.5">
      <LabeledRow label="NFFT">
        <select className={selectCls} value={params.nfft} onChange={e => onChange({ nfft: Number(e.target.value) })}>
          {[256,512,1024,2048,4096,8192].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </LabeledRow>
      <LabeledRow label={t('plot.spec.overlap')}>
        <input className={inputCls} type="number" min={0} max={99} step={5} value={params.overlap}
          onChange={e => onChange({ overlap: Number(e.target.value) })} />
      </LabeledRow>
      <LabeledRow label={t('plot.spec.window')}>
        <select className={selectCls} value={params.window} onChange={e => onChange({ window: e.target.value })}>
          {['hann','hamming','blackman','bartlett','flattop','boxcar','kaiser'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </LabeledRow>
      {params.window === 'kaiser' && (
        <LabeledRow label={t('plot.spec.kaiser')}>
          <input className={inputCls} type="number" min={0} max={100} step={1}
            value={params.kaiser_beta ?? 14}
            onChange={e => onChange({ kaiser_beta: Number(e.target.value) })} />
        </LabeledRow>
      )}
      <LabeledRow label={t('plot.spec.colormap')}>
        <select className={selectCls} value={params.cmap} onChange={e => onChange({ cmap: e.target.value })}>
          {['magma','viridis','inferno','plasma','hot','jet','greys'].map(v => <option key={v} value={v}>{v}</option>)}
        </select>
      </LabeledRow>
      <LabeledRow label={t('plot.spec.freqScale')}>
        <select className={selectCls} value={params.freq_scale} onChange={e => onChange({ freq_scale: e.target.value })}>
          <option value="log">{t('plot.spec.log')}</option>
          <option value="linear">{t('plot.spec.linear')}</option>
        </select>
      </LabeledRow>
      <LabeledRow label={t('plot.spec.fmax')}>
        <input className={inputCls} type="number" min={100} placeholder={t('plot.spec.auto')} value={params.fmax ?? ''}
          onChange={e => onChange({ fmax: e.target.value ? Number(e.target.value) : null })} />
      </LabeledRow>
      <LabeledRow label={t('plot.spec.dyn')}>
        <input className={inputCls} type="number" min={20} max={120} step={10} value={params.dyn_range}
          onChange={e => onChange({ dyn_range: Number(e.target.value) })} />
      </LabeledRow>
    </div>
  )
}
function OctaveSettings({ weighting, onChange }: { weighting: string; onChange: (w: string) => void }) {
  const t = useT()
  return (
    <LabeledRow label={t('plot.oct.weighting')}>
      <select className={selectCls} value={weighting} onChange={e => onChange(e.target.value)}>
        <option value="Z">{t('plot.oct.z')}</option>
        <option value="A">{t('plot.oct.a')}</option>
        <option value="C">{t('plot.oct.c')}</option>
      </select>
    </LabeledRow>
  )
}
function EnvelopeSettings({ params, onChange }: { params: EnvelopeParams; onChange: (p: Partial<EnvelopeParams>) => void }) {
  const t = useT()
  return (
    <div className="space-y-0.5">
      <LabeledRow label={t('plot.env.smoothing')}>
        <input className={inputCls} type="number" min={0} step={1} value={params.smoothing_ms}
          onChange={e => onChange({ smoothing_ms: Number(e.target.value) })} />
      </LabeledRow>
      <LabeledRow label={t('plot.env.lpf')}>
        <input className={inputCls} type="number" min={1} placeholder={t('plot.env.none')} value={params.lpf_hz ?? ''}
          onChange={e => onChange({ lpf_hz: e.target.value ? Number(e.target.value) : null })} />
      </LabeledRow>
    </div>
  )
}
function GearButton({ onClick }: { onClick: () => void }) {
  const t = useT()
  return (
    <button onClick={onClick} title={t('plot.settings')}
      className="absolute top-1 right-1 z-10 p-1 rounded text-muted hover:text-white hover:bg-panel/80 transition-colors">
      <Settings size={13} />
    </button>
  )
}

// ─── Views ───────────────────────────────────────────────────────────────────

// ── Pin annotation builder ───────────────────────────────────────────────────
function makePinAnnotation(p: {x: number; y: number}, isLogX: boolean, xFmt: string, yFmt: string, unit = '') {
  const xVal = isLogX ? Math.log10(p.x) : p.x
  const label = isLogX
    ? `${p.x.toFixed(0)} Hz, ${p.y.toFixed(1)} ${unit}`
    : `${p.x.toFixed(3)} s, ${p.y.toFixed(4)}`
  return {
    x: xVal, y: p.y, xref: 'x' as const, yref: 'y' as const,
    text: label, showarrow: true, arrowhead: 2, arrowsize: 0.8, arrowcolor: '#8ab4c9',
    font: { size: 9, color: '#e2e8f0' }, bgcolor: 'rgba(17,28,40,0.9)',
    bordercolor: '#8ab4c9', borderwidth: 1, borderpad: 3,
    ax: 20, ay: -20,
  }
}

/** On a phone two charts are not shown together: one is picked here and fills the standard height. From sm up this is not used. */
function useChartPick(): ['time' | 'freq', (v: 'time' | 'freq') => void] {
  const [mv, setMv] = useState<'time' | 'freq'>('time')
  useEffect(() => {
    const id = window.requestAnimationFrame(() => window.dispatchEvent(new Event('resize')))   // Plotly measures a chart again once it is shown
    return () => window.cancelAnimationFrame(id)
  }, [mv])
  return [mv, setMv]
}
const pickCls = (shown: boolean) => `plot-box ${shown ? '' : 'hidden sm:block'}`

function ChartSwitch({ value, onChange }: { value: 'time' | 'freq'; onChange: (v: 'time' | 'freq') => void }) {
  const t = useT()
  return (
    <div className="sm:hidden px-2 shrink-0">
      <div className="seg seg-fill" role="group" aria-label={t('plot.normal.chartPick')}>
        <button onClick={() => onChange('time')} aria-pressed={value === 'time'}>{t('plot.normal.chartTime')}</button>
        <button onClick={() => onChange('freq')} aria-pressed={value === 'freq'}>{t('plot.normal.chartFreq')}</button>
      </div>
    </div>
  )
}

function NormalView({ sessionId, audioId, compareId, compareName, section }: {
  sessionId: string; audioId: string; compareId: string|null; compareName: string; section: Section|null
}) {
  const t = useT()
  const { calibrations, audioIsPlaying, setSection, files } = useStore()
  const secKey = sectionKey(section)
  const isCalibrated = !!calibrations[audioId]
  const [wf,    setWf]    = useState<WaveformData|null>(null)
  const [sp,    setSp]    = useState<SpectrumData|null>(null)
  const [wfCmp, setWfCmp] = useState<WaveformData|null>(null)
  const [spCmp, setSpCmp] = useState<SpectrumData|null>(null)
  const [err,   setErr]   = useState('')
  const [f0,    setF0]    = useState<number|null>(null)
  const [mv, setMv] = useChartPick()
  // Range of the spectrum's axes, kept here because every re-render hands Plotly a fresh layout (null: automatic)
  const [spX, setSpX] = useState<[number, number] | null>(null)
  const [spY, setSpY] = useState<[number, number] | null>(null)
  const spGraph = useRef<any>(null)                       // the spectrum's Plotly graph
  const spWrap = useRef<HTMLDivElement>(null)
  const [menu, setMenu] = useState<{ left: number; top: number; f: number; level: number } | null>(null)
  const [spPins, setSpPins] = useState<{x: number; y: number}[]>([])
  const [wfPins, setWfPins] = useState<{x: number; y: number}[]>([])
  // What dragging on the waveform does: mark a section to analyse (default), or zoom / pan
  const [wfDrag, setWfDrag] = useState<'select'|'zoom'|'pan'>('select')
  // Zoom of the waveform's time axis, kept here because every re-render hands Plotly a fresh layout
  const wfRange = useRef<[number, number] | null>(null)
  // Playback cursor. It is moved straight on the page (a thin line over the waveform and a clock in the
  // toolbar), not through React and Plotly: redrawing both charts every frame just to move a line made
  // playback choppy, and the time it read only changed a few times a second anyway.
  const wfGraph = useRef<any>(null)                       // the waveform's Plotly graph
  const cursorLine = useRef<HTMLDivElement>(null)
  const cursorClock = useRef<HTMLSpanElement>(null)
  const drawCursor = useRef<() => void>(() => {})

  useEffect(() => {
    const draw = () => {
      const gd = wfGraph.current, line = cursorLine.current, clock = cursorClock.current
      const t = audioElementRef.current?.currentTime ?? 0
      const xa = gd?._fullLayout?.xaxis, ya = gd?._fullLayout?.yaxis
      // With autorange Plotly leaves `range` at its placeholder ([-1, 6]); the span really drawn is `_rl`
      const rng: [number, number] | undefined = xa?._rl ?? xa?.range
      const shown = !!(rng && ya && (audioIsPlaying || t > 0))
      const x = shown ? xa._offset + ((t - rng![0]) / (rng![1] - rng![0])) * xa._length : 0
      const inside = shown && x >= xa._offset - 1 && x <= xa._offset + xa._length + 1       // zoomed past it: hidden
      if (line) {
        line.style.display = inside ? 'block' : 'none'
        if (inside) {
          line.style.transform = `translateX(${x}px)`
          line.style.top = `${ya._offset}px`
          line.style.height = `${ya._length}px`
        }
      }
      if (clock) {
        clock.style.display = shown ? '' : 'none'
        if (shown) clock.textContent = `▶ ${t.toFixed(2)} s`
      }
    }
    drawCursor.current = draw
    draw()
    audioTimeListeners.add(draw)           // a seek while paused
    let raf = 0
    if (audioIsPlaying) {
      const tick = () => { draw(); raf = requestAnimationFrame(tick) }
      raf = requestAnimationFrame(tick)
    }
    return () => { audioTimeListeners.delete(draw); cancelAnimationFrame(raf) }
  }, [audioIsPlaying])

  // New file: forget the zoom
  useEffect(() => { wfRange.current = null }, [sessionId, audioId])

  // ESC clears all pins
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { setSpPins([]); setWfPins([]) } }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Reset pins when file changes
  useEffect(() => { setSpPins([]); setWfPins([]) }, [sessionId, audioId])

  const calKey = calibrations[audioId] ?? null

  // Waveform: re-fetch when the file or its calibration changes (the server scales it to Pa when calibrated)
  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    setWf(null); setWfCmp(null)
    const primary  = fetchWaveform(sessionId, audioId, ctrl.signal).then(d => { if (alive) setWf(d) })
    const compare  = compareId ? fetchWaveform(sessionId, compareId, ctrl.signal).then(d => { if (alive) setWfCmp(d) }) : Promise.resolve()
    Promise.all([primary, compare])
      .catch(e => { if (alive && !isAbort(e)) setErr(e instanceof SessionExpiredError ? '__session_expired__' : e.message) })
    return () => { alive = false; ctrl.abort() }
  }, [sessionId, audioId, compareId, calKey])

  // Spectrum: re-fetch when calibration or the section changes (backend applies calibration_pa and the section)
  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    setSp(null); setSpCmp(null); setErr('')
    const primary  = fetchSpectrum(sessionId, audioId, section, ctrl.signal).then(d => { if (alive) setSp(d) })
    const compare  = compareId ? fetchSpectrum(sessionId, compareId, section, ctrl.signal).then(d => { if (alive) setSpCmp(d) }) : Promise.resolve()
    Promise.all([primary, compare])
      .catch(e => { if (alive && !isAbort(e)) setErr(e instanceof SessionExpiredError ? '__session_expired__' : e.message) })
    return () => { alive = false; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioId, compareId, calKey, secKey])

  if (err === '__session_expired__') return <SessionExpiredMsg />
  if (err) return <ErrorMsg msg={err} />
  if (!wf || !sp) return <Spinner />

  // A file with two channels draws both (left teal, right violet)
  const wfStereo = !!wf.channels && wf.channels.length > 1
  const wfCurves = wfStereo
    ? wf.channels!.map((c, i) => ({ y: c.amplitude, color: i === 0 ? C_TEAL : C_VIOLET, name: t(i === 0 ? 'plot.trace.left' : 'plot.trace.right') }))
    : [{ y: wf.amplitude, color: C_TEAL, name: t('plot.trace.waveform') }]
  const wfData: Plotly.Data[] = [
    ...wfCurves.map(c => ({
      x: wf.t, y: c.y, type: 'scatter' as const, mode: 'lines' as const,
      line: { color: c.color, width: 1 }, name: c.name,
      hovertemplate: '%{x:.3f} s — %{y:.4f}<extra></extra>',
    })),
    ...(wfCmp ? [{
      x: wfCmp.t, y: wfCmp.amplitude, type: 'scatter' as const, mode: 'lines' as const,
      line: { color: C_BLUE, width: 1, dash: 'dot' as const }, name: `${t('plot.trace.waveform')} (${compareName})`,
      hovertemplate: '%{x:.3f} s — %{y:.4f}<extra></extra>',
    }] : []),
  ]

  const specCalibrated = sp.calibrated ?? false
  const specUnit = specCalibrated ? 'dB SPL' : 'dBFS'

  // A file with two channels draws one curve each (left orange, right blue); a mono file draws one.
  const stereo = !!sp.channels && sp.channels.length > 1
  const spCurves = stereo
    ? sp.channels!.map((c, i) => ({ y: c.magnitude_db, color: i === 0 ? C_ORANGE : C_RIGHT, name: t(i === 0 ? 'plot.trace.left' : 'plot.trace.right') }))
    : [{ y: sp.magnitude_db, color: C_ORANGE, name: t('plot.trace.spectrum') }]
  const spData: Plotly.Data[] = [
    ...spCurves.map(c => ({
      x: sp.freqs, y: c.y, type: 'scatter' as const, mode: 'lines' as const,
      line: { color: c.color, width: 1.2 }, name: c.name,
      hovertemplate: `%{x:.1f} Hz — %{y:.1f} ${specUnit}<extra></extra>`,
    })),
    ...(spCmp ? [{
      x: spCmp.freqs, y: spCmp.magnitude_db, type: 'scatter' as const, mode: 'lines' as const,
      line: { color: C_YELLOW, width: 1, dash: 'dot' as const }, name: `${t('plot.trace.spectrum')} (${compareName})`,
      hovertemplate: `%{x:.1f} Hz — %{y:.1f} ${specUnit}<extra></extra>`,
    }] : []),
  ]

  const showLegend = !!compareId

  // Statistics of the waveform: one row per channel of the file, plus one per channel of the compared file
  const fileName = files.find(f => f.audio_id === audioId)?.name ?? ''
  const statRows = (data: WaveformData, name: string, colors: string[]) => {
    const chans = data.channels && data.channels.length > 1 ? data.channels : null
    return chans
      ? chans.flatMap((c, i) => c.stats ? [{ name: `${name} · ${c.name}`, color: colors[i] ?? colors[0], stats: c.stats }] : [])
      : data.stats ? [{ name, color: colors[0], stats: data.stats }] : []
  }
  const waveStatRows = [
    ...statRows(wf, fileName, [C_TEAL, C_VIOLET]),
    ...(wfCmp ? statRows(wfCmp, compareName, [C_BLUE, C_BLUE]) : []),
  ]

  // ── Cursors of the spectrum: right click opens a menu at the point pointed to ──────────────────────
  const spMags = spCurves[0].y
  const spFMax = spX?.[1] ?? sp.freqs[sp.freqs.length - 1] ?? 20000
  const closeMenu = () => setMenu(null)
  const openMenu = (e: React.MouseEvent) => {
    const gd = spGraph.current, box = spWrap.current?.getBoundingClientRect()
    const xa = gd?._fullLayout?.xaxis, ya = gd?._fullLayout?.yaxis
    if (!gd || !box || !xa || !ya) return
    const g = gd.getBoundingClientRect()
    const px = e.clientX - g.left - xa._offset, py = e.clientY - g.top - ya._offset
    if (px < 0 || px > xa._length || py < 0 || py > ya._length) return        // outside the plot area: leave the browser's menu
    e.preventDefault()
    const f = xa.p2d(px), level = ya.p2d(py)
    if (!(f > 0)) return
    setMenu({
      left: Math.max(0, Math.min(e.clientX - box.left, box.width - 330)),
      top: Math.max(0, Math.min(e.clientY - box.top, box.height - 230)),
      f, level,
    })
  }
  const menuItems = (m: { f: number; level: number }): MenuItem[] => {
    const pt = nearestPoint(sp.freqs, spMags, m.f)
    const pk = nearestPeak(sp.freqs, spMags, m.f)
    const hz = (v: number) => v.toFixed(v < 100 ? 1 : 0)
    return [
      { label: pt ? t('plot.menu.pin', { f: hz(pt.x), y: pt.y.toFixed(1), unit: specUnit }) : '', disabled: !pt, onClick: () => pt && setSpPins(p => [...p, pt]) },
      { label: pk ? t('plot.menu.peak', { f: hz(pk.x), y: pk.y.toFixed(1), unit: specUnit }) : '', disabled: !pk, onClick: () => pk && setSpPins(p => [...p, pk]) },
      { label: t('plot.menu.f0here', { f: hz(m.f) }), divider: true, onClick: () => setF0(Number(m.f.toFixed(1))) },
      { label: pk ? t('plot.menu.f0peak', { f: hz(pk.x) }) : '', disabled: !pk, onClick: () => pk && setF0(Number(pk.x.toFixed(1))) },
      { label: t('plot.menu.axisFrom', { f: hz(m.f) }), divider: true, onClick: () => setSpX([m.f, Math.max(spX?.[1] ?? 0, m.f * 1.01, sp.freqs[sp.freqs.length - 1] ?? 20000)]) },
      { label: t('plot.menu.axisTo', { f: hz(m.f) }), onClick: () => setSpX([Math.min(spX?.[0] ?? 20, m.f * 0.99), m.f]) },
      { label: t('plot.menu.clear'), divider: true, disabled: !f0 && spPins.length === 0, onClick: () => { setF0(null); setSpPins([]) } },
    ]
  }

  // The section being analysed, shaded on the (always whole) waveform
  const sectionShape: any[] = section
    ? [{
        type: 'rect', xref: 'x', yref: 'paper', x0: section[0], x1: section[1], y0: 0, y1: 1,
        fillcolor: 'rgba(80,184,158,0.16)', line: { color: C_TEAL, width: 1, dash: 'dot' }, layer: 'below',
      }]
    : []

  // A drag on the waveform marks the section (a drag that covers the file clears it; a tiny one is ignored)
  const dragSection = (e: any) => {
    const r = e?.range?.x
    if (!r) return
    const next = toSection(r[0], r[1], wf.duration_s, Math.max(0.01, wf.duration_s * 0.005))   // a drag near an edge means the edge
    if (next !== undefined) setSection(audioId, next)
  }

  return (
    <div className="flex flex-col h-full gap-1 overflow-y-auto sm:overflow-visible">
      <WaveStatsTable rows={waveStatRows} calibrated={!!wf.calibrated} />
      <ChartSwitch value={mv} onChange={setMv} />
      <div className={`items-center gap-2 px-2 shrink-0 flex-wrap text-[11px] ${mv === 'time' ? 'flex' : 'hidden sm:flex'}`}>
        {compareId && <CompareBadge name={compareName} color={C_BLUE} />}
        <span ref={cursorClock} className="font-mono tabular-nums text-orange shrink-0" style={{ display: 'none' }} />
        <div className="flex items-center gap-1" role="group" aria-label={t('plot.normal.dragAria')}>
          <span className="text-muted">{t('plot.normal.dragTo')}</span>
          {(['select', 'zoom'] as const).map(m => (
            <button key={m} onClick={() => setWfDrag(m)} aria-pressed={wfDrag === m}
              className={`px-1.5 py-0.5 rounded border transition-colors ${wfDrag === m ? 'bg-teal/20 border-teal/50 text-teal' : 'border-border text-muted hover:text-white'}`}>
              {m === 'select' ? t('plot.normal.select') : t('plot.normal.zoom')}
            </button>
          ))}
        </div>
        {wf.peak !== undefined && (
          <span
            className={`tabular-nums ${wf.peak >= 0.999 ? 'text-orange font-semibold' : 'text-muted'}`}
            title={t('plot.normal.peakTitle')}>
            {t('plot.normal.peakLevel', { db: wf.peak > 0 ? (20 * Math.log10(wf.peak)).toFixed(1) : '−∞' })}{wf.peak >= 0.999 ? ` · ${t('plot.normal.clipping')}` : ''}
          </span>
        )}
        {wfPins.length > 0 && (
          <button onClick={() => setWfPins([])}
            className="ml-auto px-2 py-0.5 text-muted hover:text-white border border-border rounded transition-colors">
            {t(wfPins.length > 1 ? 'plot.pins.clearMany' : 'plot.pins.clearOne', { n: wfPins.length })}
          </button>
        )}
      </div>
      <div className={pickCls(mv === 'time')} {...rightButtonFree}>
      <Plot data={wfData}
        layout={{ ...BASE_LAYOUT,
          xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.time'), ...(wfRange.current ? { range: wfRange.current, autorange: false } : {}) },
          yaxis: { ...BASE_LAYOUT.yaxis, title: isCalibrated ? t('plot.axis.pressure') : t('plot.axis.amplitude') },
          shapes: sectionShape,
          annotations: wfPins.map(p => makePinAnnotation(p, false, '.3f', '.4f')),
          dragmode: wfDrag, selectdirection: 'h',
          newselection: { mode: 'gradual' },
          activeselection: { fillcolor: 'rgba(80,184,158,0.10)', opacity: 0.3 },
          showlegend: showLegend || wfStereo, legend: LEGEND_INSIDE } as any}
        config={PLOT_CONFIG} className="w-full h-full" useResizeHandler
        onClick={(evt: any) => { const pt = evt.points?.[0]; if (!pt) return; setWfPins(p => [...p, {x: pt.x, y: pt.y}]) }}
        onSelected={dragSection}
        onInitialized={(_f: any, gd: any) => { wfGraph.current = gd; drawCursor.current() }}
        onUpdate={(_f: any, gd: any) => { wfGraph.current = gd; drawCursor.current() }}
        onRelayout={(e: any) => {
          if (e?.dragmode === 'select' || e?.dragmode === 'zoom' || e?.dragmode === 'pan') setWfDrag(e.dragmode)
          if (e?.['xaxis.range[0]'] != null) wfRange.current = [e['xaxis.range[0]'], e['xaxis.range[1]']]
          else if (e?.['xaxis.range']) wfRange.current = e['xaxis.range']
          else if (e?.['xaxis.autorange']) wfRange.current = null
          drawCursor.current()
        }}
        style={{ width:'100%', height:'100%' }} />
      <div ref={cursorLine} className="absolute left-0 w-[1.5px] bg-orange pointer-events-none"
        style={{ display: 'none', top: 0, height: 0 }} />
      </div>
      <div className={mv === 'freq' ? '' : 'hidden sm:block'}>
        <SpectrumBar
          x={spX} y={spY} nyquist={sp.freqs[sp.freqs.length - 1] ?? 20000} unit={specUnit} f0={f0} pins={spPins.length}
          onX={setSpX} onY={setSpY} onF0={setF0} onClearPins={() => setSpPins([])}
        />
      </div>
      <div ref={spWrap} className={pickCls(mv === 'freq')} onContextMenu={openMenu} {...rightButtonFree}>
        <Plot data={spData}
          layout={{ ...BASE_LAYOUT,
            xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.frequency'), type: 'log',
              ...(spX ? { range: [Math.log10(spX[0]), Math.log10(spX[1])], autorange: false } : {}) },
            yaxis: { ...BASE_LAYOUT.yaxis, title: isCalibrated ? t('plot.axis.spl') : t('plot.axis.magnitudeDbfs'),
              ...(spY ? { range: spY, autorange: false } : {}) },
            shapes: f0 ? harmonicShapes(f0, spFMax, C_ORANGE) : [],
            annotations: [
              ...spPins.map(p => makePinAnnotation(p, true, '.0f', '.1f', specUnit)),
              ...(f0 ? harmonicLabels(f0, spFMax, C_ORANGE) : []),
            ],
            showlegend: showLegend || stereo,
            legend: LEGEND_INSIDE } as any}
          config={PLOT_CONFIG} className="w-full h-full" useResizeHandler
          onInitialized={(_f: any, gd: any) => { spGraph.current = gd }}
          onUpdate={(_f: any, gd: any) => { spGraph.current = gd }}
          onRelayout={(e: any) => {
            if (e?.['xaxis.range[0]'] != null) setSpX([10 ** e['xaxis.range[0]'], 10 ** e['xaxis.range[1]']])
            else if (e?.['xaxis.autorange']) setSpX(null)
            if (e?.['yaxis.range[0]'] != null) setSpY([e['yaxis.range[0]'], e['yaxis.range[1]']])
            else if (e?.['yaxis.autorange']) setSpY(null)
          }}
          style={{ width:'100%', height:'100%' }} />
        {menu && (
          <PlotMenu left={menu.left} top={menu.top} items={menuItems(menu)} label={t('plot.menu.label')} onClose={closeMenu} />
        )}
      </div>
    </div>
  )
}

// ─── Bark scale badge ───────────────────────────────────────────────────────
function BarkBadge({ isHMS }: { isHMS: boolean }) {
  return isHMS
    ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-purple-900/40 text-purple-300 border border-purple-700/50">
        <span className="w-1.5 h-1.5 rounded-full bg-purple-400 inline-block" />
        Bark HMS (ECMA-418-2)
      </span>
    : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-900/40 text-sky-300 border border-sky-700/50">
        <span className="w-1.5 h-1.5 rounded-full bg-sky-400 inline-block" />
        Bark (ISO 532-1)
      </span>
}

function MetricView({ sessionId, audioId, metricKey, compareId, compareName, section }: {
  sessionId: string; audioId: string; metricKey: string; compareId: string|null; compareName: string; section: Section|null
}) {
  const t = useT()
  const [mv, setMv] = useChartPick()
  const { fieldType, precision, files, setMetricKey } = useStore()
  const secKey = sectionKey(section)
  const workSeconds = section ? section[1] - section[0] : (files.find(f => f.audio_id === audioId)?.duration_s ?? 0)
  // `job` is this request's name on the server (it tells where it is in the queue); `retry` asks again after a cancel
  const [job, setJob] = useState('')
  const [retry, setRetry] = useState(0)
  const [cancelled, setCancelled] = useState<{ wasRunning: boolean } | null>(null)
  const ctrlRef = useRef<AbortController | null>(null)
  const [rawData,  setData]    = useState<MetricResult|null>(null)
  // the server names the axes in English; they are shown in the language of the interface
  const data = useMemo(() => (rawData ? { ...rawData, y_label: serverLabel(rawData.y_label, t), threshold_label: serverLabel(rawData.threshold_label, t) } : null), [rawData, t])
  const [dataCmp,  setDataCmp] = useState<MetricResult|null>(null)
  const [err,      setErr]     = useState('')
  const [freqPins, setFreqPins] = useState<{x: number; y: number}[]>([])
  const freqZoom  = useRef<{ x?: [number,number]; y?: [number,number] }>({})

  // Reset zoom + pins when metric/file changes
  useEffect(() => { freqZoom.current = {}; setFreqPins([]) }, [sessionId, audioId, metricKey])

  // ESC clears pins
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFreqPins([]) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    let alive = true      // a slow answer for an old section must not replace the newer one
    const ctrl = new AbortController()
    ctrlRef.current = ctrl
    const name = newClientId()
    setJob(name); setCancelled(null)
    setData(null); setDataCmp(null); setErr('')
    const primary = fetchMetric(sessionId, audioId, metricKey as any, fieldType, section, { signal: ctrl.signal, job: name, precision }).then(d => { if (alive) setData(d) })
    const compare = compareId
      ? fetchMetric(sessionId, compareId, metricKey as any, fieldType, section, { signal: ctrl.signal, precision }).then(d => { if (alive) setDataCmp(d) })
      : Promise.resolve()
    Promise.all([primary, compare])
      .catch(e => { if (alive && !isAbort(e)) setErr(e instanceof SessionExpiredError ? '__session_expired__' : e.message) })
    return () => { alive = false; ctrl.abort() }       // leaving (or a new section) cancels what is still on its way
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioId, metricKey, fieldType, precision, compareId, secKey, retry])

  if (err === '__session_expired__') return <SessionExpiredMsg />
  if (err) return <ErrorMsg msg={err} />
  if (cancelled) return <CancelledPanel wasRunning={cancelled.wasRunning} onRetry={() => setRetry(n => n + 1)} onBack={() => setMetricKey('none')} />
  if (!data) return (
    <MetricProgress label={metricKey.replace(/_/g, ' ')} metricKey={metricKey} timingKey={metricKey === 'tonality_ecma' && precision === 'fast' ? 'tonality_ecma_fast' : undefined} job={job} duration={workSeconds}
      onCancel={(wasRunning) => { setCancelled({ wasRunning }); ctrlRef.current?.abort() }} />
  )
  if (data.error) return <ErrorMsg msg={data.error + (data.requires ? ` ${t('plot.metric.requires', { what: data.requires })}` : '')} />

  const xLabel   = (data.x_label ?? '').toLowerCase()
  const isBark   = xLabel.includes('bark')
  const isHMS    = xLabel.includes('hms')
  const barkTicks = isBark && data.x_axis ? barkTicksHz(data.x_axis, isHMS) : null
  const showLegend = !!compareId

  const globalLabel = data.global !== undefined
    ? `${t('plot.metric.global')} ${data.global.toFixed(3)} ${data.unit ?? ''}`
    : ''
  const globalCmpLabel = dataCmp?.global !== undefined
    ? ` · ${t('plot.metric.compare')} ${dataCmp.global.toFixed(3)} ${dataCmp.unit ?? ''}`
    : ''

  const isBar  = data.plot_type === 'bar'
  const isLine = data.plot_type === 'line'

  const makeFreqTrace = (d: MetricResult, color: string, name: string, dash?: string): Plotly.Data => {
    const lineStyle: any = { color, width: 1.5, ...(dash ? { dash } : {}) }
    if (isBar) return { x: d.x_axis, y: d.y_axis, type: 'bar', marker: { color, opacity: 0.7 }, name,
      hovertemplate: `%{x} — %{y:.4f}<extra></extra>` }
    if (isLine) return { x: d.x_axis, y: d.y_axis, type: 'scatter', mode: 'lines+markers',
      line: lineStyle, marker: { size: 5, color }, name,
      hovertemplate: `%{x:.2f} ${d.x_label??''} — %{y:.4f}<extra></extra>` }
    return { x: d.x_axis, y: d.y_axis, type: 'scatter', mode: 'lines',
      fill: dash ? undefined : 'tozeroy',
      fillcolor: dash ? undefined : `${color}18`,
      line: lineStyle, name,
      hovertemplate: `%{x:.2f} ${d.x_label??''} — %{y:.4f}<extra></extra>` }
  }

  const freqTraces: Plotly.Data[] = [
    makeFreqTrace(data, C_ORANGE, data.y_label ?? metricKey),
    ...(dataCmp && dataCmp.x_axis ? [makeFreqTrace(dataCmp, C_YELLOW, `${data.y_label ?? metricKey} (${compareName})`, 'dot')] : []),
  ]

  if (data.threshold !== undefined && data.x_axis?.length) {
    freqTraces.push({
      x: [Math.min(...data.x_axis), Math.max(...data.x_axis)],
      y: [data.threshold, data.threshold],
      type: 'scatter', mode: 'lines',
      line: { color: '#d35400', width: 2, dash: 'dash' },
      name: data.threshold_label ?? t('plot.trace.threshold'),
    } as any)
  }

  const timeTraces: Plotly.Data[] = data.time_data ? [
    { x: data.time_data.t, y: data.time_data.values, type: 'scatter', mode: 'lines',
      line: { color: C_TEAL, width: 1.5 }, name: t('plot.trace.timeVarying'),
      hovertemplate: `%{x:.2f} s — %{y:.4f} ${data.unit??''}<extra></extra>` },
    ...(dataCmp?.time_data ? [{
      x: dataCmp.time_data.t, y: dataCmp.time_data.values, type: 'scatter' as const, mode: 'lines' as const,
      line: { color: C_BLUE, width: 1.5, dash: 'dot' as const },
      name: `${t('plot.trace.timeVarying')} (${compareName})`,
      hovertemplate: `%{x:.2f} s — %{y:.4f} ${dataCmp.unit??''}<extra></extra>`,
    }] : []),
  ] : []

  const timeYLabel = (data.y_label ?? '').split('(')[0].trim() + ` (${data.unit ?? ''})`

  return (
    <div className="flex flex-col h-full gap-1 overflow-y-auto sm:overflow-visible">
      <div className="flex items-center gap-3 px-2 py-1 shrink-0 flex-wrap">
        {globalLabel && <span className="text-xs text-teal font-semibold">{globalLabel}{globalCmpLabel && <span className="text-blue-400 font-normal">{globalCmpLabel}</span>}</span>}
        {isBark && <BarkBadge isHMS={isHMS} />}
        {compareId && <CompareBadge name={compareName} color={C_BLUE} />}
      </div>

      <MetricStats metricKey={metricKey} rows={[
        ...(data.stats ? [{ name: files.find(f => f.audio_id === audioId)?.name ?? '', color: C_TEAL, stats: data.stats, unit: data.unit ?? '' }] : []),
        ...(dataCmp?.stats ? [{ name: compareName, color: C_BLUE, stats: dataCmp.stats, unit: dataCmp.unit ?? '' }] : []),
      ]} />

      {data.time_data && <ChartSwitch value={mv} onChange={setMv} />}

      {data.time_data && (
        <div className={pickCls(mv === 'time')}>
        <Plot data={timeTraces}
          layout={{ ...BASE_LAYOUT, margin: { ...BASE_LAYOUT.margin, t: 8 },
            xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.time') },
            yaxis: { ...BASE_LAYOUT.yaxis, title: timeYLabel },
            showlegend: showLegend, legend: LEGEND_INSIDE }}
          config={PLOT_CONFIG} className="w-full h-full" useResizeHandler style={{ width:'100%', height:'100%' }} />
        </div>
      )}

      <div className={pickCls(!data.time_data || mv === 'freq')}>
      <Plot data={[...freqTraces, ...(barkTicks && data.x_axis?.length ? [{
          x: [Math.min(...data.x_axis), Math.max(...data.x_axis)],
          y: [null, null], type: 'scatter' as const, mode: 'lines' as const,
          xaxis: 'x2', yaxis: 'y', showlegend: false,
          hoverinfo: 'skip' as const, line: { color: 'transparent', width: 0 },
        }] : [])]}
        layout={{
          ...BASE_LAYOUT, margin: { ...BASE_LAYOUT.margin, t: isBark ? 52 : 8 },
          xaxis: { ...BASE_LAYOUT.xaxis, title: data.x_label },
          yaxis: { ...BASE_LAYOUT.yaxis, title: data.y_label },
          shapes: [],
          annotations: freqPins.map(p => ({
            x: p.x, y: p.y, xref: 'x' as const, yref: 'y' as const,
            text: `${typeof p.x === 'number' ? p.x.toFixed(2) : p.x}, ${p.y.toFixed(3)}`,
            showarrow: true, arrowhead: 2, arrowsize: 0.8, arrowcolor: '#8ab4c9',
            font: { size: 9, color: '#e2e8f0' }, bgcolor: 'rgba(17,28,40,0.85)',
            bordercolor: '#8ab4c9', borderwidth: 1, borderpad: 3,
          })),
          bargap: 0.1, showlegend: showLegend,
          legend: LEGEND_INSIDE,
          ...(barkTicks ? {
            xaxis2: {
              overlaying: 'x', side: 'top',
              range: data.x_axis?.length ? [Math.min(...data.x_axis), Math.max(...data.x_axis)] : undefined,
              tickvals: barkTicks.tickvals, ticktext: barkTicks.ticktext,
              title: { text: t('plot.axis.frequency'), font: { color: '#8ab4c9', size: 10 } },
              color: '#8ab4c9', gridcolor: 'transparent', showgrid: false,
              zeroline: false, fixedrange: true,
            } as any,
          } : {}),
        }}
        config={PLOT_CONFIG} className="flex-1 w-full" useResizeHandler
        onClick={(evt: any) => {
          const pt = evt.points?.[0]; if (!pt) return
          setFreqPins(p => [...p, { x: pt.x, y: pt.y }])
        }}
        onRelayout={(evt: any) => {
          if (evt['xaxis.range[0]'] != null) freqZoom.current = { x: [evt['xaxis.range[0]'], evt['xaxis.range[1]']], y: freqZoom.current.y }
          if (evt['yaxis.range[0]'] != null) freqZoom.current = { x: freqZoom.current.x, y: [evt['yaxis.range[0]'], evt['yaxis.range[1]']] }
          if (evt['xaxis.autorange'] || evt['yaxis.autorange']) freqZoom.current = {}
        }}
        style={{ width:'100%', height:'100%' }} />
      </div>

      {freqPins.length > 0 && (
        <div className="flex items-center px-2 shrink-0">
          <button onClick={() => setFreqPins([])}
            className="text-[11px] text-muted hover:text-white border border-border rounded px-2 py-0.5 transition-colors">
            {t(freqPins.length > 1 ? 'plot.pins.clearMany' : 'plot.pins.clearOne', { n: freqPins.length })}
          </button>
        </div>
      )}
    </div>
  )
}

/** Left / right switch for the charts that show one channel at a time (the spectrogram). */
function ChannelToggle({ channel, onChange }: { channel: number; onChange: (c: number) => void }) {
  const t = useT()
  return (
    <div className="absolute top-1 left-14 z-10 flex rounded border border-border overflow-hidden text-[11px]" role="group" aria-label={t('plot.channel.aria')}>
      {[0, 1].map(c => (
        <button key={c} onClick={() => onChange(c)} aria-pressed={channel === c}
          className={`px-2 py-0.5 transition-colors ${channel === c ? 'bg-teal/20 text-teal' : 'bg-panel/80 text-muted hover:text-white'}`}>
          {c === 0 ? 'L' : 'R'}
        </button>
      ))}
    </div>
  )
}

function SpectrogramView({ sessionId, audioId, section }: { sessionId: string; audioId: string; section: Section|null }) {
  const t = useT()
  const { spectrogramParams, setSpectrogramParams } = useStore()
  const secKey = sectionKey(section)
  const [data, setData]               = useState<SpectrogramData|null>(null)
  const [err, setErr]                 = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [pending, setPending]         = useState(spectrogramParams)
  const [applied, setApplied]         = useState(spectrogramParams)

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    setData(null); setErr('')
    fetchSpectrogram(sessionId, audioId, applied, section, ctrl.signal).then(d => { if (alive) setData(d) })
      .catch(e => { if (alive && !isAbort(e)) setErr(e instanceof SessionExpiredError ? '__session_expired__' : e.message) })
    return () => { alive = false; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioId, applied, secKey])

  const handleApply = () => { setSpectrogramParams(pending); setApplied({...pending}); setShowSettings(false) }
  const chooseChannel = (channel: number) => { setSpectrogramParams({ channel }); setApplied(a => ({ ...a, channel })) }
  const stereo = (useStore.getState().files.find(f => f.audio_id === audioId)?.channels ?? 1) > 1
  const channel = applied.channel ?? 0

  if (err === '__session_expired__') return <SessionExpiredMsg />
  if (err) return <ErrorMsg msg={err} />

  const cmapMap: Record<string,string> = { magma:'Magma', viridis:'Viridis', inferno:'Inferno', plasma:'Plasma', hot:'Hot', jet:'Jet', greys:'Greys' }
  const colorscale = data ? (cmapMap[data.cmap ?? applied.cmap] ?? 'Magma') : 'Magma'
  const yAxisType  = data ? ((data.freq_scale ?? applied.freq_scale)==='log' ? 'log' : 'linear') : 'log'

  return (
    <div className="plot-fill w-full">
      <GearButton onClick={() => { setPending({...applied}); setShowSettings(!showSettings) }} />
      {stereo && <ChannelToggle channel={channel} onChange={chooseChannel} />}
      {showSettings && (
        <SettingsOverlay onClose={() => setShowSettings(false)}>
          <SpectrogramSettings params={pending} onChange={p => setPending(prev => ({...prev,...p}))} />
          <button onClick={handleApply} className="btn btn-primary btn-sm mt-2 w-full">{t('plot.apply')}</button>
        </SettingsOverlay>
      )}
      {!data ? <Spinner /> : (
        <Plot data={[{ x: data.t, y: data.f, z: data.power_db, type: 'heatmap', colorscale,
          zmin: data.z_min, zmax: data.z_max,
          colorbar: { title: 'dB', thickness: 12, len: 0.8, tickfont: { size: 9, color: '#8ab4c9' } },
          hovertemplate: '%{x:.3f} s — %{y:.0f} Hz — %{z:.1f} dB<extra></extra>' } as any]}
          layout={{ ...BASE_LAYOUT, margin: { l: 58, r: 64, t: 32, b: 48 },
            xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.time') },
            yaxis: { ...BASE_LAYOUT.yaxis, title: t('plot.axis.frequency'), type: yAxisType as any } }}
          config={PLOT_CONFIG} className="w-full h-full" useResizeHandler style={{ width:'100%', height:'100%' }} />
      )}
    </div>
  )
}

function OctaveView({ sessionId, audioId, section }: { sessionId: string; audioId: string; section: Section|null }) {
  const t = useT()
  const { octaveWeighting, setOctaveWeighting, calibrations } = useStore()
  const secKey = sectionKey(section)
  const [data, setData]               = useState<OctaveData|null>(null)
  const [err, setErr]                 = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [pending, setPending]         = useState(octaveWeighting)
  const calKey = calibrations[audioId] ?? null

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    setData(null); setErr('')
    fetchOctave(sessionId, audioId, octaveWeighting, section, ctrl.signal).then(d => { if (alive) setData(d) })
      .catch(e => { if (alive && !isAbort(e)) setErr(e instanceof SessionExpiredError ? '__session_expired__' : e.message) })
    return () => { alive = false; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioId, octaveWeighting, calKey, secKey])

  const handleApply = () => { setOctaveWeighting(pending); setShowSettings(false) }
  if (err === '__session_expired__') return <SessionExpiredMsg />
  if (err) return <ErrorMsg msg={err} />

  const octCalibrated = data?.calibrated ?? false
  const octUnit = octCalibrated
    ? (octaveWeighting === 'A' ? 'dB(A) SPL' : octaveWeighting === 'C' ? 'dB(C) SPL' : 'dB SPL re 20 µPa')
    : (octaveWeighting === 'A' ? 'dB(A)' : 'dBFS')
  const yLabel = t('plot.axis.rmsLevel', { unit: octUnit })

  // Bars grow up from the bottom of the axis, so a louder band is a taller bar.
  // (Plotly draws negative values from 0 dB downwards, which inverted the chart.)
  const levels   = data?.levels_db ?? []
  const octCurves = data?.channels && data.channels.length > 1
    ? data.channels.map((c, i) => ({ levels: c.levels_db, color: i === 0 ? C_ORANGE : C_RIGHT, name: t(i === 0 ? 'plot.trace.left' : 'plot.trace.right') }))
    : [{ levels, color: C_ORANGE, name: t('plot.trace.rms') }]
  const valid    = octCurves.flatMap(c => c.levels).filter((v): v is number => v != null)
  const floorDb  = valid.length ? Math.max(-160, Math.floor((Math.min(...valid) - 6) / 10) * 10) : -120
  const topDb    = valid.length ? Math.ceil((Math.max(...valid) + 4) / 10) * 10 : 0

  return (
    <div className="plot-fill w-full">
      <GearButton onClick={() => { setPending(octaveWeighting); setShowSettings(!showSettings) }} />
      {showSettings && (
        <SettingsOverlay onClose={() => setShowSettings(false)}>
          <OctaveSettings weighting={pending} onChange={setPending} />
          <button onClick={handleApply} className="btn btn-primary btn-sm mt-2 w-full">{t('plot.apply')}</button>
        </SettingsOverlay>
      )}
      {!data ? <Spinner /> : (
        <Plot data={octCurves.map(c => ({ x: data.centres_hz.map(String), y: c.levels.map(v => v == null ? null : v - floorDb),
          base: floorDb, customdata: c.levels,
          type: 'bar', marker: { color: c.color, opacity: 0.85 }, name: c.name,
          hovertemplate: `%{x} Hz — %{customdata:.1f} ${octUnit}<extra></extra>` }) as any)}
          layout={{ ...BASE_LAYOUT, barmode: 'group', showlegend: octCurves.length > 1,
            legend: LEGEND_INSIDE,
            xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.octCentre'), type: 'category', tickangle: -45, tickfont: { size: 9 } },
            yaxis: { ...BASE_LAYOUT.yaxis, title: yLabel, range: [floorDb, topDb] }, bargap: 0.15 }}
          config={PLOT_CONFIG} className="w-full h-full" useResizeHandler style={{ width:'100%', height:'100%' }} />
      )}
    </div>
  )
}

function EnvelopeView({ sessionId, audioId, section }: { sessionId: string; audioId: string; section: Section|null }) {
  const t = useT()
  const [mv, setMv] = useChartPick()
  const { envelopeParams, setEnvelopeParams } = useStore()
  const secKey = sectionKey(section)
  const [data, setData]               = useState<EnvelopeData|null>(null)
  const [err, setErr]                 = useState('')
  const [showSettings, setShowSettings] = useState(false)
  const [pending, setPending]         = useState(envelopeParams)
  const [applied, setApplied]         = useState(envelopeParams)

  useEffect(() => {
    let alive = true
    const ctrl = new AbortController()
    setData(null); setErr('')
    fetchEnvelope(sessionId, audioId, applied, section, ctrl.signal).then(d => { if (alive) setData(d) })
      .catch(e => { if (alive && !isAbort(e)) setErr(e instanceof SessionExpiredError ? '__session_expired__' : e.message) })
    return () => { alive = false; ctrl.abort() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, audioId, applied, secKey])

  const handleApply = () => { setEnvelopeParams(pending); setApplied({...pending}); setShowSettings(false) }
  if (err === '__session_expired__') return <SessionExpiredMsg />
  if (err) return <ErrorMsg msg={err} />

  // Two channels: left in teal / amber / orange, right in violet / pink / blue
  const envStereo = !!data?.channels && data.channels.length > 1
  const envCurves = data
    ? (envStereo
        ? data.channels!.map((c, i) => ({ ...c, tag: i === 0 ? ' L' : ' R',
            sigColor: i === 0 ? C_TEAL : C_VIOLET, envColor: i === 0 ? C_AMBER : C_PINK, specColor: i === 0 ? C_ORANGE : C_RIGHT }))
        : [{ signal: data.signal, envelope: data.envelope, f_env: data.f_env, env_spec_db: data.env_spec_db, tag: '',
            sigColor: C_TEAL, envColor: C_AMBER, specColor: C_ORANGE }])
    : []

  return (
    <div className="relative flex flex-col h-full gap-1 overflow-y-auto sm:overflow-visible">
      <GearButton onClick={() => { setPending({...applied}); setShowSettings(!showSettings) }} />
      {showSettings && (
        <SettingsOverlay onClose={() => setShowSettings(false)}>
          <EnvelopeSettings params={pending} onChange={p => setPending(prev => ({...prev,...p}))} />
          <button onClick={handleApply} className="btn btn-primary btn-sm mt-2 w-full">{t('plot.apply')}</button>
        </SettingsOverlay>
      )}
      {!data ? <Spinner /> : (
        <>
          <div className="pt-8 sm:pt-0 shrink-0"><ChartSwitch value={mv} onChange={setMv} /></div>
          <div className={pickCls(mv === 'time')}>
          <Plot data={envCurves.flatMap(c => [
            { x: data.t, y: c.signal,   type: 'scatter' as const, mode: 'lines' as const, line: { color: c.sigColor, width: 0.8 }, name: `${t('plot.trace.signal')}${c.tag}`,   hovertemplate: '%{x:.3f} s — %{y:.4f}<extra></extra>' },
            { x: data.t, y: c.envelope, type: 'scatter' as const, mode: 'lines' as const, line: { color: c.envColor, width: 1.5 }, name: `${t('plot.trace.envelope')}${c.tag}`, hovertemplate: '%{x:.3f} s — %{y:.4f}<extra></extra>' },
          ])}
            layout={{ ...BASE_LAYOUT,
              xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.time') },
              yaxis: { ...BASE_LAYOUT.yaxis, title: t('plot.axis.amplitude') },
              legend: LEGEND_INSIDE }}
            config={PLOT_CONFIG} className="w-full h-full" useResizeHandler style={{ width:'100%', height:'100%' }} />
          </div>
          <div className={pickCls(mv === 'freq')}>
          <Plot data={envCurves.map(c => ({ x: c.f_env, y: c.env_spec_db, type: 'scatter' as const, mode: 'lines' as const,
            line: { color: c.specColor, width: 1 }, name: `${t('plot.trace.envSpectrum')}${c.tag}`,
            hovertemplate: '%{x:.1f} Hz — %{y:.1f} dB<extra></extra>' }))}
            layout={{ ...BASE_LAYOUT, showlegend: envCurves.length > 1,
              legend: LEGEND_INSIDE,
              xaxis: { ...BASE_LAYOUT.xaxis, title: t('plot.axis.frequency'), type: 'log' },
              yaxis: { ...BASE_LAYOUT.yaxis, title: t('plot.axis.magnitudeDb') } }}
            config={PLOT_CONFIG} className="w-full h-full" useResizeHandler style={{ width:'100%', height:'100%' }} />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Root ────────────────────────────────────────────────────────────────────
export default function PlotPanel() {
  const { sessionId, selectedId, viewMode, metricKey, compareId, files, sections } = useStore()
  const t = useT()
  const compareName = compareId ? (files.find(f => f.audio_id === compareId)?.name ?? '') : ''

  if (!selectedId) {
    return (
      <div className="flex flex-1 items-center justify-center text-muted text-xs">
        {t('plot.empty')}
      </div>
    )
  }

  const section = sections[selectedId] ?? null
  const duration = files.find(f => f.audio_id === selectedId)?.duration_s ?? 0

  let view: React.ReactNode = null
  if (viewMode === 'normal' && metricKey !== 'none') {
    view = <MetricView sessionId={sessionId} audioId={selectedId} metricKey={metricKey} compareId={compareId} compareName={compareName} section={section} />
  } else if (viewMode === 'normal') {
    view = <NormalView sessionId={sessionId} audioId={selectedId} compareId={compareId} compareName={compareName} section={section} />
  } else if (viewMode === 'spectrogram') {
    view = <SpectrogramView sessionId={sessionId} audioId={selectedId} section={section} />
  } else if (viewMode === 'octave') {
    view = <OctaveView sessionId={sessionId} audioId={selectedId} section={section} />
  } else if (viewMode === 'envelope') {
    view = <EnvelopeView sessionId={sessionId} audioId={selectedId} section={section} />
  }

  return (
    <div className="flex flex-col h-full gap-1">
      <SectionBar key={selectedId} audioId={selectedId} duration={duration} />
      <div className="relative flex-1 min-h-0">
        <div className="absolute inset-0">{view}</div>
      </div>
    </div>
  )
}
