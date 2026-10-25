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
    <div role="group" aria-label={t('common.language')} className={clsx('seg', className)}>
      {OPTIONS.map((o) => (
        <button key={o.lang} onClick={() => setLang(o.lang)} aria-pressed={lang === o.lang} title={o.full}
          className="font-semibold">
          {o.label}
        </button>
      ))}
    </div>
  )
}
