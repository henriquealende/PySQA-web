import { useEffect, useState } from 'react'
import ToastContainer from './ToastContainer'
import StatusBanner from './StatusBanner'
import RecordingPage from '../pages/DataAcquisition/RecordingPage'
import { useStore } from '../store/useStore'
import { useFrfStore } from '../store/useFrfStore'
import Logo from './Logo'
import LanguageSwitch from './LanguageSwitch'
import { useT } from '../i18n'
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, Mic, BarChart2, BookOpen, Headphones, Menu, X, PanelLeftClose, PanelLeftOpen } from 'lucide-react'
import clsx from 'clsx'

// AGPL-3.0 section 13: whoever uses the hosted service must be able to get the source of what runs.
const REPO = 'https://github.com/henriquealende/PySQA-web'

type DaqState = 'idle' | 'monitoring' | 'recording'

const NAV = [
  { to: '/data-acquisition', label: 'nav.dataAcq',      Icon: Mic },
  { to: '/post-processing',  label: 'nav.postProc',     Icon: Activity },
  { to: '/system-analysis',  label: 'nav.sysAnalysis',  Icon: BarChart2 },
  { to: '/audio-preparation',  label: 'nav.audioPrep',    Icon: Headphones },
]

/** Pulsing dot on the Data Acquisition item while the microphone is open (also when you are on another page). */
function DaqDot({ state, className }: { state: DaqState; className?: string }) {
  const t = useT()
  if (state === 'idle') return null
  return (
    <span
      className={clsx('w-2 h-2 rounded-full animate-pulse', state === 'recording' ? 'bg-orange' : 'bg-amber', className)}
      title={state === 'recording' ? t('nav.recording') : t('nav.micOpen')}
    />
  )
}

const NAV_KEY = 'pysqa.nav.wide'
/** Expanded or collapsed: what the user chose last time, otherwise expanded on wide screens only. */
function initialWide() {
  try { const v = localStorage.getItem(NAV_KEY); if (v === '1' || v === '0') return v === '1' } catch { /* storage blocked */ }
  return window.innerWidth >= 1280
}

/** One entry of the side navigation. Expanded: icon + name. Collapsed: icon only (name as tooltip). */
function SideItem({ to, label, Icon, daqState, wide }: { to: string; label: string; Icon: typeof Mic; daqState?: DaqState; wide: boolean }) {
  const t = useT()
  return (
    <NavLink
      to={to}
      title={t(label)}
      aria-label={t(label)}
      className={({ isActive }) =>
        clsx(
          'relative flex items-center gap-3 h-11 px-3 rounded-lg text-sm font-medium transition-colors',
          'focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal',
          wide ? 'justify-start' : 'justify-center',
          isActive ? 'bg-teal/15 text-teal' : 'text-muted hover:bg-panel hover:text-white'
        )
      }
    >
      <Icon size={19} className="shrink-0" aria-hidden="true" />
      {wide && <span className="truncate">{t(label)}</span>}
      {daqState && <DaqDot state={daqState} className={wide ? 'ml-auto' : 'absolute top-2 right-2'} />}
    </NavLink>
  )
}

