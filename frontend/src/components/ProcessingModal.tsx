import { toast } from '../store/useToast'
import { useT } from '../i18n'
import { useEffect, useState } from 'react'
import { useDialog } from '../hooks/useDialog'
import Plot from './Plot'
import { X, Loader2 } from 'lucide-react'
import clsx from 'clsx'
import { AudioFile } from '../types'
import { fetchWaveform } from '../api/audioApi'
import { applyFilter, applyWindow, applyWeighting, applyLoudnessAdj } from '../api/processingApi'

// ── Colours ───────────────────────────────────────────────────────────────────
const C_TEAL   = '#50b89e'
const C_ORANGE = '#ed693b'

// ── Types ─────────────────────────────────────────────────────────────────────
type Tab = 'filter' | 'window' | 'weighting' | 'loudness'

const FILTER_TYPES  = ['Band-pass', 'Low-pass', 'High-pass', 'Band-reject', '1/3-Octave band', 'Harmonic Notch']
const WINDOW_TYPES  = ['Hanning', 'Hamming', 'Blackman', 'Bartlett', 'Kaiser', 'Rectangular']
const WEIGHTING_OPTS = ['None', 'A-weighting', 'C-weighting']

// Texts shown for the option values above (the values themselves are what the server receives)
const FILTER_LABEL_KEYS: Record<string, string> = {
  'Band-pass': 'pp.proc.ftBandPass', 'Low-pass': 'pp.proc.ftLowPass', 'High-pass': 'pp.proc.ftHighPass',
  'Band-reject': 'pp.proc.ftBandReject', '1/3-Octave band': 'pp.proc.ftOctave', 'Harmonic Notch': 'pp.proc.ftHarmonic',
}
const WEIGHTING_LABEL_KEYS: Record<string, string> = {
  'None': 'pp.proc.wNone', 'A-weighting': 'pp.proc.wA', 'C-weighting': 'pp.proc.wC',
}

// 1/3-octave band centres (ISO 266)
const THIRD_OCT: number[] = [
  20,25,31.5,40,50,63,80,100,125,160,
  200,250,315,400,500,630,800,1000,1250,1600,
  2000,2500,3150,4000,5000,6300,8000,10000,12500,16000,20000,
]

// ── Window math ───────────────────────────────────────────────────────────────
function computeWindow(type: string, n: number): number[] {
  return Array.from({ length: n }, (_, i) => {
    const t = i / (n - 1)
    if (type === 'Rectangular') return 1
    if (type === 'Hanning')     return 0.5 * (1 - Math.cos(2 * Math.PI * t))
    if (type === 'Hamming')     return 0.54 - 0.46 * Math.cos(2 * Math.PI * t)
    if (type === 'Blackman')    return 0.42 - 0.5*Math.cos(2*Math.PI*t) + 0.08*Math.cos(4*Math.PI*t)
    if (type === 'Bartlett')    return 1 - Math.abs(2 * t - 1)
    if (type === 'Kaiser') {
      const beta = 8, half = 0.5
      const x = 1 - ((t - half) / half) ** 2
      return x > 0 ? Math.cosh(beta * Math.sqrt(x)) / Math.cosh(beta) : 0
    }
    return 1
  })
}

// ── SVG Preview components ────────────────────────────────────────────────────

