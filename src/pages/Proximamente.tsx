import { useEffect } from 'react'
import Icon, { type IconName } from '../components/Icon'

interface ProximamenteProps {
  titulo: string
  descripcion: string
  icon: IconName
}

/** Placeholder for sections of the shell that are planned but not built yet. */
export default function Proximamente({ titulo, descripcion, icon }: ProximamenteProps) {
  useEffect(() => {
    document.title = `${titulo} — Diseña+`
  }, [titulo])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>{titulo}</h1>
      <div
        className="panel animate-in"
        style={{ padding: '64px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, textAlign: 'center' }}
      >
        <span
          style={{
            width: 64, height: 64, borderRadius: '50%', background: 'var(--color-primary-light)',
            color: 'var(--color-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Icon name={icon} size={30} />
        </span>
        <p style={{ fontSize: 18, fontWeight: 700 }}>En construcción</p>
        <p style={{ maxWidth: 440, color: 'var(--color-text-muted)' }}>{descripcion}</p>
      </div>
    </div>
  )
}
