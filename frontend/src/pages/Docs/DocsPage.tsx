import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BookOpen, Hammer } from 'lucide-react'
import clsx from 'clsx'
import { CiteContext } from './ui'
import { DATA_ACQUISITION_TOC, POST_PROCESSING_TOC, SYSTEM_ANALYSIS_TOC } from './tocs'

const PostProcessingDoc = lazy(() => import('./PostProcessingDoc'))
const DataAcquisitionDoc = lazy(() => import('./DataAcquisitionDoc'))
const SystemAnalysisDoc = lazy(() => import('./SystemAnalysisDoc'))

const PAGES = [
  { key: 'data-acquisition', label: 'Data Acquisition', ready: true },
  { key: 'post-processing',  label: 'Post-Processing',  ready: true },
  { key: 'system-analysis',  label: 'System Analysis',  ready: true },
] as const

const TOCS: Record<string, { id: string; title: string }[]> = {
  'post-processing': POST_PROCESSING_TOC,
  'data-acquisition': DATA_ACQUISITION_TOC,
  'system-analysis': SYSTEM_ANALYSIS_TOC,
}

export default function DocsPage() {
  const { page = 'post-processing' } = useParams()
  const current = PAGES.find((p) => p.key === page)
  const used = useRef(new Set<string>())
  used.current.clear()                       // citations are collected again on every render of the page
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('')
  const toc = TOCS[page] ?? []

  useEffect(() => { scroller.current?.scrollTo({ top: 0 }) }, [page])

  // Highlight, in the table of contents, the section being read
  useEffect(() => {
    const root = scroller.current
    if (!root || !toc.length) return
    let io: IntersectionObserver | null = null
    // the sections appear once the (lazy) content has loaded
    const timer = window.setInterval(() => {
      const sections = Array.from(root.querySelectorAll<HTMLElement>('[data-doc-section]'))
      if (!sections.length) return
      window.clearInterval(timer)
      const seen = new Map<string, boolean>()
      io = new IntersectionObserver((entries) => {
        entries.forEach((e) => seen.set(e.target.id, e.isIntersecting))
        const first = sections.find((s) => seen.get(s.id))
        if (first) setActive(first.id)
      }, { root: window.matchMedia('(min-width: 1024px)').matches ? root : null, rootMargin: '0px 0px -65% 0px', threshold: 0 })
      sections.forEach((s) => io!.observe(s))
    }, 150)
    return () => { window.clearInterval(timer); io?.disconnect() }
  }, [page, toc.length])

  if (!current) return <Navigate to="/docs/post-processing" replace />

  const go = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
  }

  const tocLinks = toc.map((t) => (
    <a key={t.id} href={`#${t.id}`} onClick={(e) => { e.preventDefault(); go(t.id) }}
      aria-current={active === t.id ? 'location' : undefined}
      className={clsx('px-3 py-1.5 rounded text-[13px] transition-colors',
        active === t.id ? 'bg-panel text-white font-medium' : 'text-muted hover:text-white hover:bg-panel/60')}>
      {t.title}
    </a>
  ))

  return (
    <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden text-white">
      <h1 className="sr-only">Documentação do PySQA</h1>

      {/* ── Left column: pages and table of contents ── */}
      <aside className="shrink-0 lg:w-80 lg:border-r border-border p-3 flex flex-col gap-4 lg:overflow-y-auto" aria-label="Índice da documentação">
        <div className="flex items-center gap-2 px-1">
          <BookOpen size={18} className="text-teal" aria-hidden="true" />
          <span className="text-base font-semibold">Documentação</span>
        </div>

        <nav aria-label="Páginas documentadas" className="flex flex-col gap-1">
          <p className="text-[11px] text-muted uppercase tracking-wider px-1">Páginas</p>
          {PAGES.map((p) => (
            <Link key={p.key} to={`/docs/${p.key}`} aria-current={p.key === page ? 'page' : undefined}
              className={clsx('flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                p.key === page ? 'bg-teal/15 border-teal/60 text-teal' : 'bg-panel border-field text-white hover:border-teal')}>
              {p.label}
              {!p.ready && <span className="ml-auto text-[11px] text-muted font-normal">em breve</span>}
            </Link>
          ))}
        </nav>

        {toc.length > 0 && (
          <>
            {/* narrow screens: the contents fold away so the text starts on the first screen */}
            <details className="lg:hidden rounded-md border border-field bg-panel">
              <summary className="px-3 py-2 text-sm font-medium cursor-pointer select-none">Nesta página</summary>
              <nav aria-label="Nesta página" className="flex flex-col gap-0.5 p-1">{tocLinks}</nav>
            </details>
            <nav aria-label="Nesta página" className="hidden lg:flex flex-col gap-0.5">
              <p className="text-[11px] text-muted uppercase tracking-wider px-1 mb-1">Nesta página</p>
              {tocLinks}
            </nav>
          </>
        )}
      </aside>

      {/* ── Content ── */}
      <section ref={scroller} aria-label={`Documentação de ${current.label}`} className="flex-1 min-w-0 lg:overflow-y-auto">
        <div className="px-4 py-6 lg:px-10 max-w-[960px]">
          {current.ready ? (
            <CiteContext.Provider value={used.current}>
              <Suspense fallback={<p className="text-xs text-teal animate-pulse">Carregando a documentação…</p>}>
                {page === 'data-acquisition' ? <DataAcquisitionDoc /> : page === 'system-analysis' ? <SystemAnalysisDoc /> : <PostProcessingDoc />}
              </Suspense>
            </CiteContext.Provider>
          ) : (
            <div className="flex flex-col items-start gap-3 max-w-[60ch]">
              <Hammer size={28} className="text-amber" aria-hidden="true" />
              <h2 className="text-xl font-semibold">{current.label}: documentação em preparação</h2>
              <p className="text-sm text-slate-200 leading-relaxed">
                Estamos documentando o PySQA página por página. As primeiras são o Post-Processing e a Data Acquisition; esta virá em seguida, com o mesmo formato:
                explicação simples, demonstrações gráficas calculadas pelo próprio PySQA e referências em ABNT.
              </p>
              <Link to="/docs/post-processing" className="px-4 py-2 rounded-md bg-teal text-dark text-sm font-semibold hover:bg-teal/80 transition-colors">
                Ler a documentação do Post-Processing
              </Link>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
