import { useState } from 'react'
import { createPortal } from 'react-dom'

export default function GenerarIABoton() {
  const [showInfo, setShowInfo] = useState(false)

  return (
    <>
      <button type="button" className="btn btn-accent" onClick={() => setShowInfo(true)}>
        🤖 Generar con IA
      </button>

      {showInfo &&
        createPortal(
          <div
            role="dialog"
            aria-modal="true"
            onClick={() => setShowInfo(false)}
            style={{
              position: 'fixed',
              inset: 0,
              zIndex: 1000,
              background: 'rgba(26, 31, 30, 0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-4)',
            }}
          >
            <div
              className="card"
              onClick={e => e.stopPropagation()}
              style={{ width: 320, padding: 'var(--space-4)', textAlign: 'center' }}
            >
              <p style={{ fontSize: '1.8rem', marginBottom: 'var(--space-2)' }}>🤖</p>
              <p style={{ fontWeight: 700, marginBottom: 'var(--space-1)' }}>Próximamente</p>
              <p className="muted" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
                La generación automática con IA se activará en una fase posterior. Por ahora, edita
                el contenido manualmente.
              </p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => setShowInfo(false)}
              >
                Entendido
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}
