import { useMemo, useState } from 'react'
import Plot from '../../components/Plot'
import { AMBER, BLUE, Chart, ORANGE, TEAL, ax, line } from './demos'
import { FRF_DEMO as D } from './demoFrf'
import { tr as tt, trDeep } from './demoTr'
import { useLang } from '../../i18n'

const loc = () => (useLang.getState().lang === 'en' ? 'en-US' : 'pt-BR')
const fmt = (v: number, d = 2) => v.toLocaleString(loc(), { minimumFractionDigits: d, maximumFractionDigits: d })
const pct = (v: number | null | undefined) => (v == null ? '—' : fmt(v * 100, 2) + ' %')

const Slider = ({ label, value, min, max, step, unit, onChange }: {
  label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void
}) => (
  <label className="flex items-center gap-3 text-xs text-muted">
    <span className="w-48 shrink-0">{tt(label)}</span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
      className="accent-teal flex-1 min-w-24 max-w-64" aria-label={tt(label)} />
    <span className="text-white font-semibold tabular-nums w-24">{fmt(value, step < 1 ? 1 : 0)} {unit}</span>
  </label>
)

const Stat = ({ title, value, hint }: { title: string; value: string; hint?: string }) => (
  <div className="rounded-lg bg-panel/60 border border-border px-3 py-2">
    <dt className="text-muted text-[12px]">{tt(title)}</dt>
    <dd className="text-white text-sm font-semibold tabular-nums">{value}</dd>
    {hint && <dd className="text-muted text-[11px] leading-snug">{tt(hint)}</dd>}
  </div>
)

const BASE: any = {
  paper_bgcolor: 'transparent', plot_bgcolor: '#111c28',
  font: { color: '#e2e8f0', size: 11, family: 'Inter, system-ui, sans-serif' },
  margin: { l: 58, r: 14, t: 10, b: 44 }, autosize: true, hovermode: 'x',
  hoverlabel: { bgcolor: '#1c2a38', bordercolor: TEAL, font: { color: 'white', size: 11 } },
  legend: { orientation: 'h', y: 1.1, x: 0, font: { size: 10, color: '#8ab4c9' }, bgcolor: 'transparent' },
}
const AX = { gridcolor: '#1e2d3d', zerolinecolor: '#2b3c50', color: '#8ab4c9', linecolor: '#2b3c50' }

// ── Bode with coherence, from a real PySQA calculation ───────────────────────

export function BodeCoherenceChart() {
  const f = [...D.f]
  const data: any[] = [
    { x: f, y: [...D.trueDb], name: 'Sistema verdadeiro', type: 'scatter', mode: 'lines', line: { color: AMBER, width: 2, dash: 'dash' }, xaxis: 'x', yaxis: 'y' },
    { x: f, y: [...D.h1Db], name: 'FRF estimada (H1)', type: 'scatter', mode: 'lines', line: { color: TEAL, width: 1.5 }, xaxis: 'x', yaxis: 'y' },
    { x: f, y: [...D.phase], name: 'Fase', type: 'scatter', mode: 'lines', line: { color: TEAL, width: 1.2 }, xaxis: 'x2', yaxis: 'y2', showlegend: false },
    { x: f, y: [...D.coh], name: 'Coerência', type: 'scatter', mode: 'lines', line: { color: BLUE, width: 1.2 }, xaxis: 'x3', yaxis: 'y3', showlegend: false },
  ]
  const layout = {
    ...BASE, height: 420,
    xaxis: { ...AX, type: 'log', anchor: 'y', showticklabels: false, range: [Math.log10(20), Math.log10(600)] },
    yaxis: { ...AX, domain: [0.56, 1], title: { text: 'Acelerância (dB)' } },
    xaxis2: { ...AX, type: 'log', anchor: 'y2', matches: 'x', showticklabels: false },
    yaxis2: { ...AX, domain: [0.29, 0.5], title: { text: 'Fase (°)' }, range: [-190, 190], dtick: 90 },
    xaxis3: { ...AX, type: 'log', anchor: 'y3', matches: 'x', title: { text: 'Frequência (Hz)' } },
    yaxis3: { ...AX, domain: [0, 0.23], title: { text: 'Coerência' }, range: [0, 1.05], dtick: 0.5 },
  }
  return <div style={{ height: 420 }}><Plot data={trDeep(data)} layout={trDeep(layout)} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: '100%' }} className="w-full h-full" /></div>
}

