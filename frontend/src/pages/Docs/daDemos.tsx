import { useMemo, useState } from 'react'
import { useLang } from '../../i18n'
import { AMBER, BLUE, Chart, ORANGE, TEAL, ax, dots, line } from './demos'
import { tr } from './demoTr'

/** Number locale of the active language (decimal comma in Portuguese, point in English). */
const useLoc = () => (useLang((s) => s.lang) === 'en' ? 'en-US' : 'pt-BR')

const Slider = ({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) => (
  <label className="flex items-center gap-3 text-xs text-muted">
    <span className="w-44 shrink-0">{tr(label)}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="accent-teal flex-1 min-w-24 max-w-64" aria-label={tr(label)} />
    <span className="text-white font-semibold tabular-nums w-24">{value} {unit}</span>
  </label>
)

const Stat = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
  <div className="rounded-lg bg-panel/60 border border-border px-3 py-2">
    <dt className="text-muted text-[12px]">{tr(title)}</dt>
    <dd className="text-white text-sm font-semibold tabular-nums">{value}</dd>
    {hint && <dd className="text-muted text-[11px] leading-snug">{tr(hint)}</dd>}
  </div>
)

// ── Sampling rate and aliasing ────────────────────────────────────────────────

export function SamplingDemo() {
  const loc = useLoc()
  const [f, setF] = useState(5000)
  const [fs, setFs] = useState(48000)
  const nyq = fs / 2
  const k = Math.round(f / fs)
  const apparent = Math.abs(f - k * fs)
  const aliased = f > nyq
  const span = Math.max(4 / Math.max(f, apparent, 1), 4 / fs)       // a few periods
  const t = useMemo(() => Array.from({ length: 600 }, (_, i) => (i / 599) * span), [span])
  const ns = Math.floor(span * fs)
  const ts = Array.from({ length: ns + 1 }, (_, n) => n / fs)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Slider label="Frequência do tom" value={f} min={100} max={30000} step={100} unit="Hz" onChange={setF} />
        <label className="flex items-center gap-3 text-xs text-muted">
          <span className="w-44 shrink-0">{tr('Taxa de amostragem')}</span>
          <select value={fs} onChange={(e) => setFs(Number(e.target.value))}
            className="bg-panel border border-field rounded px-2 py-1 text-xs text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal" aria-label={tr('Taxa de amostragem')}>
            {[8000, 16000, 44100, 48000, 96000].map((r) => <option key={r} value={r}>{r.toLocaleString(loc)} Hz</option>)}
          </select>
        </label>
      </div>
      <Chart height={240} data={[
        line(t.map((x) => x * 1000), t.map((x) => Math.sin(2 * Math.PI * f * x)), 'Tom real', '#6b8aa3', { line: { color: '#6b8aa3', width: 1.5 } }),
        { x: ts.map((x) => x * 1000), y: ts.map((x) => Math.sin(2 * Math.PI * f * x)), name: 'Amostras', type: 'scatter', mode: 'markers', marker: { size: 8, color: AMBER } },
        ...(aliased ? [line(t.map((x) => x * 1000), t.map((x) => Math.sin(2 * Math.PI * (f - k * fs) * x)), 'O que o computador “enxerga”', ORANGE, { line: { color: ORANGE, width: 2, dash: 'dash' } })] : []),
      ]} layout={{ xaxis: ax('Tempo (ms)'), yaxis: ax('Amplitude', { range: [-1.25, 1.25] }), hovermode: 'closest' }} />
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Stat title="Frequência de Nyquist" value={`${nyq.toLocaleString(loc)} Hz`} hint="metade da taxa de amostragem" />
        <Stat title="Frequência registrada" value={`${apparent.toLocaleString(loc)} Hz`} hint={aliased ? 'diferente da real: é o “alias”' : 'igual à real'} />
        <Stat title="Situação" value={tr(aliased ? 'Aliasing' : 'Correto')} hint={aliased ? 'o tom está acima de Nyquist' : 'o tom cabe na banda'} />
      </dl>
    </div>
  )
}

