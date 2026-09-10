import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCurso } from '../shared/hooks/useCursos'

const SECCION_LABELS: Record<string, string> = {
  consignas: 'Consignas',
  rubricas: 'Rúbricas',
  matriz: 'Matriz',
  'lista-cotejo': 'Lista de Cotejo',
  escala: 'Escala de Valoración',
}

export default function SeccionIndice() {
  const { cursoId, seccion } = useParams<{ cursoId: string; seccion: string }>()
  const { curso } = useCurso(cursoId)
  const label = (seccion && SECCION_LABELS[seccion]) || 'Sección'

  useEffect(() => {
    document.title = `${label} — Diseña+`
  }, [label])

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver al curso</Link>

      <div className="card animate-in" style={{ padding: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
        <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.2rem' }}>{label}</p>
        {curso && <p className="muted" style={{ fontSize: '0.85rem' }}>{curso.nombre}</p>}
      </div>

      <div className="card animate-in" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
        <p style={{ fontSize: '1.5rem', marginBottom: 'var(--space-2)' }}>🚧</p>
        <p style={{ fontWeight: 600 }}>La galería de elementos de "{label}" está en construcción</p>
        <p className="muted" style={{ fontSize: '0.85rem', marginTop: 'var(--space-1)' }}>
          Aquí se listarán los elementos evaluables del curso (sesiones) para esta sección,
          cada uno con su estado y acceso a edición.
        </p>
      </div>
    </div>
  )
}