export default function Layout() {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
  const [wide, setWide] = useState(initialWide)
  const toggleWide = () => setWide((w) => { try { localStorage.setItem(NAV_KEY, w ? '0' : '1') } catch { /* storage blocked */ } return !w })
  const daqState = useStore((s) => s.daqState)
  const serverWaking = useStore((s) => s.serverWaking)
  const frfBusy = useFrfStore((s) => s.busy)
  const logoState = daqState === 'recording' ? 'recording' : serverWaking || frfBusy ? 'working' : daqState === 'monitoring' ? 'monitoring' : 'idle'

  // Data Acquisition stays mounted once opened (it is only hidden on other pages), so a recording,
  // a take under review and the open microphone survive a visit to Post-Processing.
  const pathname = useLocation().pathname
  const isDaq = pathname.startsWith('/data-acquisition')
  useEffect(() => {
    const key = pathname.startsWith('/docs') ? 'nav.docs' : NAV.find((n) => pathname.startsWith(n.to))?.label
    document.title = key ? `${t(key)} · PySQA` : 'PySQA'
  }, [pathname, t])
  const [daqVisited, setDaqVisited] = useState(isDaq)
  useEffect(() => { if (isDaq) setDaqVisited(true) }, [isDaq])

  return (
    <div className="flex h-screen overflow-hidden bg-dark">
      {/* ── Side navigation (tablet and desktop) ─────────────────────── */}
      <aside className={clsx('hidden sm:flex flex-col shrink-0 bg-surface border-r border-border', wide ? 'w-60' : 'w-[4.5rem]')}>
        {/* Brand: the cube is the biggest thing here on purpose */}
        <Link
          to="/"
          aria-label={t('nav.home')}
          className="flex flex-col items-center gap-3 px-3 pt-6 pb-5 border-b border-border"
        >
          <Logo state={logoState} className={clsx('shrink-0', wide ? 'h-16 w-16' : 'h-12 w-12')} />
          {wide && (
            <span className="flex flex-col items-center gap-1.5 text-center" aria-hidden="true">
              <span className="font-semibold text-slate-200 uppercase tracking-[0.14em] pl-[0.14em] text-xl leading-none">PySQA</span>
              <span className="text-xs text-muted leading-snug">{t('nav.tagline')}</span>
            </span>
          )}
        </Link>

        <nav className="flex flex-col gap-1.5 px-3 py-5" aria-label={t('nav.pages')}>
          {NAV.map(({ to, label, Icon }) => (
            <SideItem key={to} to={to} label={label} Icon={Icon} wide={wide} daqState={to === '/data-acquisition' ? daqState : undefined} />
          ))}
        </nav>

        <div className="flex-1" />

        <div className="flex flex-col gap-3 px-3 py-4 border-t border-border">
          <SideItem to="/docs" label="nav.docs" Icon={BookOpen} wide={wide} />
          <LanguageSwitch className={clsx('[&>button]:flex-1 [&>button]:px-2', wide ? 'self-stretch' : 'self-center')} />
          <button
            type="button"
            onClick={toggleWide}
            aria-expanded={wide}
            title={t(wide ? 'nav.collapse' : 'nav.expand')}
            aria-label={t(wide ? 'nav.collapse' : 'nav.expand')}
            className={clsx(
              'flex items-center gap-3 h-11 px-3 rounded-lg text-sm font-medium text-muted transition-colors hover:bg-panel hover:text-white',
              'focus-visible:outline focus-visible:outline-2 focus-visible:outline-teal',
              wide ? 'justify-start' : 'justify-center'
            )}
          >
            {wide ? <PanelLeftClose size={19} className="shrink-0" aria-hidden="true" /> : <PanelLeftOpen size={19} className="shrink-0" aria-hidden="true" />}
            {wide && <span className="truncate">{t('nav.collapse')}</span>}
          </button>
        </div>
      </aside>

      <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
        {/* ── Phone top bar ────────────────────────────────────────────── */}
        <header className="sm:hidden flex items-center h-14 bg-surface border-b border-border shrink-0">
          <Link to="/" className="flex items-center gap-3 px-4 h-full" aria-label={t('nav.home')}>
            <Logo state={logoState} className="h-10 w-10 shrink-0" />
            <span className="font-bold text-teal tracking-wide text-xl" aria-hidden="true">PySQA</span>
          </Link>
          <div className="flex-1" />
          <button
            className="p-2 mr-3 rounded text-muted hover:text-white hover:bg-panel transition-colors"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label={t('nav.menu')}
            aria-expanded={menuOpen}
          >
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </header>

        {menuOpen && (
          <div className="sm:hidden bg-surface border-b border-border px-3 py-3 flex flex-col gap-1.5 shrink-0 z-40" onClick={() => setMenuOpen(false)}>
            {NAV.map(({ to, label, Icon }) => (
              <SideItem key={to} to={to} label={label} Icon={Icon} wide daqState={to === '/data-acquisition' ? daqState : undefined} />
            ))}
            <SideItem to="/docs" label="nav.docs" Icon={BookOpen} wide />
            <div onClick={(e) => e.stopPropagation()} className="self-start mt-2">
              <LanguageSwitch />
            </div>
          </div>
        )}

        <StatusBanner />

        {/* ── Page content ─────────────────────────────────────────────── */}
        <main className="flex flex-1 overflow-hidden">
          <Outlet />
          {daqVisited && (
            <div className={isDaq ? 'flex flex-1 overflow-hidden' : 'hidden'}>
              <RecordingPage active={isDaq} />
            </div>
          )}
        </main>
        <footer className="shrink-0 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 px-4 py-1 bg-surface border-t border-border text-xs text-muted">
          <span>{t('footer.free')}</span>
          <a href={`${REPO}/blob/main/LICENSE`} target="_blank" rel="noreferrer" className="hover:text-teal underline">{t('footer.license')}</a>
          <a href={REPO} target="_blank" rel="noreferrer" className="hover:text-teal underline">{t('footer.source')}</a>
        </footer>
      </div>
      <ToastContainer />
    </div>
  )
}
