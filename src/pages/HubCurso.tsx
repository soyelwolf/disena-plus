import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCurso } from '../shared/hooks/useCursos'

const SECCIONES = [
  { key: 'consignas', label: 'Consignas', icon: '📝', permKey: 'permiteConsignas' as const },
  { key: 'rubricas', label: 'Rúbricas', icon: '📊', permKey: 'permiteRubricas' as const },
  { key: 'matriz', label: 'Matriz', icon: '🧮', permKey: 'permiteMatrizSN' as const },
  { key: 'lista-cotejo', label: 'Lista de Cotejo', icon: '✅', permKey: 'permiteListaCotejo' as const },
  { key: 'escala', label: 'Escala de Valoración', icon: '📏', permKey: 'permiteEscala' as const },
]

export default function HubCurso() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const { curso, isLoading, error } = useCurso(cursoId)

  useEffect(() => {
    document.title = curso ? `${curso.nombre} — Diseña+` : 'Curso — Diseña+'
  }, [curso])

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to="/cursos" className="muted" style={{ fontSize: '0.85rem' }}>← Volver al listado</Link>

      {isLoading && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando curso…</p>}

      {error && (
        <div className="card" style={{ padding: 'var(--space-4)', marginTop: 'var(--space-3)', borderColor: 'var(--color-danger)' }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600 }}>No se pudo cargar el curso</p>
          <p className="muted" style={{ fontSize: '0.85rem' }}>{error}</p>
        </div>
      )}

      {curso && (
        <>
          <div className="card animate-in" style={{ padding: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
            <p className="badge badge-muted" style={{ marginBottom: 'var(--space-2)' }}>Curso seleccionado</p>
            <h1 style={{ fontSize: '1.4rem' }}>{curso.nombre}</h1>
            <p className="mono muted" style={{ fontSize: '0.85rem', marginTop: 'var(--space-1)' }}>
              {curso.codigoCatalogo} · {curso.tipoEnsenanza} · {curso.carrera}
            </p>
          </div>

          <h2 style={{ fontSize: '1.1rem', marginBottom: 'var(--space-3)' }}>Selecciona el proceso a construir</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 'var(--space-3)', marginBottom: 'var(--space-5)' }}>
            {SECCIONES.map(s => {
              const habilitado = curso[s.permKey]
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
