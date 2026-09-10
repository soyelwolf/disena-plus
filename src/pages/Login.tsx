import { useNavigate } from 'react-router-dom'
import { useEffect, type CSSProperties } from 'react'
import { useAuth } from '../shared/AuthContext'
import Logo from '../components/Logo'

export default function Login() {
  const { login, isAuthenticated } = useAuth()
  const navigate = useNavigate()

  useEffect(() => {
    document.title = 'Diseña+'
  }, [])

  useEffect(() => {
    if (isAuthenticated) navigate('/home', { replace: true })
  }, [isAuthenticated, navigate])

  const handleLogin = () => {
    // Placeholder: real Entra ID sign-in (restricted to @utp.edu.pe) is wired
    // in a later pass. For now this simulates a signed-in Docente.
    login('docente')
  }

  return (
    <div style={pageStyle}>
      <div style={illustrationPane} aria-hidden="true">
        <div style={illustrationPattern} />
        <div style={illustrationContent}>
          <div style={illustrationBadge} className="animate-in">UTP</div>
          <h2 style={illustrationHeading} className="animate-in">Diseño de carpetas instruccionales</h2>
          <p style={illustrationText} className="animate-in">
            Consignas, rúbricas, listas de cotejo, matrices y escalas de valoración —
            todo en un solo lugar para tu equipo docente.
          </p>
        </div>
      </div>

      <div style={formPane}>
        <div style={{ maxWidth: 420, width: '100%' }} className="stack">
          <div className="animate-in">
            <Logo fontSize="2rem" />
            <p className="muted" style={{ marginTop: 'var(--space-1)' }}>
              Plataforma de diseño de contenido académico
            </p>
          </div>

          <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
            <p style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>¡Hola! 👋</p>
            <p className="muted" style={{ fontSize: '0.9rem' }}>
              Presiona <strong>"Iniciar Sesión"</strong> para validar tu correo institucional
              (@utp.edu.pe) y acceder a la plataforma.
            </p>
          </div>

          <div className="stack animate-in" style={{ gap: 'var(--space-2)' }}>
            <button className="btn btn-primary" style={{ padding: 'var(--space-3)' }} onClick={handleLogin}>
              Iniciar Sesión
            </button>
            <button className="btn btn-ghost" style={{ padding: 'var(--space-3)' }} type="button">
              Ver presentación
            </button>
          </div>

          <p className="muted animate-in" style={{ fontSize: '0.78rem', textAlign: 'center' }}>
            Prototipo académico — el inicio de sesión institucional real se configura en una fase posterior.
          </p>
        </div>
      </div>
    </div>
  )
}

const pageStyle = {
  minHeight: '100vh',
  display: 'grid',
  gridTemplateColumns: '1.1fr 1fr',
} as const

const illustrationPane = {
  position: 'relative' as const,
  overflow: 'hidden' as const,
  background: 'linear-gradient(160deg, var(--color-primary-dark) 0%, var(--color-primary) 60%, #2c6e5a 100%)',
  display: 'flex',
  alignItems: 'center',
  padding: 'var(--space-7)',
}

const illustrationPattern: CSSProperties = {
  position: 'absolute',
  inset: 0,
  backgroundImage:
    'radial-gradient(circle at 20% 20%, rgba(217,142,42,0.18) 0%, transparent 45%), radial-gradient(circle at 80% 75%, rgba(255,255,255,0.08) 0%, transparent 40%), linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
  backgroundSize: 'auto, auto, 48px 48px, 48px 48px',
}

const illustrationContent: CSSProperties = {
  position: 'relative',
  color: '#fff',
  maxWidth: 440,
}

const illustrationBadge: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 48,
  height: 48,
  borderRadius: 'var(--radius-md)',
  background: 'rgba(255,255,255,0.14)',
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  marginBottom: 'var(--space-4)',
}

const illustrationHeading: CSSProperties = {
  fontSize: '2rem',
  lineHeight: 1.15,
  marginBottom: 'var(--space-3)',
  color: '#fff',
}

const illustrationText: CSSProperties = {
  color: 'rgba(255,255,255,0.82)',
  fontSize: '1rem',
  lineHeight: 1.6,
}

const formPane = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 'var(--space-6)',
  background: 'var(--color-bg)',
}

