import { useState, type ReactNode } from 'react'

/** A block that is open on a wide screen and folded on a phone, so the page starts with what matters. */
export default function MobileFold({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(() => window.matchMedia('(min-width: 1024px)').matches)
  return (
    <details open={open} onToggle={e => setOpen(e.currentTarget.open)} className={className}>
      <summary className="cursor-pointer select-none text-xs font-semibold text-white min-h-[2.5rem] flex items-center">{title}</summary>
      <div className="pt-1">{children}</div>
    </details>
  )
}