// ── Bit depth ────────────────────────────────────────────────────────────────

export function BitsDemo() {
  const loc = useLoc()
  const [bits, setBits] = useState(4)
  const n = 400
  const x = Array.from({ length: n }, (_, i) => i / (n - 1) * 2)
  const sig = x.map((v) => 0.9 * Math.sin(2 * Math.PI * v))
  const levels = 2 ** (bits - 1)
  const q = sig.map((v) => Math.round(v * levels) / levels)
  const err = sig.map((v, i) => v - q[i])
  const snr = 6.02 * bits + 1.76
  return (
    <div className="flex flex-col gap-3">
      <Slider label="Bits por amostra" value={bits} min={2} max={16} step={1} unit="bits" onChange={setBits} />
      <div className="grid md:grid-cols-2 gap-3">
        <Chart height={230} data={[
          line(x, sig, 'Sinal', '#6b8aa3', { line: { color: '#6b8aa3', width: 1 } }),
          { x, y: q, name: 'Quantizado', type: 'scatter', mode: 'lines', line: { color: TEAL, width: 2, shape: 'hv' } },
        ]} layout={{ xaxis: ax('Tempo (1 período = 1)'), yaxis: ax('Amplitude (fundo de escala = 1)', { range: [-1.05, 1.05] }) }} />
        <Chart height={230} data={[line(x, err, 'Erro de quantização', ORANGE)]}
          layout={{ xaxis: ax('Tempo (1 período = 1)'), yaxis: ax('Erro (fundo de escala = 1)', { exponentformat: 'power' }), showlegend: false }} />
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Stat title="Níveis possíveis" value={(2 ** bits).toLocaleString(loc)} />
        <Stat title="Relação sinal-ruído" value={`${snr.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dB`} hint="de um tom de amplitude máxima: 6,02·N + 1,76" />
        <Stat title="Em 16 e 24 bits" value={tr('98 dB e 146 dB')} hint="a faixa dinâmica teórica dos formatos comuns" />
      </dl>
    </div>
  )
}

// ── Level trigger ────────────────────────────────────────────────────────────

/** A made-up level history (dBFS, one value per 50 ms): a quiet room, a knock and a longer event. */
function levelHistory() {
  const dt = 0.05, n = 160
  const t = Array.from({ length: n }, (_, i) => i * dt)
  const L = t.map((x) => {
    let p = 10 ** (-58 / 10)
    const burst = (t0: number, peak: number, tau: number) => (x >= t0 ? 10 ** (peak / 10) * Math.exp(-(x - t0) / tau) : 0)
    p += burst(2.0, -12, 0.35) + burst(4.2, -26, 0.7)
    const ripple = 1 + 0.35 * Math.sin(x * 37) * Math.sin(x * 11)
    return 10 * Math.log10(p * ripple)
  })
  return { t, L }
}

