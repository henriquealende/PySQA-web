import { useState } from 'react'
import { Copy, Check, ChevronDown, ChevronRight } from 'lucide-react'
import type { MetricStats as Stats } from '../types'
import { useT, currentLocale } from '../i18n'

interface Row { name: string; color: string; stats: Stats; unit: string }

const EXCEEDED = ['5', '10', '50', '90', '95'] as const

/** Letter of the exceeded value: N for loudness, S sharpness, R roughness, P (percentile) for the others. */
function letter(metricKey: string): string {
  if (metricKey.startsWith('loudness')) return 'N'
  if (metricKey.startsWith('sharpness')) return 'S'
  if (metricKey.startsWith('roughness')) return 'R'
  return 'P'
}

/** Number with a precision that fits its size (loudness 23.4, tonality 0.0312). */
function fmt(v: number, locale: string): string {
  const a = Math.abs(v)
  const d = a >= 100 ? 1 : a >= 10 ? 2 : a >= 1 ? 3 : 4
  return v.toLocaleString(locale, { minimumFractionDigits: d, maximumFractionDigits: d })
}

/**
 * Statistics of the metric over time: mean, extremes and the values exceeded in 5, 10, 50, 90 and 95 % of the time
 * (N5 ... N95 for loudness, R5 ... R95 for roughness, and so on). One row per file; a second row when a file is being compared.
 */
export default function MetricStats({ rows, metricKey }: { rows: Row[]; metricKey: string }) {
  const t = useT()
  const L = letter(metricKey)
  const locale = currentLocale()
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  if (rows.length === 0) return null

  const copy = async () => {
    const head = ['file', 'unit', 'mean', 'std', 'min', 'max', 't_max_s', ...EXCEEDED.map(p => `${L}${p}`)].join('\t')
    const body = rows.map(r => [r.name, r.unit, r.stats.mean, r.stats.std, r.stats.min, r.stats.max, r.stats.t_max,
      ...EXCEEDED.map(p => r.stats.exceeded[p])].join('\t'))
    try {
      await navigator.clipboard.writeText([head, ...body].join('\n'))
      setCopied(true); setTimeout(() => setCopied(false), 1500)
    } catch { /* clipboard blocked: nothing to do */ }
  }

  const th = 'px-2 py-1 text-right font-medium text-muted whitespace-nowrap'
  const td = 'px-2 py-1 text-right tabular-nums whitespace-nowrap'
  return (
    <div className="px-2 shrink-0">
      <div className="flex items-center gap-2">
        <button onClick={() => setOpen(o => !o)} aria-expanded={open}
          className="flex items-center gap-1 text-[11px] text-muted hover:text-white transition-colors">
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {t('plot.stats.title')}
        </button>
        {open && (
          <button onClick={copy} title={t('plot.stats.copyTitle')}
            className="flex items-center gap-1 text-[11px] text-muted hover:text-white border border-border rounded px-1.5 py-0.5 transition-colors">
            {copied ? <Check size={11} /> : <Copy size={11} />}{copied ? t('plot.stats.copied') : t('plot.stats.copy')}
          </button>
        )}
      </div>
      {open && (
        <div className="overflow-x-auto mt-1">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1 text-left font-medium text-muted">{rows.length > 1 ? t('plot.stats.file') : ''}</th>
                <th className={th}>{t('plot.stats.mean')}</th>
                <th className={th}>{t('plot.stats.std')}</th>
                <th className={th}>{t('plot.stats.min')}</th>
                <th className={th}>{t('plot.stats.max')}</th>
                <th className={th} title={t('plot.stats.tMaxTitle')}>{t('plot.stats.tMax')}</th>
                {EXCEEDED.map(p => <th key={p} className={th} title={t('plot.stats.nTitle', { p })}>{L}{p}</th>)}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.name}>
                  <td className="px-2 py-1 text-left max-w-[10rem] truncate" style={{ color: r.color }} title={r.name}>{r.name}</td>
                  <td className={td}>{fmt(r.stats.mean, locale)}</td>
                  <td className={td}>{fmt(r.stats.std, locale)}</td>
                  <td className={td}>{fmt(r.stats.min, locale)}</td>
                  <td className={td}>{fmt(r.stats.max, locale)}</td>
                  <td className={td}>{r.stats.t_max.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</td>
                  {EXCEEDED.map(p => <td key={p} className={td}>{fmt(r.stats.exceeded[p], locale)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted mt-1">{t('plot.stats.note', { unit: rows[0].unit || '—', l: L })}</p>
        </div>
      )}
    </div>
  )
}
