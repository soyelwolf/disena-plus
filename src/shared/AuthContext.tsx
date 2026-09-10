// src/shared/AuthContext.tsx
// Placeholder authentication context. Login is not wired to a real identity
// provider yet — that happens in a later /setup-auth pass (Entra ID restricted
// to @utp.edu.pe, with Docente/Administrador web roles). For now this lets the
// rest of the UI (nav, protected routes, role-aware panels) be built and
// demoed against a mock signed-in user.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type UserRole = 'docente' | 'administrador'

export interface MockUser {
  nombre: string
  correo: string
  rol: UserRole
}

interface AuthContextValue {
  user: MockUser | null
  isAuthenticated: boolean
  login: (rol?: UserRole) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)

const MOCK_USER: MockUser = {
  nombre: 'Fernando Bustamante',
  correo: 'fbustamant@utp.edu.pe',
  rol: 'docente',
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MockUser | null>(null)

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isAuthenticated: !!user,
      login: (rol: UserRole = 'docente') => setUser({ ...MOCK_USER, rol }),
      logout: () => setUser(null),
    }),
    [user],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
