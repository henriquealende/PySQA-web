import { useEffect, useState } from 'react'
import ToastContainer from './ToastContainer'
import StatusBanner from './StatusBanner'
import RecordingPage from '../pages/DataAcquisition/RecordingPage'
import { useStore } from '../store/useStore'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { Activity, Mic, BarChart2, Menu, X } from 'lucide-react'
import clsx from 'clsx'

const NAV = [
  { to: '/data-acquisition', label: 'Data Acquisition', Icon: Mic },
  { to: '/post-processing',  label: 'Post-Processing',  Icon: Activity },
  { to: '/system-analysis',  label: 'System Analysis',  Icon: BarChart2 },
]

/** Pulsing dot on the Data Acquisition tab while the microphone is open (also when you are on another page). */
function DaqDot({ state }: { state: 'idle' | 'monitoring' | 'recording' }) {
  if (state === 'idle') return null
  return (
    <span
      className={clsx('w-1.5 h-1.5 rounded-full animate-pulse', state === 'recording' ? 'bg-orange' : 'bg-amber')}
      title={state === 'recording' ? 'Recording' : 'Microphone is open'}
    />
  )
}

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const daqState = useStore((s) => s.daqState)

  // Data Acquisition stays mounted once opened (it is only hidden on other pages), so a recording,
  // a take under review and the open microphone survive a visit to Post-Processing.
  const pathname = useLocation().pathname
  const isDaq = pathname.startsWith('/data-acquisition')
  useEffect(() => {
    const page = NAV.find((n) => pathname.startsWith(n.to))
    document.title = page ? `${page.label} · PySQA` : 'PySQA'
  }, [pathname])
  const [daqVisited, setDaqVisited] = useState(isDaq)
  useEffect(() => { if (isDaq) setDaqVisited(true) }, [isDaq])

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-dark">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center h-14 bg-surface border-b border-border shrink-0">
        {/* Logo: this block is as wide as the settings column below it, so the tabs start where the results start */}
        <div className="flex items-center gap-3 px-4 h-full lg:w-80 lg:shrink-0 lg:border-r lg:border-border">
          <img
            src="/pysqa_logo.png"
            alt="PySQA"
            className="h-8 w-8 object-contain shrink-0"
          />
          <span className="font-bold text-teal tracking-wide text-base hidden sm:block">PySQA</span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden sm:flex gap-2 px-3" aria-label="Pages">
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
              {label}
              {to === '/data-acquisition' && <DaqDot state={daqState} />}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-1.5 mr-3 rounded text-muted hover:text-white hover:bg-panel transition-colors"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          {menuOpen ? <X size={18} /> : <Menu size={18} />}
        </button>
      </header>

      {/* Mobile dropdown nav */}
      {menuOpen && (
        <div className="sm:hidden bg-surface border-b border-border px-3 py-2 flex flex-col gap-1 shrink-0 z-40">
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
              {label}
              {to === '/data-acquisition' && <DaqDot state={daqState} />}
            </NavLink>
          ))}
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
      <ToastContainer />
    </div>
  )
}
