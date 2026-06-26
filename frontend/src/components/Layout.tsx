import { useState } from 'react'
import ToastContainer from './ToastContainer'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { Activity, Mic, BarChart2, Menu, X, LogOut } from 'lucide-react'
import clsx from 'clsx'
import { useAuthStore } from '../store/useAuthStore'

const NAV = [
  { to: '/post-processing',  label: 'Post-Processing',  Icon: Activity },
  { to: '/data-acquisition', label: 'Data Acquisition', Icon: Mic },
  { to: '/system-analysis',  label: 'System Analysis',  Icon: BarChart2 },
]

export default function Layout() {
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, logout } = useAuthStore()
  const navigate = useNavigate()

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-dark">
      {/* ── Top bar ──────────────────────────────────────────────────── */}
      <header className="flex items-center gap-3 px-4 h-12 bg-surface border-b border-border shrink-0">
        {/* Logo */}
        <img
          src="/pysqa_logo.png"
          alt="PySQA"
          className="h-7 w-7 object-contain shrink-0"
        />
        <span className="font-bold text-teal tracking-wide text-sm hidden sm:block">PySQA</span>

        {/* Desktop nav */}
        <nav className="hidden sm:flex gap-1 ml-2">
          {NAV.map(({ to, label, Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors',
                  isActive
                    ? 'bg-teal/20 text-teal'
                    : 'text-muted hover:text-white hover:bg-panel'
                )
              }
            >
              <Icon size={13} />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="flex-1" />

        {/* User + logout */}
        {user && (
          <div className="hidden sm:flex items-center gap-2">
            <span className="text-xs text-muted">{user.displayName}</span>
            <button
              onClick={handleLogout}
              title="Sign out"
              className="flex items-center gap-1 px-2 py-1.5 rounded text-xs text-muted hover:text-white hover:bg-panel transition-colors"
            >
              <LogOut size={13} />
              Sign out
            </button>
          </div>
        )}

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-1.5 rounded text-muted hover:text-white hover:bg-panel transition-colors"
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
            </NavLink>
          ))}
        </div>
      )}

      {/* ── Page content ─────────────────────────────────────────────── */}
      <main className="flex flex-1 overflow-hidden">
        <Outlet />
      </main>
      <ToastContainer />
    </div>
  )
}
