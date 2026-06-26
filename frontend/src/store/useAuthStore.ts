import { create } from 'zustand'
import { MOCK_USERS, MockUser } from '../data/mockUsers'

interface AuthState {
  user: Omit<MockUser, 'password'> | null
  login: (username: string, password: string) => boolean
  logout: () => void
}

const SESSION_KEY = 'pysqa_auth_user'

function loadUser(): Omit<MockUser, 'password'> | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),

  login: (username, password) => {
    const found = MOCK_USERS.find(
      (u) => u.username === username.trim() && u.password === password
    )
    if (!found) return false

    const { password: _pwd, ...safeUser } = found
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(safeUser))
    set({ user: safeUser })
    return true
  },

  logout: () => {
    sessionStorage.removeItem(SESSION_KEY)
    set({ user: null })
  },
}))
