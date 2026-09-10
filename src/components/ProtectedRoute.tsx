import { type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../shared/AuthContext'

export default function ProtectedRoute({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth()
  if (!isAuthenticated) return <Navigate to="/" replace />
  return <>{children}</>
}
