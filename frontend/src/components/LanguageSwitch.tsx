import clsx from 'clsx'
import { useLang, useT, type Lang } from '../i18n'

const OPTIONS: { lang: Lang; label: string; full: string }[] = [
  { lang: 'pt', label: 'PT', full: 'Português' },
  { lang: 'en', label: 'EN', full: 'English' },
]

/** Switch between the interface languages. Portuguese is the default. */
export default function LanguageSwitch({ className }: { className?: string }) {
  const { lang, setLang } = useLang()
  const t = useT()
  return (
    <div role="group" aria-label={t('common.language')} className={clsx('flex rounded-md border border-field overflow-hidden', className)}>
      {OPTIONS.map((o) => (
        <button key={o.lang} onClick={() => setLang(o.lang)} aria-pressed={lang === o.lang} title={o.full}
          className={clsx('px-3 py-2 text-sm font-semibold transition-colors',
            lang === o.lang ? 'bg-teal text-dark' : 'bg-panel text-white hover:text-teal')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}
