import { useEffect, useState, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCurso } from '../shared/hooks/useCursos'
import { listSesionesByUnidad } from '../shared/services/sesionService'
import type { Sesion } from '../types/sesion'
import { MOCK_CURSO_ID, MOCK_ELEMENTOS_POR_SECCION, type MockElementoResumen } from '../shared/mockData'

const SECCION_META: Record<string, { label: string; icon: string }> = {
  consignas: { label: 'Consignas', icon: '📝' },
  rubricas: { label: 'Rúbricas', icon: '📊' },
  matriz: { label: 'Matriz', icon: '🧮' },
  'lista-cotejo': { label: 'Lista de Cotejo', icon: '✅' },
  escala: { label: 'Escala de Valoración', icon: '📏' },
}

export default function SeccionIndice() {
  const { cursoId, seccion } = useParams<{ cursoId: string; seccion: string }>()
  const { curso, isLoading: cursoLoading } = useCurso(cursoId, { includeUnidades: true })
  const meta = (seccion && SECCION_META[seccion]) || { label: 'Sección', icon: '📁' }

  const [elementos, setElementos] = useState<MockElementoResumen[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)

  useEffect(() => {
    document.title = `${meta.label} — Diseña+`
  }, [meta.label])

  const load = useCallback(async () => {
    if (!cursoId || !seccion) return

    if (cursoId === MOCK_CURSO_ID) {
      setElementos(MOCK_ELEMENTOS_POR_SECCION[seccion] ?? [])
      setUsingMock(true)
      setIsLoading(false)
      return
    }

    setIsLoading(true)
    try {
      if (!curso) return
      const unidadIds = curso.unidades.map(u => u.id)
      const sesionesPerUnidad = await Promise.all(unidadIds.map(id => listSesionesByUnidad(id)))
      const todas: Sesion[] = sesionesPerUnidad.flatMap(r => r.items)
      setElementos(todas.map(sesion => ({ sesion, tieneContenido: true })))
      setUsingMock(false)
    } catch {
      // Real API unreachable (expected on localhost) — fall back to sample data
      // so the gallery/detail flow can still be designed and demoed.
      setElementos(MOCK_ELEMENTOS_POR_SECCION[seccion] ?? [])
      setUsingMock(true)
    } finally {
      setIsLoading(false)
    }
  }, [cursoId, seccion, curso])

  useEffect(() => {
    void load()
  }, [load])

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver al curso</Link>

      <div className="card animate-in row-between" style={{ padding: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.2rem' }}>
            {meta.icon} {meta.label}
          </p>
          {curso && <p className="muted" style={{ fontSize: '0.85rem' }}>{curso.nombre}</p>}
        </div>
        {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
      </div>

      {(isLoading || cursoLoading) && <p className="muted">Cargando elementos…</p>}

      {!isLoading && elementos.length === 0 && (
        <div className="card animate-in" style={{ padding: 'var(--space-5)', textAlign: 'center' }}>
          <p className="muted">Aún no hay elementos registrados para esta sección.</p>
        </div>
      )}

      {!isLoading && elementos.length > 0 && (
        <div className="stack">
          {elementos.map(({ sesion, tieneContenido }) => (
            <Link
              key={sesion.id}
              to={`/cursos/${cursoId}/${seccion}/${sesion.id}`}
              className="card card-interactive animate-in row-between"
              style={{ padding: 'var(--space-3) var(--space-4)' }}
            >
              <div>
                <p style={{ fontWeight: 700 }}>{sesion.elemento}</p>
                {sesion.tema && <p className="muted" style={{ fontSize: '0.82rem' }}>{sesion.tema}</p>}
              </div>
              <span className={`badge ${tieneContenido ? 'badge-success' : 'badge-muted'}`}>
                {tieneContenido ? '✓ Sin comentarios pendientes' : 'Propuesta aún no generada'}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
