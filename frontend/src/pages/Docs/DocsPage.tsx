import { Suspense, lazy, useEffect, useRef, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { BookOpen, Hammer } from 'lucide-react'
import clsx from 'clsx'
import { CiteContext } from './ui'
import { DATA_ACQUISITION_TOC, POST_PROCESSING_TOC, SYSTEM_ANALYSIS_TOC } from './tocs'
import { ABOUT_TOC } from './AboutDoc'
import { useLang, useT } from '../../i18n'
import BugReportButton from '../../components/BugReportButton'

const AboutDoc = lazy(() => import('./AboutDoc'))
const PostProcessingDoc = lazy(() => import('./PostProcessingDoc'))
const DataAcquisitionDoc = lazy(() => import('./DataAcquisitionDoc'))
const SystemAnalysisDoc = lazy(() => import('./SystemAnalysisDoc'))
const PostProcessingDocEn = lazy(() => import('./PostProcessingDocEn'))
const DataAcquisitionDocEn = lazy(() => import('./DataAcquisitionDocEn'))
const SystemAnalysisDocEn = lazy(() => import('./SystemAnalysisDocEn'))

const PAGES = [
  { key: 'sobre',            label: 'docs.about',       ready: true },
  { key: 'data-acquisition', label: 'nav.dataAcq',      ready: true },
  { key: 'post-processing',  label: 'nav.postProc',     ready: true },
  { key: 'system-analysis',  label: 'nav.sysAnalysis',  ready: true },
] as const

const TOCS: Record<string, Record<'pt' | 'en', { id: string; title: string }[]>> = {
  'post-processing': POST_PROCESSING_TOC,
  'data-acquisition': DATA_ACQUISITION_TOC,
  'system-analysis': SYSTEM_ANALYSIS_TOC,
}

export default function DocsPage() {
  const t = useT()
  const lang = useLang((s) => s.lang)
  const { page = 'sobre' } = useParams()
  const current = PAGES.find((p) => p.key === page)
  const used = useRef(new Set<string>())
  used.current.clear()                       // citations are collected again on every render of the page
  const scroller = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState('')
  const toc = page === 'sobre' ? ABOUT_TOC[lang] : (TOCS[page]?.[lang] ?? [])

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
  }, [page, toc.length, lang])

  if (!current) return <Navigate to="/docs/sobre" replace />

  const go = (id: string) => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
    setActive(id)
  }

  const tocLinks = toc.map((item) => (
    <a key={item.id} href={`#${item.id}`} onClick={(e) => { e.preventDefault(); go(item.id) }}
      aria-current={active === item.id ? 'location' : undefined}
      className={clsx('px-3 py-1.5 rounded text-[13px] transition-colors',
        active === item.id ? 'bg-panel text-white font-medium' : 'text-muted hover:text-white hover:bg-panel/60')}>
      {item.title}
    </a>
  ))

  const en = lang === 'en'
  const body = page === 'sobre' ? <AboutDoc />
    : page === 'data-acquisition' ? (en ? <DataAcquisitionDocEn /> : <DataAcquisitionDoc />)
    : page === 'system-analysis' ? (en ? <SystemAnalysisDocEn /> : <SystemAnalysisDoc />)
    : (en ? <PostProcessingDocEn /> : <PostProcessingDoc />)

  return (
    <div className="flex flex-col lg:flex-row flex-1 overflow-y-auto lg:overflow-hidden text-white">
      <h1 className="sr-only">{t('docs.title')}</h1>

      {/* ── Left column: pages and table of contents ── */}
      <aside className="shrink-0 lg:w-80 lg:border-r border-border p-3 flex flex-col gap-4 lg:overflow-y-auto" aria-label={t('docs.indexLabel')}>
        <div className="flex items-center gap-2 px-1">
          <BookOpen size={18} className="text-teal" aria-hidden="true" />
          <span className="text-base font-semibold">{t('nav.docs')}</span>
        </div>

        <nav aria-label={t('docs.pagesLabel')} className="flex flex-col gap-1">
          <p className="text-[11px] text-muted uppercase tracking-wider px-1">{t('nav.pages')}</p>
          {PAGES.map((p) => (
            <Link key={p.key} to={`/docs/${p.key}`} aria-current={p.key === page ? 'page' : undefined}
              className={clsx('flex items-center gap-2 px-3 py-2 rounded-md border text-sm font-medium transition-colors',
                p.key === page ? 'bg-teal/15 border-teal/60 text-teal' : 'bg-panel border-field text-white hover:border-teal')}>
              {t(p.label)}
              {!p.ready && <span className="ml-auto text-[11px] text-muted font-normal">{t('docs.soon')}</span>}
            </Link>
          ))}
        </nav>

        {toc.length > 0 && (
          <>
            {/* narrow screens: the contents fold away so the text starts on the first screen */}
            <details className="lg:hidden rounded-md border border-field bg-panel">
              <summary className="px-3 py-2 text-sm font-medium cursor-pointer select-none">{t('docs.onThisPage')}</summary>
              <nav aria-label={t('docs.onThisPage')} className="flex flex-col gap-0.5 p-1">{tocLinks}</nav>
            </details>
            <nav aria-label={t('docs.onThisPage')} className="hidden lg:flex flex-col gap-0.5">
              <p className="text-[11px] text-muted uppercase tracking-wider px-1 mb-1">{t('docs.onThisPage')}</p>
              {tocLinks}
            </nav>
          </>
        )}
        <BugReportButton />
      </aside>

      {/* ── Content ── */}
      <section ref={scroller} aria-label={t(current.label)} className="flex-1 min-w-0 lg:overflow-y-auto">
        <div className="px-4 py-6 lg:px-10 max-w-[960px] flex flex-col gap-4">
          {current.ready ? (
            <CiteContext.Provider value={used.current}>
              <Suspense fallback={<p className="text-xs text-teal animate-pulse">{t('docs.loading')}</p>}>
                {body}
              </Suspense>
            </CiteContext.Provider>
          ) : (
            <div className="flex flex-col items-start gap-3 max-w-[60ch]">
              <Hammer size={28} className="text-amber" aria-hidden="true" />
              <h2 className="text-xl font-semibold">{t(current.label)}</h2>
            </div>
          )}
        </div>
      </section>
    </div>
  )
}