export function TriggerDemo() {
  const loc = useLoc()
  const [thr, setThr] = useState(-35)
  const [pre, setPre] = useState(0.5)
  const [hold, setHold] = useState(1)
  const { t, L } = useMemo(levelHistory, [])
  const trig = L.findIndex((v) => v >= thr)
  let start: number | null = null, end: number | null = null
  if (trig >= 0) {
    start = Math.max(0, t[trig] - pre)
    // the take stops when the level has stayed under the threshold for `hold` seconds
    let quiet = 0
    end = t[t.length - 1]
    for (let i = trig + 1; i < L.length; i++) {
      quiet = L[i] < thr ? quiet + 0.05 : 0
      if (quiet >= hold - 1e-9) { end = t[i]; break }
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Slider label="Limiar (threshold)" value={thr} min={-60} max={-5} step={1} unit="dBFS" onChange={setThr} />
        <Slider label="Pré-gravação (pre-roll)" value={pre} min={0} max={2} step={0.1} unit="s" onChange={setPre} />
        <Slider label="Espera final (hold)" value={hold} min={0.5} max={3} step={0.1} unit="s" onChange={setHold} />
      </div>
      <Chart height={260} data={[
        line(t, L, 'Nível', '#6b8aa3', { line: { color: '#6b8aa3', width: 1.5 } }),
        line([t[0], t[t.length - 1]], [thr, thr], 'Limiar', AMBER, { line: { color: AMBER, width: 1.5, dash: 'dash' } }),
      ]} layout={{
        xaxis: ax('Tempo (s)'), yaxis: ax('Nível (dBFS)', { range: [-70, 0] }), hovermode: 'x',
        shapes: start != null && end != null ? [{ type: 'rect', xref: 'x', yref: 'paper', x0: start, x1: end, y0: 0, y1: 1, fillcolor: 'rgba(80,184,158,0.18)', line: { width: 0 } }] : [],
      }} />
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Stat title="Disparo" value={trig >= 0 ? `${t[trig].toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : tr('não disparou')} hint="primeiro instante acima do limiar" />
        <Stat title="Gravação começa em" value={start != null ? `${start.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : '—'} hint="disparo menos a pré-gravação" />
        <Stat title="Duração do take" value={start != null && end != null ? `${(end - start).toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : '—'} hint="área verde do gráfico" />
      </dl>
    </div>
  )
}

// ── Fast time weighting and Leq ───────────────────────────────────────────────

export function FastDemo() {
  const loc = useLoc()
  const dt = 0.005, total = 3.2
  const t = Array.from({ length: Math.round(total / dt) }, (_, i) => i * dt)
  const on = (x: number) => (x >= 0.5 && x < 1.5 ? 1 : 0)                      // a burst of 1 s at 94 dB
  const burst = 10 ** (94 / 10)
  const quiet = 10 ** (40 / 10)
  const p = t.map((x) => (on(x) ? burst : quiet))
  const fast: number[] = [], slow: number[] = []
  let a = quiet, b = quiet
  for (const v of p) { a += (v - a) * (dt / 0.125); b += (v - b) * (dt / 1.0); fast.push(10 * Math.log10(a)); slow.push(10 * Math.log10(b)) }
  const leq = 10 * Math.log10(p.reduce((s, v) => s + v, 0) / p.length)
  return (
    <Chart height={280} data={[
      line(t, p.map((v) => 10 * Math.log10(v)), 'Nível instantâneo', '#6b8aa3', { line: { color: '#6b8aa3', width: 1, shape: 'hv' } }),
      line(t, fast, 'Fast (τ = 125 ms)', TEAL),
      line(t, slow, 'Slow (τ = 1 s)', BLUE, { line: { color: BLUE, width: 1.5, dash: 'dot' } }),
      line([0, total], [leq, leq], `${loc === 'en-US' ? 'Leq of the segment' : 'Leq do trecho'} (${leq.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dB)`, AMBER, { line: { color: AMBER, width: 1.5, dash: 'dash' } }),
    ]} layout={{ xaxis: ax('Tempo (s)'), yaxis: ax('Nível (dB SPL)', { range: [30, 100] }), hovermode: 'x unified' }} />
  )
}

// ── Calibration calculator ────────────────────────────────────────────────────

export function CalibrationDemo() {
  const loc = useLoc()
  const [level, setLevel] = useState(94)
  const [dbfs, setDbfs] = useState(-23)
  const pRms = 20e-6 * 10 ** (level / 20)                // Pa RMS of the calibrator
  const aRms = 10 ** (dbfs / 20)                          // RMS in full-scale units
  const paFs = pRms / aRms                                // Pa that stand for full scale (1.0)
  const sens = 1000 / paFs                                // mV/Pa for 1 V full scale
  const fsSpl = 20 * Math.log10(paFs / Math.SQRT2 / 20e-6)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-3 text-xs text-muted">
          <span className="w-44 shrink-0">{tr('Nível do calibrador')}</span>
          <div className="flex gap-1.5" role="group" aria-label={tr('Nível do calibrador')}>
            {[94, 114].map((l) => (
              <button key={l} onClick={() => setLevel(l)} aria-pressed={level === l}
                className={`px-3 py-1 rounded text-xs font-medium border transition-colors ${level === l ? 'bg-teal text-dark border-teal' : 'bg-panel border-field text-white hover:border-teal'}`}>{l} dB</button>
            ))}
          </div>
        </label>
        <Slider label="Nível medido na gravação" value={dbfs} min={-60} max={-3} step={0.5} unit="dBFS" onChange={setDbfs} />
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat title="Pressão do calibrador" value={`${pRms.toLocaleString(loc, { minimumFractionDigits: 4, maximumFractionDigits: 4 })} Pa`} hint="valor eficaz (RMS)" />
        <Stat title="Fundo de escala" value={`${paFs.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} Pa`} hint="pressão que o valor 1,0 representa" />
        <Stat title="Sensibilidade" value={`${sens.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mV/Pa`} hint="para 1 V no fundo de escala" />
        <Stat title="Tom de amplitude máxima" value={`${fsSpl.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dB SPL`} hint="o maior nível que cabe sem saturar" />
      </dl>
    </div>
  )
}

// ── Synchronous averaging ────────────────────────────────────────────────────

function rng(seed: number) { let s = seed; return () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296 } }
const gauss = (r: () => number) => Math.sqrt(-2 * Math.log(Math.max(r(), 1e-12))) * Math.cos(2 * Math.PI * r())

export function AveragingDemo() {
  const loc = useLoc()
  const [takes, setTakes] = useState(4)
  const n = 300
  const t = Array.from({ length: n }, (_, i) => i / n)
  const clean = t.map((x) => Math.exp(-3 * x) * Math.sin(2 * Math.PI * 9 * x))
  const sigma = 0.25
  const avg = useMemo(() => {
    const r = rng(11)
    const out = new Array(n).fill(0)
    for (let k = 0; k < takes; k++) for (let i = 0; i < n; i++) out[i] += (clean[i] + sigma * gauss(r)) / takes
    return out
  }, [takes])
  const psig = clean.reduce((s, v) => s + v * v, 0) / n
  const pnoise = avg.reduce((s, v, i) => s + (v - clean[i]) ** 2, 0) / n
  const snr = 10 * Math.log10(psig / pnoise)
  return (
    <div className="flex flex-col gap-3">
      <Slider label="Número de takes" value={takes} min={1} max={64} step={1} unit="takes" onChange={setTakes} />
      <Chart height={260} data={[
        line(t, avg, (loc === 'en-US' ? `Average of ${takes} take${takes > 1 ? 's' : ''}` : `Média de ${takes} take${takes > 1 ? 's' : ''}`), TEAL, { line: { color: TEAL, width: 1.5 } }),
        line(t, clean, 'Sinal verdadeiro', AMBER, { line: { color: AMBER, width: 2, dash: 'dash' } }),
      ]} layout={{ xaxis: ax('Tempo (fração do take)'), yaxis: ax('Amplitude', { range: [-2, 2] }) }} />
      <dl className="grid grid-cols-2 md:grid-cols-3 gap-2">
        <Stat title="Relação sinal-ruído obtida" value={`${snr.toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dB`} hint="medida nesta simulação" />
        <Stat title="Ganho teórico" value={`${(10 * Math.log10(takes)).toLocaleString(loc, { minimumFractionDigits: 1, maximumFractionDigits: 1 })} dB`} hint="10·log₁₀(N): +3 dB cada vez que dobra" />
        <Stat title="Ruído restante" value={`${(100 / Math.sqrt(takes)).toLocaleString(loc, { minimumFractionDigits: 0, maximumFractionDigits: 0 })} %`} hint="da amplitude de um take sozinho" />
      </dl>
    </div>
  )
}
