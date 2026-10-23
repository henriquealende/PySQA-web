import clsx from 'clsx'
import { useAuralStore } from '../../store/useAuralStore'
import { useLocale, useT } from '../../i18n'
import type { LevelMode } from '../../api/auralizationApi'

const MODES: LevelMode[] = ['off', 'spl', 'source']

/**
 * Absolute level: a target in dB SPL. The file holds numbers, not pressure, so the user says how loud a full-scale sine
 * is on their equipment; everything here is a calculation from that statement, not a measurement.
 */
export default function LevelSection({ gainDb, calibrated }: { gainDb: number | null; calibrated: boolean }) {
  const t = useT()
  const locale = useLocale()
  const { level, setLevel } = useAuralStore()
  const fmt = (n: number) => n.toLocaleString(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 })
  const field = 'w-16 bg-dark border border-field rounded px-1.5 py-0.5 text-xs text-right focus:border-teal'

  return (
    <section className="rounded-lg border border-border bg-panel p-4 space-y-3" aria-labelledby="aur-lv">
      <h2 id="aur-lv" className="text-sm font-semibold">{t('aur.lv.title')}</h2>
      <div className="flex flex-wrap rounded overflow-hidden border border-border w-fit" role="radiogroup" aria-label={t('aur.lv.title')}>
        {MODES.map((m) => {
          const blocked = m === 'source' && !calibrated
          return (
            <button
              key={m} role="radio" aria-checked={level.mode === m} disabled={blocked}
              title={blocked ? t('aur.lv.needsCal') : undefined}
              onClick={() => setLevel({ mode: m })}
              className={clsx('px-3 py-1.5 text-xs disabled:opacity-40', level.mode === m ? 'bg-teal text-dark font-semibold' : 'bg-dark text-muted hover:text-white')}
            >
              {t(`aur.lv.mode.${m}`)}
            </button>
          )
        })}
      </div>
      <p className="text-[11px] text-muted">{t('aur.lv.help')}</p>
      {!calibrated && <p className="text-[11px] text-muted">{t('aur.lv.needsCal')}</p>}

      {level.mode !== 'off' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
            <label className="text-xs text-muted flex items-center gap-2" htmlFor="aur-lv-fs">
              {t('aur.lv.equipment')}
              <input id="aur-lv-fs" className={field} type="number" min={40} max={160} step={1} value={level.fs_db_spl}
                onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v)) setLevel({ fs_db_spl: Math.min(160, Math.max(40, v)) }) }} />
              dB SPL
            </label>
            <label className="text-xs text-muted flex items-center gap-2" htmlFor="aur-lv-w">
              {t('aur.lv.weighting')}
              <select
                id="aur-lv-w" value={level.weighting} onChange={(e) => setLevel({ weighting: e.target.value as 'A' | 'Z' })}
                className="bg-dark border border-field rounded px-2 py-1 text-xs focus:border-teal"
              >
                <option value="A">{t('aur.lv.weightingA')}</option>
                <option value="Z">{t('aur.lv.weightingZ')}</option>
              </select>
            </label>
          </div>
          {level.mode === 'spl' && (
            <div className="flex items-center gap-3">
              <label htmlFor="aur-lv-target" className="text-xs text-muted w-36 shrink-0">{t('aur.lv.target')}</label>
              <input
                id="aur-lv-target" type="range" min={20} max={110} step={1} value={level.target_db_spl}
                onChange={(e) => setLevel({ target_db_spl: Number(e.target.value) })} className="flex-1 accent-teal"
              />
              <span className="text-xs tabular-nums w-24 text-right">{level.target_db_spl} dB SPL{level.weighting === 'A' ? ' (A)' : ''}</span>
            </div>
          )}
          {level.mode === 'source' && <p className="text-[11px] text-muted">{t('aur.lv.sourceNote')}</p>}
          {gainDb !== null && (
            <p className="text-xs">{t('aur.lv.gain', { db: `${gainDb > 0 ? '+' : ''}${fmt(gainDb)}` })}</p>
          )}
          <p className="text-[11px] text-amber">{t('aur.lv.warning')}</p>
        </div>
      )}
    </section>
  )
}
