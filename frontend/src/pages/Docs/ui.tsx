import { createContext, ReactNode, useContext } from 'react'
import { Info, Lightbulb, TriangleAlert } from 'lucide-react'
import clsx from 'clsx'
import { REFS, sortRefs } from './refs'
import { useLang } from '../../i18n'

/** The references cited so far on the page being drawn; filled by <Cite>, listed by <Bibliography>. */
export const CiteContext = createContext<Set<string>>(new Set())

export function Cite({ ids, text }: { ids: string[]; text?: string }) {
  const used = useContext(CiteContext)
  ids.forEach((id) => used.add(id))
  const parts = ids.map((id) => REFS[id]?.cite ?? id.toUpperCase())
  return <span className="text-muted sm:whitespace-nowrap">{text ?? `(${parts.join('; ')})`}</span>
}

function renderEntry(text: string): ReactNode[] {
  // **bold** and *italic* inside the reference string
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((p, i) => {
    if (p.startsWith('**')) return <strong key={i} className="text-white font-semibold">{p.slice(2, -2)}</strong>
    if (p.startsWith('*')) return <em key={i}>{p.slice(1, -1)}</em>
    return <span key={i}>{p}</span>
  })
}

export function Bibliography({ extra = [] }: { extra?: string[] }) {
  const used = useContext(CiteContext)
  const list = sortRefs([...used, ...extra])
  return (
    <ol className="flex flex-col gap-2 text-[13px] leading-relaxed text-muted list-none">
      {list.map((r) => (
        <li key={r.id} id={`ref-${r.id}`} className="break-words">{renderEntry(r.entry)}</li>
      ))}
    </ol>
  )
}

export function Section({ id, title, children, level = 2 }: { id: string; title: string; children: ReactNode; level?: 2 | 3 }) {
  const H = level === 2 ? 'h2' : 'h3'
  return (
    <section id={id} data-doc-section={level === 2 ? '' : undefined} className="scroll-mt-4 flex flex-col gap-3">
      <H className={clsx('text-white font-semibold', level === 2 ? 'text-xl mt-6 pb-2 border-b border-border' : 'text-base mt-3')}>{title}</H>
      {children}
    </section>
  )
}

export const P = ({ children }: { children: ReactNode }) => <p className="text-sm text-slate-200 leading-relaxed max-w-[72ch]">{children}</p>
export const UL = ({ children }: { children: ReactNode }) => <ul className="text-sm text-slate-200 leading-relaxed list-disc pl-5 flex flex-col gap-1 max-w-[72ch]">{children}</ul>
export const K = ({ children }: { children: ReactNode }) => <code className="px-1 py-0.5 rounded bg-panel text-teal text-[12px]">{children}</code>

export function Callout({ kind = 'info', title, children }: { kind?: 'info' | 'tip' | 'warn'; title?: string; children: ReactNode }) {
  const styles = {
    info: { Icon: Info,          cls: 'border-teal/40 bg-teal/5',   icon: 'text-teal' },
    tip:  { Icon: Lightbulb,     cls: 'border-amber/40 bg-amber/5', icon: 'text-amber' },
    warn: { Icon: TriangleAlert, cls: 'border-orange/50 bg-orange/5', icon: 'text-orange' },
  }[kind]
  return (
    <div className={clsx('flex gap-3 rounded-lg border px-4 py-3 max-w-[72ch]', styles.cls)} role="note">
      <styles.Icon size={18} className={clsx('shrink-0 mt-0.5', styles.icon)} aria-hidden="true" />
      <div className="text-[13px] text-slate-200 leading-relaxed">
        {title && <p className="font-semibold text-white mb-1">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  )
}

/** Equation with its number on the right, as the ABNT style asks. */
export function Eq({ n, children, where }: { n: number; children: ReactNode; where?: ReactNode }) {
  return (
    <div className="max-w-[72ch]">
      <div className="flex items-center justify-between gap-4 rounded-lg bg-panel/60 border border-border px-4 py-3">
        <div className="font-mono text-[13px] text-white overflow-x-auto">{children}</div>
        <span className="text-muted text-sm shrink-0">({n})</span>
      </div>
      {where && <p className="text-[12px] text-muted mt-1.5 leading-relaxed">{where}</p>}
    </div>
  )
}

/** Figure with a numbered title above and the source below (ABNT NBR 14724). */
export function Figure({ n, title, source, children, note }: {
  n: number; title: string; source?: ReactNode; children: ReactNode; note?: ReactNode
}) {
  const en = useLang((s) => s.lang) === 'en'
  source ??= en ? 'PySQA (own calculation).' : 'PySQA (cálculo próprio).'
  return (
    <figure className="flex flex-col gap-2 rounded-xl border border-border bg-surface p-4 max-w-[860px]">
      <figcaption className="text-[13px] text-white font-medium">{en ? 'Figure' : 'Figura'} {n} – {title}</figcaption>
      {children}
      {note && <p className="text-[12px] text-muted leading-relaxed">{note}</p>}
      <p className="text-[12px] text-muted">{en ? 'Source' : 'Fonte'}: {source}</p>
    </figure>
  )
}

export function Table({ head, rows, widths }: { head: string[]; rows: ReactNode[][]; widths?: string[] }) {
  return (
    <div className="overflow-x-auto max-w-[860px]">
      <table className="w-full text-[13px] border-collapse">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            {head.map((h, i) => <th key={i} className="px-3 py-2 font-medium" style={{ width: widths?.[i] }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border/50 align-top">
              {r.map((c, j) => <td key={j} className={clsx('px-3 py-2 text-slate-200', j === 0 && 'text-white font-medium')}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
