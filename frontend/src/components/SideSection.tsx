import { useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import clsx from 'clsx'

const key = (id: string) => `pysqa.sect.${id}`

/** A block of the side panel that can be folded. Remembers open/closed per id; `summary` is shown while it is closed. */
export default function SideSection({ id, title, defaultOpen = true, summary, children }: {
  id: string; title: string; defaultOpen?: boolean; summary?: ReactNode; children: ReactNode
}) {
  const [open, setOpen] = useState(() => {
    try { const v = localStorage.getItem(key(id)); if (v === '1' || v === '0') return v === '1' } catch { /* storage blocked */ }
    return defaultOpen
  })
  const toggle = () => setOpen(o => {
    try { localStorage.setItem(key(id), o ? '0' : '1') } catch { /* storage blocked */ }
    return !o
  })
  const panel = `sect-${id}`

  return (
    <section className="border-t border-border first:border-t-0 pt-3">
      <button
        type="button" onClick={toggle} aria-expanded={open} aria-controls={panel}
        className="w-full flex items-center gap-2 py-1 text-xs font-semibold text-muted hover:text-white transition-colors rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal"
      >
        <span>{title}</span>
        {!open && summary && <span className="ml-auto font-normal text-[11px] text-teal truncate">{summary}</span>}
        <ChevronDown size={14} aria-hidden="true" className={clsx('shrink-0 transition-transform', !open && '-rotate-90', !(!open && summary) && 'ml-auto')} />
      </button>
      {open && <div id={panel} className="pt-3 space-y-4">{children}</div>}
    </section>
  )
}
