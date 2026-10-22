import { useMemo, useState } from 'react'
import Plot from '../../components/Plot'
import { DEMO } from './demoData'
import { trDeep, tr } from './demoTr'
import { useLang } from '../../i18n'

const AXIS = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }
export const TEAL = '#50b89e', ORANGE = '#ed693b', AMBER = '#ffa94d', BLUE = '#60a5fa'

const BASE: any = {
  paper_bgcolor: 'transparent',
  plot_bgcolor: '#111c28',
  font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
  margin: { l: 56, r: 14, t: 10, b: 44 },
  autosize: true,
  hovermode: 'x',
  hoverlabel: { bgcolor: '#1c2a38', bordercolor: TEAL, font: { color: 'white', size: 11 } },
  legend: { orientation: 'h', y: 1.12, x: 0, font: { size: 10, color: '#8ab4c9' }, bgcolor: 'transparent' },
  modebar: { bgcolor: 'rgba(17,28,40,0.75)', color: '#8ab4c9', activecolor: TEAL },
}
const CONFIG = { displayModeBar: false, responsive: true }

export function Chart({ data, layout, height = 300 }: { data: any[]; layout?: any; height?: number }) {
  useLang((s) => s.lang)   // re-render (and re-translate) when the language changes
  return (
    <div style={{ height }}>
      <Plot data={trDeep(data)} layout={trDeep({ ...BASE, ...layout })} config={CONFIG} useResizeHandler
        style={{ width: '100%', height: '100%' }} className="w-full h-full" />
    </div>
  )
}

export const ax = (title: string, extra: any = {}) => ({ ...AXIS, title: { text: title }, ...extra })
export const line = (x: any[], y: any[], name: string, color = TEAL, extra: any = {}) =>
  ({ x, y, name, type: 'scatter', mode: 'lines', line: { color, width: 2 }, ...extra })
export const dots = (x: any[], y: any[], name: string, color = TEAL, extra: any = {}) =>
  ({ x, y, name, type: 'scatter', mode: 'lines+markers', line: { color, width: 2 }, marker: { size: 7, color }, ...extra })

/** One reference point of a psychoacoustic unit, drawn as a ring on the curve. */
const anchor = (x: number, y: number, name: string) =>
  ({ x: [x], y: [y], name, type: 'scatter', mode: 'markers', marker: { size: 13, color: 'rgba(0,0,0,0)', line: { color: AMBER, width: 2 } }, hoverinfo: 'name' })

// ── Windows ───────────────────────────────────────────────────────────────────

function bessel0(x: number) {
  let sum = 1, term = 1
  for (let k = 1; k < 60; k++) { term *= (x / (2 * k)) ** 2; sum += term; if (term < 1e-14 * sum) break }
  return sum
}

const WINDOWS: Record<string, { label: string; fn: (n: number, N: number) => number }> = {
  rectangular: { label: 'Retangular', fn: () => 1 },
  hanning:     { label: 'Hanning',    fn: (n, N) => 0.5 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1)) },
  hamming:     { label: 'Hamming',    fn: (n, N) => 0.54 - 0.46 * Math.cos(2 * Math.PI * n / (N - 1)) },
  blackman:    { label: 'Blackman',   fn: (n, N) => 0.42 - 0.5 * Math.cos(2 * Math.PI * n / (N - 1)) + 0.08 * Math.cos(4 * Math.PI * n / (N - 1)) },
  bartlett:    { label: 'Bartlett',   fn: (n, N) => 1 - Math.abs(2 * n / (N - 1) - 1) },
  kaiser:      { label: 'Kaiser (β = 14)', fn: (n, N) => bessel0(14 * Math.sqrt(1 - (2 * n / (N - 1) - 1) ** 2)) / bessel0(14) },
}

const WN = 64

function windowSpectrum(w: number[]) {
  const steps = 32, maxBins = 12
  const xs: number[] = [], mags: number[] = []
  for (let i = 0; i <= maxBins * steps; i++) {
    const bin = i / steps                         // frequency in DFT bins of the 64-point window
    let re = 0, im = 0
    for (let n = 0; n < w.length; n++) {
      const ph = -2 * Math.PI * bin * n / w.length
      re += w[n] * Math.cos(ph); im += w[n] * Math.sin(ph)
    }
    xs.push(bin); mags.push(Math.hypot(re, im))
  }
  const peak = mags[0]
  return { xs, db: mags.map((m) => 20 * Math.log10(Math.max(m / peak, 1e-9))) }
}