function FilterPreview({ type }: { type: string }) {
  const W = 200, H = 52, px = 8, py = 6
  const bw = W - 2*px, bh = H - 2*py
  const bot = py + bh, left = px, right = px + bw
  const fill = 'rgba(80,184,158,0.12)'
  const stroke = C_TEAL

  let path = '', fpath = ''
  if (type === 'Low-pass') {
    path  = `M${left},${py} L${left+bw*.5},${py} C${left+bw*.63},${py} ${left+bw*.7},${bot} ${right},${bot}`
    fpath = path + ` L${left},${bot} Z`
  } else if (type === 'High-pass') {
    path  = `M${left},${bot} C${left+bw*.3},${bot} ${left+bw*.37},${py} ${left+bw*.5},${py} L${right},${py}`
    fpath = path + ` L${right},${bot} Z`
  } else if (type === 'Band-pass') {
    path  = `M${left},${bot} C${left+bw*.15},${bot} ${left+bw*.28},${py} ${left+bw*.38},${py} L${left+bw*.62},${py} C${left+bw*.72},${py} ${left+bw*.85},${bot} ${right},${bot}`
    fpath = path + ' Z'
  } else if (type === 'Band-reject') {
    path  = `M${left},${py} L${left+bw*.28},${py} C${left+bw*.38},${py} ${left+bw*.44},${bot} ${left+bw*.5},${bot} C${left+bw*.56},${bot} ${left+bw*.62},${py} ${left+bw*.72},${py} L${right},${py}`
    fpath = path + ` L${right},${bot} L${left},${bot} Z`
  } else if (type === 'Harmonic Notch') {
    const sp = bw / 6
    path = `M${left},${py+bh*.15}`
    for (let i = 1; i <= 5; i++) {
      const nx = left + i*sp, sw = sp*0.08
      path += ` L${nx-sw},${py+bh*.15} L${nx},${bot} L${nx+sw},${py+bh*.15}`
    }
    path += ` L${right},${py+bh*.15}`
    fpath = ''
  } else if (type === '1/3-Octave band') {
    const bars = [0.85,0.60,0.42,0.28,0.20,0.28,0.42,0.60,0.85]
    return (
      <svg width={W} height={H} className="shrink-0">
        {bars.map((hf, i) => {
          const bwi = bw / bars.length, x0 = left + i*bwi + 1
          const barH = bh * hf
          return <rect key={i} x={x0} y={bot - barH} width={bwi-2} height={barH}
            fill={fill} stroke={stroke} strokeWidth="1" rx="1" />
        })}
      </svg>
    )
  }

  return (
    <svg width={W} height={H} className="shrink-0">
      {fpath && <path d={fpath} fill={fill} />}
      <path d={path} fill="none" stroke={stroke} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WindowPreview({ type }: { type: string }) {
  const W = 200, H = 52, px = 8, py = 6, N = 100
  const bw = W - 2*px, bh = H - 2*py, bot = py+bh, left = px
  const vals = computeWindow(type, N)
  const mn = Math.min(...vals), mx = Math.max(...vals), span = mx - mn || 1
  const norm = vals.map(v => (v - mn) / span)
  const pts  = norm.map((v, i) => `${left + (i/(N-1))*bw},${bot - v*bh}`).join(' ')
  const fill = `${left},${bot} ` + pts + ` ${left+bw},${bot}`
  return (
    <svg width={W} height={H} className="shrink-0">
      <polygon points={fill} fill="rgba(80,184,158,0.12)" />
      <polyline points={pts} fill="none" stroke={C_TEAL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WeightingPreview({ curve }: { curve: string }) {
  const W = 200, H = 52, px = 8, py = 6, N = 120
  const bw = W - 2*px, bh = H - 2*py, bot = py+bh, left = px
  const aWeight = (f: number) => {
    const f2 = f*f
    const num = 12200**2 * f2*f2
    const den = (f2+20.6**2)*Math.sqrt((f2+107.7**2)*(f2+737.9**2))*(f2+12200**2)
    return 20*Math.log10(Math.max(num/den,1e-12)) + 2
  }
  const cWeight = (f: number) => {
    const f2 = f*f
    const num = 12200**2 * f2
    const den = (f2+20.6**2)*(f2+12200**2)
    return 20*Math.log10(Math.max(num/den,1e-12)) + 0.06
  }
  const freqs = Array.from({ length: N }, (_, i) => 20 * Math.pow(1000, i/(N-1)))
  let dbs: number[]
  if (curve === 'A-weighting')      dbs = freqs.map(aWeight)
  else if (curve === 'C-weighting') dbs = freqs.map(cWeight)
  else                              dbs = Array(N).fill(0)
  const mn = Math.min(...dbs), mx = Math.max(...dbs), span = mx - mn || 1
  const norm = dbs.map(d => 0.15 + 0.70*((d-mn)/span))
  const pts  = norm.map((v, i) => `${left + (i/(N-1))*bw},${bot - v*bh}`).join(' ')
  const fill = `${left},${bot} ` + pts + ` ${left+bw},${bot}`
  return (
    <svg width={W} height={H} className="shrink-0">
      <polygon points={fill} fill="rgba(80,184,158,0.12)" />
      <polyline points={pts} fill="none" stroke={C_TEAL} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// ── 1/3-Octave EQ sliders ─────────────────────────────────────────────────────
function OctaveEq({ gains, onChange }: { gains: number[]; onChange: (g: number[]) => void }) {
  const fmt = (v: number) => v > 0 ? `+${v}` : `${v}`
  return (
    <div className="overflow-x-auto">
      <div className="flex gap-1 min-w-max pb-1">
        {THIRD_OCT.map((fc, i) => (
          <div key={fc} className="flex flex-col items-center gap-0.5" style={{ width: 28 }}>
            <span className="text-[8px] text-teal tabular-nums">{fmt(gains[i])}</span>
            <input
              type="range" min={-24} max={24} step={1}
              value={gains[i]}
              onChange={e => { const g = [...gains]; g[i] = Number(e.target.value); onChange(g) }}
              className="appearance-none h-20 cursor-pointer"
              style={{ writingMode: 'vertical-lr', direction: 'rtl', width: 16, accentColor: C_TEAL }}
            />
            <span className="text-[8px] text-muted tabular-nums leading-none">
              {fc >= 1000 ? `${fc/1000}k` : fc}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Waveform region selector with window overlay ───────────────────────────────
function WaveformSelector({
  sessionId, audioId, sampleRate, windowType,
  onSelect,
}: {
  sessionId: string; audioId: string; sampleRate: number
  windowType: string
  onSelect: (start: number, end: number) => void
}) {
  const t = useT()
  const [wf,  setWf]  = useState<{ t: number[]; amplitude: number[] } | null>(null)
  const [sel, setSel] = useState<[number, number] | null>(null)

  useEffect(() => {
    fetchWaveform(sessionId, audioId).then(setWf).catch(() => {})
  }, [sessionId, audioId])

  // Recompute overlay when windowType or selection changes
  const overlayTraces = (() => {
    if (!wf || !sel) return []
    const [t0, t1] = sel
    const i0 = wf.t.findIndex(t => t >= t0)
    const i1 = wf.t.findIndex(t => t >  t1)
    const end = i1 < 0 ? wf.t.length : i1
    if (i0 < 0 || end <= i0) return []

    const segT   = wf.t.slice(i0, end)
    const segAmp = wf.amplitude.slice(i0, end)
    const win    = computeWindow(windowType, segT.length)

    // Windowed signal
    const windowed = segAmp.map((a, i) => a * win[i])

    // Window envelope scaled to ±peak of original segment
    const peak = Math.max(...segAmp.map(Math.abs)) || 1
    const envPos =  win.map(w => w * peak)
    const envNeg =  win.map(w => -w * peak)

    return [
      // Dimmed original in selection range
      {
        x: segT, y: segAmp, type: 'scatter' as const, mode: 'lines' as const,
        line: { color: C_TEAL, width: 0.6 }, opacity: 0.2,
        showlegend: false, hoverinfo: 'skip' as const, name: '',
      },
      // Windowed signal (vivid)
      {
        x: segT, y: windowed, type: 'scatter' as const, mode: 'lines' as const,
        line: { color: C_TEAL, width: 1.2 },
        showlegend: false, hoverinfo: 'skip' as const, name: '',
      },
      // Top envelope
      {
        x: segT, y: envPos, type: 'scatter' as const, mode: 'lines' as const,
        line: { color: C_ORANGE, width: 1.2, dash: 'dot' as const },
        showlegend: false, hoverinfo: 'skip' as const, name: '',
        fill: 'tonexty' as const, fillcolor: 'rgba(237,105,59,0.07)',
      },
      // Bottom envelope (filled between top and bottom)
      {
        x: segT, y: envNeg, type: 'scatter' as const, mode: 'lines' as const,
        line: { color: C_ORANGE, width: 1.2, dash: 'dot' as const },
        showlegend: false, hoverinfo: 'skip' as const, name: '',
      },
    ]
  })()

  // Base waveform — dimmed when selection exists, normal otherwise
  const baseOpacity = sel ? 0.25 : 1

  if (!wf) return (
    <div className="flex items-center justify-center h-24 text-xs text-muted gap-1">
      <Loader2 size={12} className="animate-spin text-teal" /> {t('pp.proc.loadingWaveform')}
    </div>
  )

  return (
    <div className="flex flex-col gap-1">
      <p className="text-[11px] text-muted">{t('pp.proc.dragHint')}</p>
      <Plot
        data={[
          {
            x: wf.t, y: wf.amplitude, type: 'scatter', mode: 'lines',
            line: { color: C_TEAL, width: 0.8 },
            opacity: baseOpacity,
            showlegend: false, name: t('pp.proc.traceWaveform'),
            hovertemplate: '%{x:.3f} s<extra></extra>',
          },
          ...overlayTraces,
        ]}
        layout={{
          paper_bgcolor: 'transparent', plot_bgcolor: '#111c28',
          font: { color: '#e2e8f0', size: 9, family: 'Inter, sans-serif' },
          margin: { l: 42, r: 8, t: 4, b: 28 },
          xaxis: { gridcolor: '#1e2d3d', color: '#8ab4c9', title: { text: t('pp.proc.axisTime'), font: { size: 9 } } },
          yaxis: { gridcolor: '#1e2d3d', color: '#8ab4c9', title: { text: t('pp.proc.axisAmp'), font: { size: 9 } } },
          autosize: true,
          dragmode: 'select',
          selectdirection: 'h',
          newselection: { mode: 'gradual' },
          activeselection: { fillcolor: 'rgba(80,184,158,0.10)', opacity: 0.3 },
          shapes: sel ? [{
            type: 'rect' as const,
            xref: 'x' as const, yref: 'paper' as const,
            x0: sel[0], x1: sel[1], y0: 0, y1: 1,
            fillcolor: 'rgba(80,184,158,0.07)',
            line: { color: C_TEAL, width: 1, dash: 'dot' },
          }] : [],
        } as any}
        config={{ displayModeBar: false, responsive: true }}
        style={{ width: '100%', height: 130 }}
        useResizeHandler
        onSelected={(e: any) => {
          if (e?.range?.x) {
            const [t0, t1] = e.range.x
            setSel([t0, t1])
            onSelect(Math.round(t0 * sampleRate), Math.round(t1 * sampleRate))
          }
        }}
      />
      {sel ? (
        <p className="text-[11px] text-teal">
          {sel[0].toFixed(4)} s → {sel[1].toFixed(4)} s &nbsp;|&nbsp;
          {(sel[1]-sel[0]).toFixed(4)} s &nbsp;|&nbsp;
          {Math.round((sel[1]-sel[0])*sampleRate)} {t('pp.proc.samples')}
        </p>
      ) : (
        <p className="text-[11px] text-muted">{t('pp.proc.noSelection')}</p>
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

interface Props {
  sessionId: string
  audioId: string
  audioName: string
  sampleRate: number
  otherFiles: AudioFile[]
  onClose: () => void
  onResult: (newFile: AudioFile) => void
}

export default function ProcessingModal({
  sessionId, audioId, audioName, sampleRate, otherFiles, onClose, onResult,
}: Props) {
  const t = useT()
  const dialogRef = useDialog(onClose)
  const [tab, setTab]   = useState<Tab>('filter')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  // Filter state
  const [filterType,   setFilterType]   = useState('Low-pass')
  const [cutoffLow,    setCutoffLow]    = useState(500)
  const [cutoffHigh,   setCutoffHigh]   = useState(2000)
  const [method,       setMethod]       = useState('Butterworth')
  const [fundamental,  setFundamental]  = useState(50)
  const [qFactor,      setQFactor]      = useState(30)
  const [octaveGains,  setOctaveGains]  = useState<number[]>(Array(31).fill(0))

  // Window state
  const [windowType,   setWindowType]   = useState('Hanning')
  const [startSample,  setStartSample]  = useState(0)
  const [endSample,    setEndSample]    = useState(0)
  const [manualMode,   setManualMode]   = useState(false)

  // Weighting state
  const [weightCurve,  setWeightCurve]  = useState('A-weighting')

  // Loudness state
  const [refId,        setRefId]        = useState(otherFiles[0]?.audio_id ?? '')

  const isBand     = filterType === 'Band-pass' || filterType === 'Band-reject'
  const isSingle   = filterType === 'Low-pass'  || filterType === 'High-pass'
  const isOctave   = filterType === '1/3-Octave band'
  const isHarmonic = filterType === 'Harmonic Notch'

  const run = async () => {
    setBusy(true); setError('')
    try {
      let result: AudioFile
      if (tab === 'filter') {
        const cutoff = isBand ? ([cutoffLow, cutoffHigh] as [number,number])
                     : isSingle ? cutoffLow : undefined
        result = await applyFilter(
          sessionId, audioId, filterType, cutoff, method,
          isHarmonic ? fundamental : undefined,
          isHarmonic ? qFactor : 30,
          isOctave ? octaveGains : undefined,
        )
      } else if (tab === 'window') {
        if (endSample <= startSample) throw new Error(t('pp.proc.errRegion'))
        result = await applyWindow(sessionId, audioId, startSample, endSample, windowType)
      } else if (tab === 'weighting') {
        if (weightCurve === 'None') throw new Error(t('pp.proc.errCurve'))
        const curve = weightCurve === 'A-weighting' ? 'A' : 'C'
        result = await applyWeighting(sessionId, audioId, curve)
      } else {
        if (!refId) throw new Error(t('pp.proc.errRef'))
        result = await applyLoudnessAdj(sessionId, audioId, refId)
      }
      toast.success(t('pp.proc.applied'))
      onResult(result)
      onClose()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const inputCls = 'bg-dark border border-border rounded px-2 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal focus:border-teal w-full'
  const labelCls = 'text-[11px] text-muted uppercase tracking-wider mb-0.5 block'

  const TABS: { key: Tab; label: string }[] = [
    { key: 'filter',    label: t('pp.proc.tabFilter') },
    { key: 'window',    label: t('pp.proc.tabWindow') },
    { key: 'weighting', label: t('pp.proc.tabWeighting') },
    { key: 'loudness',  label: t('pp.proc.tabLoudness') },
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label={t('pp.proc.ariaLabel', { name: audioName })}
        className="bg-surface border border-border rounded-xl shadow-2xl flex flex-col outline-none"
        style={{ width: 'min(680px, 100%)', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <span className="text-sm font-semibold text-white truncate max-w-xs" title={audioName}>
            {t('pp.proc.header', { name: audioName.replace(/\.wav$/i, '') })}
          </span>
          <button onClick={onClose} aria-label={t('pp.proc.close')} className="text-muted hover:text-white transition-colors ml-2">
            <X size={15} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setTab(key)}
              className={clsx('px-4 py-2 text-xs font-medium transition-colors',
                tab === key ? 'text-teal border-b-2 border-teal' : 'text-muted hover:text-white'
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-4 space-y-3 flex-1">

          {/* FILTER */}
          {tab === 'filter' && (
            <div className="flex gap-4 items-start">
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <label className={labelCls}>{t('pp.proc.filterType')}</label>
                  <select value={filterType} onChange={e => setFilterType(e.target.value)} className={inputCls}>
                    {FILTER_TYPES.map(ft => <option key={ft} value={ft}>{t(FILTER_LABEL_KEYS[ft])}</option>)}
                  </select>
                </div>
                {isBand && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>{t('pp.proc.lowFreq')}</label>
                      <input type="number" value={cutoffLow} onChange={e => setCutoffLow(Number(e.target.value))} className={inputCls} min={1} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('pp.proc.highFreq')}</label>
                      <input type="number" value={cutoffHigh} onChange={e => setCutoffHigh(Number(e.target.value))} className={inputCls} min={1} />
                    </div>
                  </div>
                )}
                {isSingle && (
                  <div>
                    <label className={labelCls}>{t('pp.proc.cutoffFreq')}</label>
                    <input type="number" value={cutoffLow} onChange={e => setCutoffLow(Number(e.target.value))} className={inputCls} min={1} />
                  </div>
                )}
                {(isBand || isSingle) && (
                  <div>
                    <label className={labelCls}>{t('pp.proc.design')}</label>
                    <select value={method} onChange={e => setMethod(e.target.value)} className={inputCls}>
                      <option>Butterworth</option>
                      <option>Linkwitz</option>
                    </select>
                  </div>
                )}
                {isHarmonic && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>{t('pp.proc.fundamental')}</label>
                      <input type="number" value={fundamental} onChange={e => setFundamental(Number(e.target.value))} className={inputCls} min={1} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('pp.proc.qFactor')}</label>
                      <input type="number" value={qFactor} onChange={e => setQFactor(Number(e.target.value))} className={inputCls} min={1} />
                    </div>
                  </div>
                )}
                {isOctave && (
                  <div className="border border-border rounded-lg p-2 bg-dark/40">
                    <p className="text-[11px] text-muted mb-2 uppercase tracking-wider">{t('pp.proc.octaveGain')}</p>
                    <OctaveEq gains={octaveGains} onChange={setOctaveGains} />
                    <button onClick={() => setOctaveGains(Array(31).fill(0))}
                      className="mt-2 text-[11px] text-muted hover:text-white transition-colors">
                      {t('pp.proc.resetAll')}
                    </button>
                  </div>
                )}
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted uppercase tracking-wider">{t('pp.proc.response')}</span>
                <div className="border border-border rounded-lg p-2 bg-dark/40">
                  <FilterPreview type={filterType} />
                </div>
              </div>
            </div>
          )}

          {/* WINDOW */}
          {tab === 'window' && (
            <div className="flex gap-4 items-start">
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <label className={labelCls}>{t('pp.proc.windowType')}</label>
                  <select value={windowType} onChange={e => setWindowType(e.target.value)} className={inputCls}>
                    {WINDOW_TYPES.map(w => <option key={w} value={w}>{w === 'Rectangular' ? t('pp.proc.winRect') : w}</option>)}
                  </select>
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={manualMode} onChange={e => setManualMode(e.target.checked)} className="accent-teal" />
                  <span className="text-xs text-muted">{t('pp.proc.manual')}</span>
                </label>
                {manualMode ? (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className={labelCls}>{t('pp.proc.startSample')}</label>
                      <input type="number" value={startSample} onChange={e => setStartSample(Number(e.target.value))} className={inputCls} min={0} />
                    </div>
                    <div>
                      <label className={labelCls}>{t('pp.proc.endSample')}</label>
                      <input type="number" value={endSample} onChange={e => setEndSample(Number(e.target.value))} className={inputCls} min={1} />
                    </div>
                  </div>
                ) : (
                  <WaveformSelector
                    sessionId={sessionId} audioId={audioId} sampleRate={sampleRate}
                    windowType={windowType}
                    onSelect={(s, e) => { setStartSample(s); setEndSample(e) }}
                  />
                )}
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted uppercase tracking-wider">{t('pp.proc.shape')}</span>
                <div className="border border-border rounded-lg p-2 bg-dark/40">
                  <WindowPreview type={windowType} />
                </div>
              </div>
            </div>
          )}

          {/* WEIGHTING */}
          {tab === 'weighting' && (
            <div className="flex gap-4 items-start">
              <div className="flex-1 space-y-3 min-w-0">
                <div>
                  <label className={labelCls}>{t('pp.proc.weightCurve')}</label>
                  <select value={weightCurve} onChange={e => setWeightCurve(e.target.value)} className={inputCls}>
                    {WEIGHTING_OPTS.map(o => <option key={o} value={o}>{t(WEIGHTING_LABEL_KEYS[o])}</option>)}
                  </select>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  {weightCurve === 'A-weighting' && t('pp.proc.descA')}
                  {weightCurve === 'C-weighting' && t('pp.proc.descC')}
                  {weightCurve === 'None'         && t('pp.proc.descNone')}
                </p>
              </div>
              <div className="flex flex-col items-center gap-1 shrink-0">
                <span className="text-[10px] text-muted uppercase tracking-wider">{t('pp.proc.response')}</span>
                <div className="border border-border rounded-lg p-2 bg-dark/40">
                  <WeightingPreview curve={weightCurve} />
                </div>
              </div>
            </div>
          )}

          {/* LOUDNESS */}
          {tab === 'loudness' && (
            otherFiles.length === 0 ? (
              <p className="text-xs text-muted py-4 text-center">
                {t('pp.proc.needRef')}
              </p>
            ) : (
              <div className="space-y-2">
                <label className={labelCls}>{t('pp.proc.refFile')}</label>
                <select value={refId} onChange={e => setRefId(e.target.value)} className={inputCls}>
                  {otherFiles.map(f => <option key={f.audio_id} value={f.audio_id}>{f.name}</option>)}
                </select>
                <p className="text-[11px] text-muted mt-1">
                  {t('pp.proc.loudnessHint')}
                </p>
              </div>
            )
          )}

          {error && <p className="text-xs text-red-400 pt-1">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-4 py-3 border-t border-border shrink-0">
          <button onClick={onClose}
            className="px-3 py-1.5 text-xs text-muted hover:text-white rounded hover:bg-panel transition-colors">
            {t('pp.proc.cancel')}
          </button>
          <button
            onClick={run}
            disabled={busy || (tab === 'loudness' && otherFiles.length === 0) || (tab === 'weighting' && weightCurve === 'None')}
            className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold bg-teal text-dark rounded hover:bg-teal/80 disabled:opacity-40 transition-colors"
          >
            {busy && <Loader2 size={12} className="animate-spin" />}
            {t('pp.proc.apply')}
          </button>
        </div>
      </div>
    </div>
  )
}
