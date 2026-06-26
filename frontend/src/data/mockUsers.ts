export interface MockUser {
  id: string
  username: string
  password: string // plain text — mock only, never use in production
  displayName: string
  role: 'admin' | 'user'
}

export const MOCK_USERS: MockUser[] = [
  {
    id: '1',
    username: 'admin',
    password: 'admin123',
    displayName: 'Administrador',
    role: 'admin',
  },
  {
    id: '2',
    username: 'henrique',
    password: 'psyqa2024',
    displayName: 'Henrique',
    role: 'user',
  },
  {
    id: '3',
    username: 'demo',
    password: 'demo',
    displayName: 'Demo User',
    role: 'user',
  },
]
