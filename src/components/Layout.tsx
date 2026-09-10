import { type CSSProperties, type ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../shared/AuthContext'
import Logo from './Logo'

export default function Layout({ children }: { children: ReactNode }) {
  const { user, isAuthenticated, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate('/')
  }

  return (
    <div className="app-shell">
      {isAuthenticated && (
        <header style={headerStyle}>
          <div className="container row-between" style={{ height: 64 }}>
            <Link to="/home" style={{ textDecoration: 'none' }} aria-label="Diseña+, ir al inicio">
              <Logo />
            </Link>
            <nav aria-label="Navegación principal" className="row" style={{ gap: 'var(--space-4)' }}>
              <Link to="/cursos" style={navLinkStyle}>Cursos</Link>
              <span className="row" style={{ gap: 'var(--space-2)' }}>
                <span className="mono muted" style={{ fontSize: '0.8rem' }}>{user?.correo}</span>
                <button className="btn btn-ghost btn-sm" onClick={handleLogout}>
                  Cerrar sesión
                </button>
              </span>
            </nav>
          </div>
        </header>
      )}

      <main className="app-main">{children}</main>

      <footer style={footerStyle}>
        <div className="container row-between" style={{ paddingTop: 'var(--space-4)', paddingBottom: 'var(--space-4)' }}>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Diseña+ · Universidad Tecnológica del Perú
          </span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>Prototipo académico</span>
        </div>
      </footer>
    </div>
  )
}

const headerStyle: CSSProperties = {
  background: 'var(--color-surface)',
  borderBottom: '1px solid var(--color-border)',
  position: 'sticky',
  top: 0,
  zIndex: 10,
}

const navLinkStyle: CSSProperties = {
  color: 'var(--color-text)',
  fontWeight: 600,
  fontSize: '0.95rem',
}

const footerStyle: CSSProperties = {
  borderTop: '1px solid var(--color-border)',
  background: 'var(--color-surface)',
}