// ── H1, H2 and Hv when the force is noisy too ─────────────────────────────────

export function EstimatorsChart() {
  const f = [...D.f]
  return <Chart height={300} data={[
    line(f, [...D.trueDb], 'Verdadeiro', AMBER, { line: { color: AMBER, width: 2, dash: 'dash' } }),
    line(f, [...D.noisy.H1], 'H1', TEAL),
    line(f, [...D.noisy.H2], 'H2', ORANGE),
    line(f, [...D.noisy.Hv], 'Hv', BLUE, { line: { color: BLUE, width: 2 } }),
  ]} layout={{ xaxis: ax('Frequência (Hz)', { range: [206, 221] }), yaxis: ax('Acelerância (dB)', { range: [112, 134] }), hovermode: 'x unified' }} />
}

// ── Impact windows ────────────────────────────────────────────────────────────

export function ImpactWindowsDemo() {
  const [forceMs, setForceMs] = useState(8)
  const [endPct, setEndPct] = useState(2)
  const T = 1.6, pre = 0.08, fn = 100, z = 0.02
  const n = 800
  const t = useMemo(() => Array.from({ length: n }, (_, i) => (i / (n - 1)) * T), [])
  const wn = 2 * Math.PI * fn
  const resp = t.map((x) => (x < pre ? 0 : Math.exp(-z * wn * (x - pre)) * Math.sin(wn * Math.sqrt(1 - z * z) * (x - pre))))
  const force = t.map((x) => (x >= pre && x < pre + 0.002 ? Math.sin(Math.PI * (x - pre) / 0.002) : 0) + (x > pre + 0.0025 && x < pre + 0.012 ? 0.04 * Math.sin(2 * Math.PI * 90 * x) * Math.exp(-(x - pre) * 220) : 0))
  const wf = t.map((x) => (x <= pre + forceMs * 1e-3 ? 1 : 0))
  const k = -Math.log(Math.max(endPct, 0.01) / 100) / (T - pre)
  const wr = t.map((x) => (x <= pre ? 1 : Math.exp(-k * (x - pre))))
  const added = k / wn
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Slider label="Janela de força (ms)" value={forceMs} min={1} max={30} step={1} unit="ms" onChange={setForceMs} />
        <Slider label="Janela exponencial termina em" value={endPct} min={0.5} max={50} step={0.5} unit="%" onChange={setEndPct} />
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        <Chart height={230} data={[
          line(t, force, 'Força', '#6b8aa3', { line: { color: '#6b8aa3', width: 1.2 } }),
          line(t, wf, 'Janela de força', ORANGE, { line: { color: ORANGE, width: 1.5, dash: 'dash' } }),
          line(t, force.map((v, i) => v * wf[i]), 'Força janelada', TEAL),
        ]} layout={{ xaxis: ax('Tempo (s)', { range: [0, 0.3] }), yaxis: ax('Força (u.a.)', { range: [-0.4, 1.3] }), hovermode: 'closest' }} />
        <Chart height={230} data={[
          line(t, resp, 'Resposta', '#6b8aa3', { line: { color: '#6b8aa3', width: 1 } }),
          line(t, wr, 'Janela exponencial', ORANGE, { line: { color: ORANGE, width: 1.5, dash: 'dash' } }),
          line(t, resp.map((v, i) => v * wr[i]), 'Resposta janelada', TEAL, { line: { color: TEAL, width: 1.5 } }),
        ]} layout={{ xaxis: ax('Tempo (s)'), yaxis: ax('Resposta (u.a.)', { range: [-1.2, 1.4] }), hovermode: 'closest' }} />
      </div>
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat title="Taxa da janela exponencial" value={`${fmt(k, 1)} 1/s`} hint="quão rápido ela decai" />
        <Stat title="Amortecimento verdadeiro (ζ)" value={pct(z)} hint="do sistema simulado (modo de 100 Hz)" />
        <Stat title="Amortecimento acrescentado" value={pct(added)} hint="k / ωn: a janela amortece artificialmente" />
        <Stat title="O que se mediria sem corrigir" value={pct(z + added)} hint="o PySQA subtrai o acréscimo" />
      </dl>
    </div>
  )
}

