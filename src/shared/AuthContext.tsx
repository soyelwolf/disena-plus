// src/shared/AuthContext.tsx
// Placeholder authentication context. Sign-in is not wired to Supabase Auth
// yet (next step: magic link restricted to @utp.edu.pe, with each user's roles
// read from the database). For now it validates the domain and simulates the
// session so the shell, protected routes and role-aware screens can be built.
//
// A user can hold several roles at once (e.g. Administrador + Docente). What
// they may do is derived from the union of their roles' permissions — screens
// check permissions, never role names, so new roles only need a PERMISOS entry.

import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

export type UserRole =
  | 'administrador'
  | 'docente'
  | 'asesor'
  | 'monitor_ea'
  | 'monitor_qa'
  | 'monitor_disena'
  | 'dda'

export const ROLE_LABELS: Record<UserRole, string> = {
  administrador: 'Administrador',
  docente: 'Docente',
  asesor: 'Asesor',
  monitor_ea: 'Monitor EA',
  monitor_qa: 'Monitor QA',
  monitor_disena: 'Monitor Diseña+',
  dda: 'DDA',
}

export type Permiso =
  | 'editar_contenido' // fill in consignas and instruments, "Finalizar edición general"
  | 'aprobar_proceso' // approve / return a finished process
  | 'administrar_datos' // Centro de datos, users & roles, re-enable editing
  | 'ver_todo' // read every course (auditing, reporting)

const PERMISOS: Record<UserRole, Permiso[]> = {
  administrador: ['administrar_datos', 'ver_todo'],
  docente: ['editar_contenido'],
  asesor: ['editar_contenido'],
  monitor_ea: ['aprobar_proceso', 'ver_todo'],
  monitor_qa: ['aprobar_proceso', 'ver_todo'],
  monitor_disena: ['aprobar_proceso', 'ver_todo'],
  dda: ['aprobar_proceso', 'ver_todo'],
}

/**
 * Roles already assigned to real people. Temporary: this moves to a
 * `usuario_rol` table managed from the Centro de datos.
 */
export const ROLES_ASIGNADOS: Record<string, UserRole[]> = {
  'fbustamant@utp.edu.pe': ['administrador', 'docente'],
}

export const UTP_DOMAIN = '@utp.edu.pe'

export interface SessionUser {
  nombre: string
  correo: string
  roles: UserRole[]
}

interface AuthContextValue {
  user: SessionUser | null
  isAuthenticated: boolean
  isAdmin: boolean
  can: (permiso: Permiso) => boolean
  login: (correo: string, roles: UserRole[]) => void
  logout: () => void
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined)
const STORAGE_KEY = 'disena.session.v2'

function nombreDesdeCorreo(correo: string): string {
  const local = correo.split('@')[0] ?? ''
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

function leerSesion(): SessionUser | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const parsed = raw ? (JSON.parse(raw) as SessionUser) : null
    return parsed && Array.isArray(parsed.roles) ? parsed : null
  } catch {
    return null
  }
}

function guardarSesion(user: SessionUser | null) {
  try {
    if (user) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user))
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch {
    // Storage blocked (private mode) — the session just won't survive a reload.
  }
}

export function rolesLabel(roles: UserRole[]): string {
  return roles.map(r => ROLE_LABELS[r]).join(' · ')
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(leerSesion)

  const value = useMemo<AuthContextValue>(() => {
    const permisos = new Set((user?.roles ?? []).flatMap(r => PERMISOS[r]))
    return {
      user,
      isAuthenticated: !!user,
      isAdmin: permisos.has('administrar_datos'),
      can: (permiso: Permiso) => permisos.has(permiso),
      login: (correo: string, roles: UserRole[]) => {
        const next = { nombre: nombreDesdeCorreo(correo), correo: correo.toLowerCase(), roles }
        guardarSesion(next)
        setUser(next)
      },
      logout: () => {
        guardarSesion(null)
        setUser(null)
      },
    }
  }, [user])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
