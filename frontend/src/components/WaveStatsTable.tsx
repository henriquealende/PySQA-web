import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { WaveStats } from '../types'
import { useT, currentLocale } from '../i18n'
import { fmt } from './MetricStats'

interface Row { name: string; color: string; stats: WaveStats }

/**
 * Mean, standard deviation, minimum and maximum of the waveform and, when the file is calibrated,
 * LZeq, LAeq, LZmax, LAmax and Lpeak. One row per file (and per channel of a stereo file).
 */
export default function WaveStatsTable({ rows, calibrated }: { rows: Row[]; calibrated: boolean }) {
  const t = useT()
  const locale = currentLocale()
  const [open, setOpen] = useState(true)
  if (rows.length === 0) return null

  const th = 'px-2 py-1 text-right font-medium text-muted whitespace-nowrap'
  const td = 'px-2 py-1 text-right tabular-nums whitespace-nowrap'
  const lv = (v: number | null | undefined) => (v == null ? '—' : v.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
  const named = rows.length > 1
  return (
    <div className="px-2 shrink-0">
      <button onClick={() => setOpen(o => !o)} aria-expanded={open}
        className="flex items-center gap-1 text-[11px] text-muted hover:text-white transition-colors">
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        {t('plot.wstats.title')}
      </button>
      {open && (
        <div className="overflow-x-auto mt-1">
          <table className="text-[11px] border-collapse">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1 text-left font-medium text-muted">{named ? t('plot.stats.file') : ''}</th>
                <th className={th}>{t('plot.stats.mean')}</th>
                <th className={th}>{t('plot.stats.std')}</th>
                <th className={th}>{t('plot.stats.min')}</th>
                <th className={th}>{t('plot.stats.max')}</th>
                {calibrated && <>
                  <th className={th}>LZeq</th>
                  <th className={th}>LAeq</th>
                  <th className={th} title={t('plot.wstats.lzmaxTitle')}>LZmax</th>
                  <th className={th} title={t('plot.wstats.lamaxTitle')}>LAmax</th>
                  <th className={th} title={t('plot.wstats.lpeakTitle')}>Lpeak</th>
                </>}
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
                  {calibrated && <>
                    <td className={td}>{lv(r.stats.levels?.lzeq)}</td>
                    <td className={td}>{lv(r.stats.levels?.laeq)}</td>
                    <td className={td}>{lv(r.stats.levels?.lzmax)}</td>
                    <td className={td}>{lv(r.stats.levels?.lamax)}</td>
                    <td className={td}>{lv(r.stats.levels?.lpeak)}</td>
                  </>}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[10px] text-muted mt-1">
            {t('plot.wstats.note', { unit: calibrated ? t('plot.wstats.unitPa') : t('plot.wstats.unitFs') })}
            {!calibrated && ` ${t('plot.wstats.noCal')}`}
          </p>
        </div>
      )}
    </div>
  )
}