// ── Half-power method ─────────────────────────────────────────────────────────

export function HalfPowerDemo() {
  const [zeta, setZeta] = useState(0.03)
  const fn = 100
  const n = 1400
  const f = useMemo(() => Array.from({ length: n }, (_, i) => 70 + (i / (n - 1)) * 60), [])
  const mag = f.map((x) => { const r = x / fn; return 1 / Math.sqrt((1 - r * r) ** 2 + (2 * zeta * r) ** 2) })
  const peak = Math.max(...mag), ip = mag.indexOf(peak)
  const level = peak / Math.SQRT2
  let lo = f[0], hi = f[n - 1]
  for (let i = ip; i > 0; i--) if (mag[i - 1] <= level) { lo = f[i - 1] + (level - mag[i - 1]) / (mag[i] - mag[i - 1]) * (f[i] - f[i - 1]); break }
  for (let i = ip; i < n - 1; i++) if (mag[i + 1] <= level) { hi = f[i + 1] - (level - mag[i + 1]) / (mag[i] - mag[i + 1]) * (f[i + 1] - f[i]); break }
  const est = (hi - lo) / (2 * f[ip])
  return (
    <div className="flex flex-col gap-3">
      <Slider label="Amortecimento verdadeiro ζ" value={zeta * 100} min={0.5} max={15} step={0.5} unit="%" onChange={(v) => setZeta(v / 100)} />
      <Chart height={260} data={[
        line(f, mag.map((v) => v / peak), 'Receptância (normalizada)', TEAL),
        line([f[0], f[n - 1]], [1 / Math.SQRT2, 1 / Math.SQRT2], '−3 dB do pico', AMBER, { line: { color: AMBER, width: 1.5, dash: 'dash' } }),
        { x: [lo, hi], y: [1 / Math.SQRT2, 1 / Math.SQRT2], name: 'f1 e f2', type: 'scatter', mode: 'markers', marker: { size: 10, color: ORANGE } },
      ]} layout={{ xaxis: ax('Frequência (Hz)'), yaxis: ax('|H| / pico', { range: [0, 1.1] }), hovermode: 'closest' }} />
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat title="f1 e f2 (−3 dB)" value={`${fmt(lo, 1)} ${tt('e')} ${fmt(hi, 1)} Hz`} hint="onde a curva cai a 70,7 % do pico" />
        <Stat title="Largura Δf" value={`${fmt(hi - lo, 2)} Hz`} />
        <Stat title="ζ estimado" value={pct(est)} hint="Δf / (2·fn)" />
        <Stat title="Erro" value={`${fmt((est / zeta - 1) * 100, 1)} %`} hint="pequeno com pouco amortecimento" />
      </dl>
    </div>
  )
}

// ── Nyquist circle of one mode ───────────────────────────────────────────────

export function NyquistModeChart() {
  const zeta = 0.03, fn = 100
  const f = Array.from({ length: 800 }, (_, i) => 70 + (i / 799) * 60)
  const re: number[] = [], im: number[] = []
  for (const x of f) {
    const r = x / fn, d = (1 - r * r) ** 2 + (2 * zeta * r) ** 2
    re.push((1 - r * r) / d); im.push(-(2 * zeta * r) / d)
  }
  const marks = [fn * (1 - zeta), fn, fn * (1 + zeta)].map((x) => { const r = x / fn, d = (1 - r * r) ** 2 + (2 * zeta * r) ** 2; return [(1 - r * r) / d, -(2 * zeta * r) / d, x] })
  return (
    <Chart height={300} data={[
      line(re, im, 'Receptância', TEAL),
      { x: marks.map((m) => m[0]), y: marks.map((m) => m[1]), name: 'f1, fn, f2', type: 'scatter', mode: 'markers+text', text: marks.map((m) => `${fmt(m[2], 0)} Hz`), textposition: 'top right', marker: { size: 9, color: ORANGE }, textfont: { color: '#e2e8f0', size: 10 } },
    ]} layout={{ xaxis: ax('Parte real', { exponentformat: 'none' }), yaxis: ax('Parte imaginária', { scaleanchor: 'x' }), hovermode: 'closest' }} />
  )
}