export function WindowDemo() {
  const en = useLang((s) => s.lang) === 'en'
  const loc = en ? 'en-US' : 'pt-BR'
  const [key, setKey] = useState('hanning')
  const all = useMemo(() => {
    const out: Record<string, { w: number[]; sp: ReturnType<typeof windowSpectrum> }> = {}
    for (const k of Object.keys(WINDOWS)) {
      const w = Array.from({ length: WN }, (_, n) => WINDOWS[k].fn(n, WN))
      out[k] = { w, sp: windowSpectrum(w) }
    }
    return out
  }, [])
  const cur = all[key]
  const stats = useMemo(() => {
    const { w, sp } = cur
    const sum = w.reduce((a, b) => a + b, 0), sumSq = w.reduce((a, b) => a + b * b, 0)
    const enbw = WN * sumSq / (sum * sum)
    let i = 1
    while (i < sp.db.length - 1 && !(sp.db[i] < sp.db[i - 1] && sp.db[i] <= sp.db[i + 1])) i++
    const nullBin = sp.xs[i]
    const side = Math.max(...sp.db.slice(i))
    const half = sp.db[16]                                       // 0.5 bin
    return { cg: sum / WN, enbw, nullBin, side, scallop: -half }
  }, [cur])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={tr('Janela')}>
        {Object.entries(WINDOWS).map(([k, v]) => (
          <button key={k} onClick={() => setKey(k)} aria-pressed={key === k}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${key === k ? 'bg-teal text-dark border-teal' : 'bg-panel border-field text-white hover:border-teal'}`}>
            {tr(v.label)}
          </button>
        ))}
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Chart height={250} data={[
          ...Object.keys(WINDOWS).filter((k) => k !== key).map((k) => line(all[k].w.map((_, n) => n), all[k].w, WINDOWS[k].label, '#2f4a5f', { line: { color: '#2f4a5f', width: 1 }, hoverinfo: 'skip', showlegend: false })),
          line(cur.w.map((_, n) => n), cur.w, WINDOWS[key].label, TEAL),
        ]} layout={{ xaxis: ax('Amostra n (janela de 64 pontos)'), yaxis: ax('Peso w[n]', { range: [-0.05, 1.08] }), showlegend: false, hovermode: 'closest' }} />
        <Chart height={250} data={[
          ...Object.keys(WINDOWS).filter((k) => k !== key).map((k) => line(all[k].sp.xs, all[k].sp.db, WINDOWS[k].label, '#2f4a5f', { line: { color: '#2f4a5f', width: 1 }, hoverinfo: 'skip', showlegend: false })),
          line(cur.sp.xs, cur.sp.db, WINDOWS[key].label, ORANGE),
        ]} layout={{ xaxis: ax('Frequência (em linhas da FFT, “bins”)'), yaxis: ax('Resposta (dB)', { range: [-130, 5] }), showlegend: false, hovermode: 'closest' }} />
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[12px]">
        {[
          [tr('Ganho coerente'), stats.cg.toLocaleString(loc, { minimumFractionDigits: 3, maximumFractionDigits: 3 }), tr('média dos pesos: quanto um tom perde de altura')],
          [tr('Banda de ruído (ENBW)'), `${stats.enbw.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bins`, tr('largura efetiva de cada linha')],
          [tr('Lóbulo principal'), `±${stats.nullBin.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} bins`, tr('até o primeiro zero')],
          [tr('Maior lóbulo lateral'), `${stats.side.toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} dB`, tr('vazamento para linhas distantes')],
        ].map(([t, v, d]) => (
          <div key={t} className="rounded-lg bg-panel/60 border border-border px-3 py-2">
            <dt className="text-muted">{t}</dt>
            <dd className="text-white text-sm font-semibold tabular-nums">{v}</dd>
            <dd className="text-muted text-[11px] leading-snug">{d}</dd>
          </div>
        ))}
      </dl>
      <p className="text-[12px] text-muted">{en ? 'Scalloping loss (tone between two lines)' : 'Perda por “scalloping” (tom entre duas linhas)'}: {stats.scallop.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} dB. {tr('Valores calculados nesta página a partir das mesmas fórmulas usadas pelo PySQA.')}</p>
    </div>
  )
}

// ── Weighting ─────────────────────────────────────────────────────────────────

const F1 = 20.598997, F2 = 107.65265, F3 = 737.86223, F4 = 12194.217
const rawA = (f: number) => { const x = f * f; return (F4 ** 2 * x * x) / ((x + F1 ** 2) * Math.sqrt((x + F2 ** 2) * (x + F3 ** 2)) * (x + F4 ** 2)) }
const rawC = (f: number) => { const x = f * f; return (F4 ** 2 * x) / ((x + F1 ** 2) * (x + F4 ** 2)) }
export const weightA = (f: number) => 20 * Math.log10(rawA(f) / rawA(1000))
export const weightC = (f: number) => 20 * Math.log10(rawC(f) / rawC(1000))

const IEC_A: [number, number][] = [[63, -26.2], [100, -19.1], [250, -8.6], [1000, 0], [2000, 1.2], [4000, 1.0], [8000, -1.1], [10000, -2.5]]
const IEC_C: [number, number][] = [[63, -0.8], [100, -0.3], [1000, 0], [4000, -0.8], [8000, -3.0], [10000, -4.4]]

export function WeightingDemo() {
  const f = useMemo(() => Array.from({ length: 300 }, (_, i) => 10 * Math.pow(2000, i / 299)), [])
  return (
    <Chart height={320} data={[
      line(f, f.map(weightA), 'Curva A', TEAL),
      line(f, f.map(weightC), 'Curva C', ORANGE),
      { x: IEC_A.map((p) => p[0]), y: IEC_A.map((p) => p[1]), name: 'Valores da IEC 61672-1 (A)', type: 'scatter', mode: 'markers', marker: { size: 8, color: 'rgba(0,0,0,0)', line: { color: AMBER, width: 2 } } },
      { x: IEC_C.map((p) => p[0]), y: IEC_C.map((p) => p[1]), name: 'Valores da IEC 61672-1 (C)', type: 'scatter', mode: 'markers', marker: { size: 8, symbol: 'diamond-open', color: AMBER, line: { color: AMBER, width: 2 } } },
    ]} layout={{ xaxis: ax('Frequência (Hz)', { type: 'log', range: [1, 4.3] }), yaxis: ax('Ganho (dB)', { range: [-60, 8] }), hovermode: 'x unified' }} />
  )
}

// ── Butterworth: one pass and forward-backward ────────────────────────────────

export function FilterDemo() {
  useLang((s) => s.lang)
  const [order, setOrder] = useState(4)
  const f = useMemo(() => Array.from({ length: 240 }, (_, i) => 100 * Math.pow(100, i / 239)), [])
  const one = f.map((x) => -10 * Math.log10(1 + (x / 1000) ** (2 * order)))
  return (
    <div className="flex flex-col gap-2">
      <label className="flex items-center gap-3 text-xs text-muted">
        {tr('Ordem do filtro:')} <span className="text-white font-semibold tabular-nums w-4">{order}</span>
        <input type="range" min={1} max={8} step={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} className="accent-teal w-48" aria-label={tr('Ordem do filtro Butterworth')} />
      </label>
      <Chart height={300} data={[
        line(f, one, 'Uma passada (resposta do filtro)', '#6b8aa3', { line: { color: '#6b8aa3', width: 2, dash: 'dot' } }),
        line(f, one.map((v) => 2 * v), 'Ida e volta (o que o PySQA aplica)', TEAL),
        { x: [1000, 1000], y: [-3.01, -6.02], name: 'Na frequência de corte', type: 'scatter', mode: 'markers+text', text: ['−3 dB', '−6 dB'], textposition: ['top right', 'bottom right'], marker: { size: 8, color: [AMBER, ORANGE] }, textfont: { color: '#e2e8f0', size: 11 } },
      ]} layout={{ xaxis: ax('Frequência (Hz)', { type: 'log' }), yaxis: ax('Ganho (dB)', { range: [-80, 3] }), hovermode: 'x unified' }} />
    </div>
  )
}

// ── Bark scale ────────────────────────────────────────────────────────────────

export function BarkDemo() {
  const f = useMemo(() => Array.from({ length: 200 }, (_, i) => 20 * Math.pow(1000, i / 199)), [])
  const bark = (x: number) => { const z = 26.81 * x / (1960 + x) - 0.53; return z < 2 ? z + 0.15 * (2 - z) : z > 20.1 ? z + 0.22 * (z - 20.1) : z }
  const cbw = (x: number) => 25 + 75 * (1 + 1.4 * (x / 1000) ** 2) ** 0.69
  return (
    <div className="grid md:grid-cols-2 gap-3">
      <Chart height={260} data={[line(f, f.map(bark), 'Bark', TEAL)]}
        layout={{ xaxis: ax('Frequência (Hz)', { type: 'log' }), yaxis: ax('Taxa de banda crítica (Bark)'), showlegend: false }} />
      <Chart height={260} data={[line(f, f.map(cbw), 'Largura', ORANGE)]}
        layout={{ xaxis: ax('Frequência (Hz)', { type: 'log' }), yaxis: ax('Largura da banda crítica (Hz)', { type: 'log' }), showlegend: false }} />
    </div>
  )
}

// ── Charts from real PySQA results ────────────────────────────────────────────

export function LoudnessChart() {
  const d = DEMO.loudnessVsLevel
  return <Chart data={[dots([...d.spl], [...d.sone], 'Loudness (ISO 532-1)'), anchor(40, 1, '1 sone = tom de 1 kHz a 40 dB')]}
    layout={{ xaxis: ax('Nível do tom de 1 kHz (dB SPL)'), yaxis: ax('Loudness (sone)', { type: 'log' }) }} />
}

export function SharpnessChart() {
  const d = DEMO.sharpnessVsBark
  return <Chart data={[dots([...d.bark], [...d.acum], 'Sharpness (DIN 45692)'), anchor(8.5, 1, '1 acum = ruído de 1 banda crítica em 1 kHz, 60 dB')]}
    layout={{ xaxis: ax('Centro da banda de ruído (Bark)'), yaxis: ax('Sharpness (acum)') }} />
}

export function RoughnessChart() {
  const d = DEMO.roughnessVsFmod
  return <Chart data={[dots([...d.fmod], [...d.asper], 'Roughness (Daniel e Weber)', ORANGE), anchor(70, 1, '1 asper = tom de 1 kHz, 60 dB, 100 % AM a 70 Hz')]}
    layout={{ xaxis: ax('Frequência de modulação (Hz)', { type: 'log' }), yaxis: ax('Roughness (asper)') }} />
}

export function FluctuationChart() {
  const d = DEMO.fluctuationVsFmod
  return <Chart data={[dots([...d.fmod], [...d.vacil], 'Fluctuation strength', BLUE), anchor(4, 1, '1 vacil = tom de 1 kHz, 60 dB, 100 % AM a 4 Hz')]}
    layout={{ xaxis: ax('Frequência de modulação (Hz)', { type: 'log' }), yaxis: ax('Fluctuation strength (vacil)') }} />
}

export function TonalityChart() {
  const d = DEMO.tonalityVsLevel
  return <Chart data={[dots([...d.spl], [...d.tone], 'Tom de 1 kHz', TEAL), dots([...d.spl], [...d.noise], 'Ruído de banda larga', '#6b8aa3'), anchor(40, 1, '1 tu ≈ tom de 1 kHz a 40 dB')]}
    layout={{ xaxis: ax('Nível (dB SPL)'), yaxis: ax('Tonalidade (tu)') }} />
}

export function OctaveChart() {
  const d = DEMO.thirdOctave
  const x = d.centres.map((c) => (c >= 1000 ? `${c / 1000}k` : String(c)))
  return <Chart data={[
    { x, y: [...d.white], name: 'Ruído branco', type: 'bar', marker: { color: ORANGE } },
    { x, y: [...d.pink], name: 'Ruído rosa', type: 'bar', marker: { color: TEAL } },
  ]} layout={{ barmode: 'group', xaxis: ax('Frequência central da banda (Hz)', { type: 'category' }), yaxis: ax('Nível (dB SPL)', { range: [25, 62] }) }} />
}

export function EnvelopeChart() {
  const d = DEMO.envelope
  return <Chart data={[
    line([...d.t], [...d.signal], 'Sinal', '#6b8aa3', { line: { color: '#6b8aa3', width: 1 } }),
    line([...d.t], [...d.envelope], 'Envelope (Hilbert)', AMBER, { line: { color: AMBER, width: 2.5 } }),
  ]} layout={{ xaxis: ax('Tempo (s)'), yaxis: ax('Amplitude (FS)') }} />
}

export function SpectrumChart() {
  const d = DEMO.spectrum
  return <Chart data={[line([...d.f], [...d.db], 'Espectro', ORANGE, { line: { color: ORANGE, width: 1.5 } })]}
    layout={{ xaxis: ax('Frequência (Hz)', { type: 'log', range: [1.3, 4.3] }), yaxis: ax('Nível (dB SPL, RMS por linha)', { range: [10, 100] }), showlegend: false,
      annotations: [{ x: Math.log10(1000), y: 94, text: '94 dB', showarrow: true, arrowcolor: AMBER, font: { color: AMBER, size: 11 }, ax: 28, ay: -6 },
                    { x: Math.log10(3000), y: 74, text: '74 dB', showarrow: true, arrowcolor: AMBER, font: { color: AMBER, size: 11 }, ax: 28, ay: -6 }] }} />
}

export function SpectrogramChart() {
  const d = DEMO.spectrogram
  return <Chart height={300} data={[{ x: [...d.t], y: [...d.f], z: d.z.map((r) => [...r]), type: 'heatmap', colorscale: 'Magma', zmin: d.zmin, zmax: d.zmax,
    colorbar: { title: { text: 'dB' }, thickness: 10, len: 0.9, tickfont: { size: 10 } } }]}
    layout={{ xaxis: ax('Tempo (s)'), yaxis: ax('Frequência (Hz)'), hovermode: 'closest', margin: { l: 56, r: 10, t: 10, b: 44 } }} />
}
