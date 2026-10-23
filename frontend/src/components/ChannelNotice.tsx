import { Info } from 'lucide-react'
import { useT } from '../i18n'

/** Says that, for a file with two channels, this part of the analysis uses only the left one. */
export default function ChannelNotice({ className = '' }: { className?: string }) {
  const t = useT()
  return (
    <p role="note" className={`flex gap-1.5 rounded border border-teal/30 bg-teal/5 px-2 py-1.5 text-[11px] leading-snug text-muted ${className}`}>
      <Info size={12} className="mt-0.5 shrink-0 text-teal" aria-hidden="true" />
      <span>{t('pp.channels.notice')}</span>
    </p>
  )
}
