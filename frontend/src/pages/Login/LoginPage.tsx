import { useState, FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '../../store/useAuthStore'

export default function LoginPage() {
  const navigate = useNavigate()
  const login = useAuthStore((s) => s.login)

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Small delay to simulate async — easy to swap for a real API call later
    setTimeout(() => {
      const ok = login(username, password)
      if (ok) {
        navigate('/', { replace: true })
      } else {
        setError('Invalid username or password.')
        setLoading(false)
      }
    }, 300)
  }

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-dark">
      <div className="w-full max-w-sm bg-surface border border-border rounded-lg p-8 flex flex-col gap-6">
        {/* Logo + title */}
        <div className="flex flex-col items-center gap-3">
          <img src="/pysqa_logo.png" alt="PySQA" className="h-12 w-12 object-contain" />
          <h1 className="text-base font-bold text-teal tracking-wide">PySQA</h1>
          <p className="text-xs text-muted">Psychoacoustics & Sound Quality</p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted" htmlFor="username">
              Username
            </label>
            <input
              id="username"
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              className="bg-panel border border-border rounded px-3 py-2 text-sm text-white placeholder-muted
                         focus:outline-none focus:border-teal transition-colors"
              placeholder="username"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="bg-panel border border-border rounded px-3 py-2 text-sm text-white placeholder-muted
                         focus:outline-none focus:border-teal transition-colors"
              placeholder="••••••••"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400 text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="mt-1 bg-teal/90 hover:bg-teal text-dark font-semibold text-sm py-2 rounded
                       transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
