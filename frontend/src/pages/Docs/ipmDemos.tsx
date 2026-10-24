import { useState } from 'react'
import { AMBER, Chart, ORANGE, TEAL, ax } from './demos'
import { DEMO_IPM } from './demoIpm'
import { tr } from './demoTr'
import { useLang } from '../../i18n'

/** One noise burst, two sweeps: smaller ('size') or longer ('duration'). Data: the real IPM code (see dev-tests/gen_docs_ipm.py). */
function IpmSweep({ mode }: { mode: 'size' | 'duration' }) {
  useLang((s) => s.lang)
  const [i, setI] = useState(0)
  const size = mode === 'size'
  const steps: any[] = size ? DEMO_IPM.steps : DEMO_IPM.durSteps
  const win: number[] = size ? DEMO_IPM.window : DEMO_IPM.windowDur
  const z = DEMO_IPM.z
  const s = steps[i]
  const n = s.wave.length
  const t = s.wave.map((_: number, k: number) => win[0] + ((k + 0.5) * (win[1] - win[0])) / n)
  const peak = Math.max(...steps[0].wave.map(Math.abs)) * 1.05
  const verdict = s.bands_over > 0 ? tr('impulsivo (MPI > 5 dB)') : s.max > 0 ? tr('evento fraco, abaixo do limiar') : tr('sem evento')
  const nDet = s.detected.filter(Boolean).length
  return (
    <div className="flex flex-col gap-3">
      <label className="flex flex-wrap items-center gap-3 text-xs text-muted">
        {size ? tr('Tamanho do evento acima do ruído de fundo:') : tr('Duração do evento (tempo de subida):')}
        <span className="text-white font-semibold tabular-nums w-16">{size ? `${s.db} dB` : `${s.ms} ms`}</span>
        <input type="range" min={0} max={steps.length - 1} step={1} value={i} onChange={(e) => setI(Number(e.target.value))}
          className="accent-teal w-56" aria-label={size ? tr('Tamanho do evento') : tr('Duração do evento')} />
        <span className="text-[11px]">{size ? tr('← maior | menor →') : tr('← mais curto | mais longo →')}</span>
      </label>
      <Chart height={170} data={[
        { x: t, y: s.wave, name: 'Sinal', type: 'scatter', mode: 'lines', line: { color: TEAL, width: 1 } },
      ]} layout={{ xaxis: ax('Tempo (s)', { range: win }), yaxis: ax('Amplitude', { range: [-peak, peak] }), showlegend: false, margin: { l: 56, r: 14, t: 6, b: 40 } }} />
      <Chart height={260} data={[
        { x: [z[0], z[z.length - 1]], y: [5, 5], name: 'Limiar de impulsividade (5 dB)', type: 'scatter', mode: 'lines', line: { color: AMBER, width: 1.5, dash: 'dash' }, hoverinfo: 'skip' },
        { x: z, y: s.mpi, name: 'IPM por banda', type: 'scatter', mode: 'lines', line: { color: ORANGE, width: 2 } },
        { x: z.filter((_: number, k: number) => s.detected[k]), y: s.mpi.filter((_: number, k: number) => s.detected[k]), name: 'Bandas com evento', type: 'scatter', mode: 'markers', marker: { size: 6, color: ORANGE } },
      ]} layout={{ xaxis: ax('Banda crítica (Bark HMS)', { range: [0, 27] }), yaxis: ax('IPM (dB)', { range: [-4, 10] }), hovermode: 'x unified' }} />
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
        {[
          [tr('MPI máximo'), `${s.max.toFixed(1)} dB`],
          [tr('Bandas com evento'), `${nDet} / ${z.length}`],
          [tr('Valor global'), `${s.global.toFixed(1)} dB`],
          [tr('Resultado'), verdict],
        ].map(([k, v]) => (
          <div key={k} className="rounded-lg border border-border bg-[#111c28] px-3 py-2">
            <div className="text-muted">{k}</div>
            <div className="text-white font-semibold">{v}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

export const IpmEventDemo = () => <IpmSweep mode="size" />
export const IpmDurationDemo = () => <IpmSweep mode="duration" />
