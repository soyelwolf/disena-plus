import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../shared/AuthContext'

export default function Home() {
  const { user } = useAuth()

  useEffect(() => {
    document.title = 'Inicio — Diseña+'
  }, [])

  return (
    <div className="container" style={{ paddingTop: 'var(--space-6)', paddingBottom: 'var(--space-8)' }}>
      <div
        className="card animate-in"
        style={{
          padding: 'var(--space-5)',
          background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%)',
          color: '#fff',
          border: 'none',
          marginBottom: 'var(--space-5)',
        }}
      >
        <p className="mono" style={{ fontSize: '0.8rem', opacity: 0.85, marginBottom: 'var(--space-1)' }}>
          👋 BIENVENIDO/A
        </p>
        <h1 style={{ color: '#fff', fontSize: '1.6rem', marginBottom: 'var(--space-2)' }}>
          {user?.nombre ?? 'Docente'}
        </h1>
        <p style={{ color: 'rgba(255,255,255,0.85)', maxWidth: 560 }}>
          Aquí empieza un nuevo reto para el diseño de carpetas instruccionales.
        </p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--space-4)' }}>
        <Link to="/cursos" className="card card-interactive animate-in" style={tileStyle}>
          <span style={iconWrap}>📁</span>
          <span style={tileTitle}>Cursos</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            Ver y construir las carpetas instruccionales de tus cursos
          </span>
        </Link>

        <a href="#soporte" className="card card-interactive animate-in" style={tileStyle}>
          <span style={iconWrap}>🤝</span>
          <span style={tileTitle}>Soporte</span>
          <span className="muted" style={{ fontSize: '0.85rem' }}>
            ¿Tienes dudas? Contacta al equipo de Product Operations
          </span>
        </a>
      </div>
    </div>
  )
}

const tileStyle = {
  display: 'flex',
  flexDirection: 'column' as const,
  gap: 'var(--space-1)',
  padding: 'var(--space-4)',
  color: 'var(--color-text)',
}

const iconWrap = {
  fontSize: '1.75rem',
  marginBottom: 'var(--space-1)',
}

const tileTitle = {
  fontFamily: 'var(--font-heading)',
  fontWeight: 700,
  fontSize: '1.1rem',
}
