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
import { Activity, Mic, BarChart2, BookOpen, Headphones, Menu, X } from 'lucide-react'
import clsx from 'clsx'

// AGPL-3.0 section 13: whoever uses the hosted service must be able to get the source of what runs.
const REPO = 'https://github.com/henriquealende/PySQA-web'

const NAV = [
  { to: '/data-acquisition', label: 'nav.dataAcq',      Icon: Mic },
  { to: '/post-processing',  label: 'nav.postProc',     Icon: Activity },
  { to: '/system-analysis',  label: 'nav.sysAnalysis',  Icon: BarChart2 },
  { to: '/audio-preparation',  label: 'nav.audioPrep',    Icon: Headphones },
]

/** Pulsing dot on the Data Acquisition tab while the microphone is open (also when you are on another page). */
function DaqDot({ state }: { state: 'idle' | 'monitoring' | 'recording' }) {
  const t = useT()
  if (state === 'idle') return null
  return (
    <span
      className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', state === 'recording' ? 'bg-orange' : 'bg-amber')}
      title={state === 'recording' ? t('nav.recording') : t('nav.micOpen')}
    />
  )
}

export default function Layout() {
  const t = useT()
  const [menuOpen, setMenuOpen] = useState(false)
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
    <div className="flex flex-col h-screen overflow-hidden bg-dark">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center h-14 bg-surface border-b border-border shrink-0">
        {/* Logo: this block is as wide as the settings column below it, so the tabs start where the results start */}
        <Link to="/" className="flex items-center gap-3 px-4 h-full lg:w-80 lg:shrink-0 lg:border-r lg:border-border" aria-label={t('nav.home')}>
          <Logo state={logoState} className="h-12 w-12 shrink-0" />
          <span className="font-bold text-teal tracking-wide text-xl hidden sm:block" aria-hidden="true">PySQA</span>
        </Link>

        {/* Desktop nav */}
        <nav className="hidden sm:flex gap-2 px-3" aria-label={t('nav.pages')}>
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 px-4 py-2 rounded-md border text-sm font-semibold transition-colors',
                  isActive
                    ? 'bg-teal border-teal text-dark'
                    : 'bg-panel border-field text-white hover:border-teal hover:text-teal'
                )
              }
            >
              <Icon size={17} />
              {t(label)}
              {to === '/data-acquisition' && <DaqDot state={daqState} />}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        <LanguageSwitch className="hidden sm:flex mr-3" />

        {/* Documentation */}
        <NavLink
          to="/docs"
          className={({ isActive }) =>
            clsx(
              'hidden sm:flex items-center gap-2 px-4 py-2 mr-4 rounded-md border text-sm font-semibold transition-colors',
              isActive ? 'bg-teal border-teal text-dark' : 'bg-panel border-field text-white hover:border-teal hover:text-teal'
            )
          }
        >
          <BookOpen size={17} />
          {t('nav.docs')}
        </NavLink>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-1.5 mr-3 rounded text-muted hover:text-white hover:bg-panel transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={t('nav.menu')}
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* Mobile dropdown nav */}
      {menuOpen && (
        <div className="sm:hidden bg-surface border-b border-border px-3 py-2 flex flex-col gap-1 shrink-0 z-40">
          <LanguageSwitch className="self-start mb-1" />
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setMenuOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-teal/20 text-teal'
                    : 'text-muted hover:text-white hover:bg-panel'
                )
              }
            >
              <Icon size={15} />
              {t(label)}
              {to === '/data-acquisition' && <DaqDot state={daqState} />}
            </NavLink>
          ))}
          <NavLink
            to="/docs"
            onClick={() => setMenuOpen(false)}
            className={({ isActive }) =>
              clsx(
                'flex items-center gap-2 px-3 py-2 rounded text-sm font-medium transition-colors',
                isActive ? 'bg-teal/20 text-teal' : 'text-muted hover:text-white hover:bg-panel'
              )
            }
          >
            <BookOpen size={15} />
            {t('nav.docs')}
          </NavLink>
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
      <ToastContainer />
    </div>
  )
}
