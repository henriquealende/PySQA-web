import clsx from 'clsx'
import { useStore } from '../store/useStore'
import { useT } from '../i18n'
import type { TonalityPrecision } from '../types'

const OPTIONS: { value: TonalityPrecision; label: string }[] = [
  { value: 'exact', label: 'pp.page.precisionExact' },
  { value: 'fast', label: 'pp.page.precisionFast' },
]

/**
 * Exact or Fast calculation of Tonality ECMA-418-2 (Fast is about twice as quick and a little approximate).
 * `compact` is the one-line version of the batch bar; the sidebar one adds a sentence on what Fast gives up.
 */
export default function TonalityPrecisionSelect({ compact = false, disabled = false }: { compact?: boolean; disabled?: boolean }) {
  const t = useT()
  const precision = useStore((s) => s.precision)
  const setPrecision = useStore((s) => s.setPrecision)

  const buttons = OPTIONS.map(({ value, label }) => (
    <button
      key={value}
      type="button"
      aria-pressed={precision === value}
      onClick={() => setPrecision(value)}
      disabled={disabled}
      title={compact ? t('pp.page.precisionHint') : undefined}
    >
      {t(label)}
    </button>
  ))

  if (compact) {
    return (
      <div className="flex items-center gap-2" role="group" aria-label={t('pp.page.tonalityPrecision')}>
        <span className="text-xs text-muted">{t('pp.batch.tonality')}</span>
        <div className="seg">{buttons}</div>
      </div>
    )
  }
  return (
    <div className="border-t border-border pt-3 space-y-2">
      <p className="text-xs font-semibold text-muted">{t('pp.page.tonalityPrecision')}</p>
      <div className="seg seg-fill" role="group" aria-label={t('pp.page.tonalityPrecision')}>{buttons}</div>
      <p className="text-xs text-muted leading-snug">{t('pp.page.precisionHint')}</p>
    </div>
  )
}
