import { useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCurso } from '../shared/hooks/useCursos'
import { MOCK_CURSO, MOCK_CURSO_ID } from '../shared/mockData'

const PROCESOS = [
  { key: 'consignas', label: 'Consigna', permKey: 'permiteConsignas' as const },
  { key: 'rubricas', label: 'Rúbrica', permKey: 'permiteRubricas' as const },
  { key: 'matriz', label: 'Matriz', permKey: 'permiteMatrizSN' as const },
  { key: 'lista-cotejo', label: 'Lista de cotejo', permKey: 'permiteListaCotejo' as const },
  { key: 'escala', label: 'Escala de valoración', permKey: 'permiteEscala' as const },
]

export default function PanelAdmin() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const isMock = cursoId === MOCK_CURSO_ID
  const { curso: fetchedCurso, isLoading, error } = useCurso(isMock ? undefined : cursoId)
  const curso = isMock || error ? MOCK_CURSO : fetchedCurso

  useEffect(() => {
    document.title = 'Control Administrativo — Diseña+'
  }, [])

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver al curso</Link>

      <div className="card animate-in row-between" style={{ padding: 'var(--space-4)', margin: 'var(--space-3) 0 var(--space-5)' }}>
        <div>
          <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '1.2rem' }}>
            ⚙️ Control Administrativo
          </p>
          {curso && <p className="muted" style={{ fontSize: '0.85rem' }}>{curso.nombre}</p>}
        </div>
        {(isMock || error) && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
      </div>

      {isLoading && !isMock && <p className="muted">Cargando…</p>}

      {curso && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)' }}>
          <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
            <p style={{ fontWeight: 700, marginBottom: 'var(--space-3)' }}>Estado por proceso</p>
            <table className="grid-table">
              <thead>
                <tr><th>Proceso</th><th>Estado</th></tr>
              </thead>
              <tbody>
                {PROCESOS.map(p => (
                  <tr key={p.key}>
                    <td>{p.label}</td>
                    <td>
                      <span className={`badge ${curso[p.permKey] ? 'badge-success' : 'badge-muted'}`}>
                        {curso[p.permKey] ? 'Habilitado' : 'No asignado'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
            <p style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Permitir activación de IA</p>
            <p className="muted" style={{ fontSize: '0.82rem', marginBottom: 'var(--space-3)' }}>
              Vista de solo lectura por ahora — la activación real de IA se conecta en una fase posterior.
            </p>
            <ul className="stack" style={{ fontSize: '0.9rem' }}>
              {PROCESOS.map(p => (
                <li key={p.key} className="row-between">
                  <span>{p.label}</span>
                  <input type="checkbox" checked={curso[p.permKey]} readOnly aria-label={`Permitir ${p.label}`} />
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
    </div>
  )
}
