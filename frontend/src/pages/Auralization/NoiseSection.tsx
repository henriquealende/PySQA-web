import clsx from 'clsx'
import { useAuralStore } from '../../store/useAuralStore'
import { useT } from '../../i18n'
import type { NoiseType } from '../../api/auralizationApi'

const TYPES: NoiseType[] = ['none', 'white', 'pink', 'brown']

/** Background noise at a chosen signal-to-noise ratio (the car's rolling noise, the cruise noise of a plane). */
export default function NoiseSection() {
  const t = useT()
  const { noise, setNoise } = useAuralStore()
  return (
    <section className="rounded-lg border border-border bg-panel p-4 space-y-3" aria-labelledby="aur-noise">
      <h2 id="aur-noise" className="text-sm font-semibold">{t('aur.noise.title')}</h2>
      <div className="flex flex-wrap rounded overflow-hidden border border-border w-fit" role="radiogroup" aria-label={t('aur.noise.title')}>
        {TYPES.map((ty) => (
          <button
            key={ty} role="radio" aria-checked={noise.type === ty} onClick={() => setNoise({ type: ty })}
            className={clsx('px-3 py-1.5 text-xs', noise.type === ty ? 'bg-teal text-dark font-semibold' : 'bg-dark text-muted hover:text-white')}
          >
            {t(`aur.noise.type.${ty}`)}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-muted">{t('aur.noise.help')}</p>
      {noise.type !== 'none' && (
        <>
          <div className="flex items-center gap-3">
            <label htmlFor="aur-snr" className="text-xs text-muted w-36 shrink-0">{t('aur.noise.snr')}</label>
            <input
              id="aur-snr" type="range" min={-10} max={40} step={1} value={noise.snr_db}
              onChange={(e) => setNoise({ snr_db: Number(e.target.value) })} className="flex-1 accent-teal"
            />
            <span className="text-xs tabular-nums w-14 text-right">{noise.snr_db} dB</span>
          </div>
          <p className="text-[11px] text-muted">{t('aur.noise.snrNote')}</p>
        </>
      )}
    </section>
  )
}
