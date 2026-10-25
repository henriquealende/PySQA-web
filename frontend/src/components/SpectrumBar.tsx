import clsx from 'clsx'
import NumberInput from './NumberInput'
import { useT } from '../i18n'

type Range = [number, number] | null

const PRESETS: { label: string; short: string; range: [number, number] }[] = [
  { label: '20 Hz–20 kHz', short: '20–20k', range: [20, 20000] },
  { label: '20 Hz–10 kHz', short: '20–10k', range: [20, 10000] },
  { label: '100 Hz–5 kHz', short: '100–5k', range: [100, 5000] },
]

const round = (v: number) => Number(v.toPrecision(4))

/**
 * The controls of the spectrum chart in one row: the frequency range (typed or from a preset), the level range, the
 * fundamental of the harmonic cursor and the marks. Cursors themselves are placed with the right click on the chart.
 */
export default function SpectrumBar({ x, y, nyquist, unit, f0, pins, onX, onY, onF0, onClearPins }: {
  x: Range; y: Range; nyquist: number; unit: string; f0: number | null; pins: number
  onX: (r: Range) => void; onY: (r: Range) => void; onF0: (v: number | null) => void; onClearPins: () => void
}) {
  const t = useT()
  // A side typed alone completes the other one with the whole range
  const setX = (lo: number | null, hi: number | null) => {
    const nlo = lo ?? x?.[0] ?? Math.min(20, nyquist / 2)
    const nhi = hi ?? x?.[1] ?? nyquist
    if (nlo > 0 && nhi > nlo) onX([nlo, nhi])
  }
  const setY = (lo: number | null, hi: number | null) => {
    if (lo == null && hi == null) return
    const cur = y ?? [-120, 0]
    const nlo = lo ?? cur[0]
    const nhi = hi ?? cur[1]
    if (nhi > nlo) onY([nlo, nhi])
  }
  const sameRange = (a: Range, b: [number, number]) => !!a && Math.abs(a[0] - b[0]) < 0.5 && Math.abs(a[1] - b[1]) < 0.5
  const chip = (active: boolean) => clsx('px-1.5 py-0.5 rounded border transition-colors',
    active ? 'bg-teal/20 border-teal/50 text-teal' : 'border-border text-muted hover:text-white')
  const lbl = 'text-muted'

  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-x-4 sm:gap-y-1 sm:flex-wrap px-2 shrink-0 text-[11px]" role="group" aria-label={t('plot.sp.bar')}>
      <div className="flex items-center gap-x-1.5 gap-y-1 flex-wrap">
        <span className={lbl}>{t('plot.sp.axisF')}</span>
        <NumberInput value={x ? round(x[0]) : null} onChange={v => setX(v, null)} placeholder={t('plot.sp.auto')} title={t('plot.sp.fmin')} className="w-14 !py-0.5 !text-[11px]" />
        <span className={lbl}>–</span>
        <NumberInput value={x ? round(x[1]) : null} onChange={v => setX(null, v)} placeholder={t('plot.sp.auto')} title={t('plot.sp.fmax')} className="w-14 !py-0.5 !text-[11px]" />
        <span className={lbl}>Hz</span>
        <div className="grid grid-cols-4 gap-1 w-full sm:w-auto sm:flex sm:items-center sm:contents">
          {PRESETS.map(p => {
            const range: [number, number] = [p.range[0], Math.min(p.range[1], nyquist)]
            return (
              <button key={p.label} onClick={() => onX(range)} aria-pressed={sameRange(x, range)} aria-label={p.label} className={clsx(chip(sameRange(x, range)), 'text-center whitespace-nowrap')}>
                <span className="sm:hidden">{p.short}</span><span className="hidden sm:inline">{p.label}</span>
              </button>
            )
          })}
          <button onClick={() => { onX(null); onY(null) }} disabled={!x && !y} className={clsx(chip(false), 'text-center disabled:opacity-40')}>{t('plot.sp.auto')}</button>
        </div>
      </div>

      <div className="flex items-center gap-x-4 gap-y-1.5 flex-wrap sm:contents">
      <div className="flex items-center gap-1.5">
        <span className={lbl}>{t('plot.sp.axisY', { unit })}</span>
        <NumberInput value={y ? round(y[0]) : null} onChange={v => setY(v, null)} placeholder={t('plot.sp.auto')} title={t('plot.sp.ymin')} className="w-14 !py-0.5 !text-[11px]" />
        <span className={lbl}>–</span>
        <NumberInput value={y ? round(y[1]) : null} onChange={v => setY(null, v)} placeholder={t('plot.sp.auto')} title={t('plot.sp.ymax')} className="w-14 !py-0.5 !text-[11px]" />
      </div>

      <div className="flex items-center gap-1.5">
        <span className={lbl} title={t('plot.sp.f0Title')}>f₀</span>
        <NumberInput value={f0 ? round(f0) : null} onChange={v => onF0(v != null && v > 0 ? v : null)} placeholder="Hz" title={t('plot.sp.f0Title')} className="w-14 !py-0.5 !text-[11px]" />
        {f0 != null && <button onClick={() => onF0(null)} aria-label={t('plot.sp.f0Clear')} className="px-1 text-muted hover:text-white">✕</button>}
      </div>
      </div>

      {pins > 0 && (
        <button onClick={onClearPins} className="px-2 py-0.5 text-muted hover:text-white border border-border rounded transition-colors">
          {t(pins > 1 ? 'plot.pins.clearMany' : 'plot.pins.clearOne', { n: pins })}
        </button>
      )}
      <span className="text-muted/80 ml-auto [@media(hover:none)]:hidden">{t('plot.sp.hint')}</span>
    </div>
  )
}
