import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCurso } from '../shared/hooks/useCursos'
import { MOCK_CURSO, MOCK_CURSO_ID } from '../shared/mockData'
import type { Curso } from '../types/curso'

const SECCIONES = [
  { key: 'consignas', label: 'Consignas', icon: '📝', permKey: 'permiteConsignas' as const },
  { key: 'rubricas', label: 'Rúbricas', icon: '📊', permKey: 'permiteRubricas' as const },
  { key: 'matriz', label: 'Matriz', icon: '🧮', permKey: 'permiteMatrizSN' as const },
  { key: 'lista-cotejo', label: 'Lista de Cotejo', icon: '✅', permKey: 'permiteListaCotejo' as const },
  { key: 'escala', label: 'Escala de Valoración', icon: '📏', permKey: 'permiteEscala' as const },
]

export default function HubCurso() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const isMock = cursoId === MOCK_CURSO_ID
  const { curso: fetchedCurso, isLoading, error } = useCurso(isMock ? undefined : cursoId)
  const curso: Curso | null = isMock ? MOCK_CURSO : fetchedCurso
  const usingMock = isMock || !!error

  useEffect(() => {
    document.title = curso ? `${curso.nombre} — Diseña+` : 'Curso — Diseña+'
  }, [curso])

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to="/cursos" className="muted" style={{ fontSize: '0.85rem' }}>← Volver al listado</Link>

      {isLoading && !isMock && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando curso…</p>}

      {(curso ?? (error && MOCK_CURSO)) && (
        <>
          <div className="card animate-in row-between" style={{ padding: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
            <div>
              <p className="badge badge-muted" style={{ marginBottom: 'var(--space-2)' }}>Curso seleccionado</p>
              <h1 style={{ fontSize: '1.4rem' }}>{(curso ?? MOCK_CURSO).nombre}</h1>
              <p className="mono muted" style={{ fontSize: '0.85rem', marginTop: 'var(--space-1)' }}>
                {(curso ?? MOCK_CURSO).codigoCatalogo} · {(curso ?? MOCK_CURSO).tipoEnsenanza} · {(curso ?? MOCK_CURSO).carrera}
              </p>
            </div>
            {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
          </div>

          <h2 style={{ fontSize: '1.1rem', marginBottom: 'var(--space-3)' }}>Selecciona el proceso a construir</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            {SECCIONES.map(s => {
              const habilitado = (curso ?? MOCK_CURSO)[s.permKey]
              const content = (
                <>
                  <span style={{ fontSize: '1.5rem' }}>{s.icon}</span>
                  <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>{s.label}</span>
                  <span className={`badge ${habilitado ? 'badge-success' : 'badge-muted'}`}>
                    {habilitado ? 'Activado' : 'No asignado'}
                  </span>
                </>
              )
              return habilitado ? (
                <Link
                  key={s.key}
                  to={`/cursos/${cursoId}/${s.key}`}
                  className="card card-interactive animate-in stack"
                  style={{ padding: 'var(--space-3)' }}
                >
                  {content}
                </Link>
              ) : (
                <div key={s.key} className="card animate-in stack" style={{ padding: 'var(--space-3)', opacity: 0.6 }}>
                  {content}
                </div>
              )
            })}
          </div>

          <Link to={`/cursos/${cursoId}/admin`} className="btn btn-ghost animate-in">
            ⚙️ Panel de Control Administrativo
          </Link>
        </>
      )}
    </div>
  )
}
