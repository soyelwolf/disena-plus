import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../shared/AuthContext'

/** Like ProtectedRoute, but only for the Administrador role. */
export default function AdminRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated, isAdmin } = useAuth()
  if (!isAuthenticated) return <Navigate to="/" replace />
  if (!isAdmin) return <Navigate to="/cursos" replace />
  return <>{children}</>
}