// ── Detected modes and the check against the truth ────────────────────────────

export function ModesFoundChart() {
  const f = [...D.f]
  const mf = D.modes.map((m) => m.fn)
  return <Chart height={280} data={[
    line(f, [...D.mif], 'Indicador de modos (MIF)', TEAL),
    { x: mf, y: mf.map((fn) => D.mif[f.reduce((b, v, i) => (Math.abs(v - fn) < Math.abs(f[b] - fn) ? i : b), 0)]), name: 'Modos detectados', type: 'scatter', mode: 'markers+text', text: mf.map((_, i) => String(i + 1)), textposition: 'top center', marker: { size: 10, color: AMBER, symbol: 'diamond' }, textfont: { color: AMBER, size: 11 } },
  ]} layout={{ xaxis: ax('Frequência (Hz)', { type: 'log' }), yaxis: ax('Acelerância (dB)') }} />
}

export function ModesCheckTable() {
  const rows = D.modes.map((m, i) => ({ m, tr: D.truth[i], im: D.impact.modes[i] }))
  const th = 'px-3 py-2 font-medium text-left'
  const td = 'px-3 py-2 tabular-nums'
  return (
    <div className="overflow-x-auto max-w-[860px]">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-muted border-b border-border">
            <th className={th}>{tt('Modo')}</th><th className={th}>{tt('fn verdadeira')}</th><th className={th}>{tt('fn estimada')}</th>
            <th className={th}>{tt('ζ verdadeiro')}</th><th className={th}>{tt('ζ meia-potência')}</th><th className={th}>{tt('ζ ajuste')}</th><th className={th}>{tt('ζ impacto')}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ m, tr, im }, i) => (
            <tr key={i} className="border-b border-border/50 text-slate-200">
              <td className={`${td} text-white font-medium`}>{i + 1}</td>
              <td className={td}>{fmt(tr.fn, 1)} Hz</td>
              <td className={td}>{fmt(m.fn, 2)} Hz</td>
              <td className={td}>{pct(tr.zeta)}</td>
              <td className={td}>{pct(m.hp)}</td>
              <td className={`${td} text-teal font-semibold`}>{pct(m.fit)}</td>
              <td className={td}>{pct(im?.zeta)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Resolution calculator ─────────────────────────────────────────────────────

export function ResolutionDemo() {
  const [fs, setFs] = useState(2048)
  const [block, setBlock] = useState(8192)
  const [dur, setDur] = useState(60)
  const df = fs / block, T = block / fs
  const avgs = Math.max(0, Math.floor((dur * fs - block) / (block / 2)) + 1)
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-4 text-xs text-muted">
        <label className="flex items-center gap-2">{tt('Taxa de amostragem')}
          <select value={fs} onChange={(e) => setFs(Number(e.target.value))} className="bg-panel border border-field rounded px-2 py-1 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {[1024, 2048, 4096, 8192, 16384, 48000].map((r) => <option key={r} value={r}>{r.toLocaleString(loc())} Hz</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2">{tt('Comprimento do bloco')}
          <select value={block} onChange={(e) => setBlock(Number(e.target.value))} className="bg-panel border border-field rounded px-2 py-1 text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal">
            {[1024, 2048, 4096, 8192, 16384, 32768, 65536].map((b) => <option key={b} value={b}>{b.toLocaleString(loc())} {tt('amostras')}</option>)}
          </select>
        </label>
      </div>
      <Slider label="Duração da gravação" value={dur} min={5} max={600} step={5} unit="s" onChange={setDur} />
      <dl className="grid grid-cols-2 md:grid-cols-4 gap-2">
        <Stat title="Resolução Δf" value={`${fmt(df, 3)} Hz`} hint="fs / N: distância entre linhas" />
        <Stat title="Duração do bloco" value={`${fmt(T, 2)} s`} hint="N / fs: precisa abrigar a resposta" />
        <Stat title="Médias (50 % de sobreposição)" value={avgs.toLocaleString(loc())} hint="mais médias, menos ruído" />
        <Stat title="Redução do ruído" value={avgs > 0 ? `${fmt(100 / Math.sqrt(avgs), 0)} %` : '—'} hint="1/√médias, em amplitude" />
      </dl>
    </div>
  )
}

