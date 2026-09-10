import { useEffect, useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRubrica } from '../../shared/hooks/useRubrica'
import { MOCK_RUBRICAS, MOCK_CURSO_ID } from '../../shared/mockData'

export default function RubricaDetalle() {
  const { cursoId, sesionId, elementoNombre } = useParams<{ cursoId: string; sesionId: string; elementoNombre?: string }>()
  const isMock = cursoId === MOCK_CURSO_ID

  const { rubrica: fetchedRubrica, criterios: fetchedCriterios, isLoading, error, isSaving, updateCriterio, saveError } =
    useRubrica(isMock ? undefined : { sesionId })

  const mockRubrica = sesionId ? MOCK_RUBRICAS[sesionId] : undefined
  const usingMock = isMock || (!isLoading && !!error)
  const rubrica = usingMock ? mockRubrica : fetchedRubrica
  const criterios = usingMock ? mockRubrica?.criterios ?? [] : fetchedCriterios

  const puntajeEstandarTotal = useMemo(
    () => criterios.reduce((t, c) => t + c.puntajeEstandar, 0),
    [criterios],
  )

  useEffect(() => {
    document.title = 'Rúbrica — Diseña+'
  }, [])

  const handleEdit = (criterioId: string, campo: 'estandarEsperado' | 'enProceso2' | 'enProceso1' | 'inicial', valor: string) => {
    if (usingMock) return // read-only in local sample-data mode
    void updateCriterio(criterioId, { [campo]: valor })
  }

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}/rubricas`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver</Link>

      {isLoading && !isMock && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando…</p>}

      {!isLoading && !rubrica && (
        <div className="card animate-in" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
          <p className="muted">No se encontró una rúbrica para este elemento.</p>
        </div>
      )}

      {rubrica && (
        <>
          <div className="row-between animate-in" style={{ margin: 'var(--space-3) 0 var(--space-3)' }}>
            <h1 style={{ fontSize: '1.3rem' }}>Rúbrica de {elementoNombre ?? rubrica.nombre}</h1>
            {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
          </div>

          {saveError && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{saveError}</p>}

          <p className="muted animate-in" style={{ fontSize: '0.82rem', marginBottom: 'var(--space-3)' }}>
            ⚠️ La IA puede cometer errores, verifica antes de guardar. Puntaje máximo (Estándar): <strong>{puntajeEstandarTotal}</strong>
          </p>

          <div className="card animate-in" style={{ overflowX: 'auto' }}>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th style={{ minWidth: 160 }}>Criterio</th>
                  <th style={{ minWidth: 220 }}>Descripción</th>
                  <th style={{ minWidth: 220 }}>Estándar esperado (Pj)</th>
                  <th style={{ minWidth: 200 }}>En proceso 2 (Pj)</th>
                  <th style={{ minWidth: 200 }}>En proceso 1 (Pj)</th>
                  <th style={{ minWidth: 200 }}>Inicial (Pj)</th>
                </tr>
              </thead>
              <tbody>
                {criterios.map((c, idx) => (
                  <tr key={c.id}>
                    <td className="mono">CR{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{c.criterio}</td>
                    <td style={{ fontSize: '0.85rem' }} dangerouslySetInnerHTML={{ __html: c.definicionCriterio }} />
                    <GridCell html={c.estandarEsperado} puntaje={c.puntajeEstandar} editable={!usingMock}
                      onChange={v => handleEdit(c.id, 'estandarEsperado', v)} />
                    <GridCell html={c.enProceso2} puntaje={c.puntajeEnProceso2} editable={!usingMock}
                      onChange={v => handleEdit(c.id, 'enProceso2', v)} />
                    <GridCell html={c.enProceso1} puntaje={c.puntajeEnProceso1} editable={!usingMock}
                      onChange={v => handleEdit(c.id, 'enProceso1', v)} />
                    <GridCell html={c.inicial} puntaje={c.puntajeInicial} editable={!usingMock}
                      onChange={v => handleEdit(c.id, 'inicial', v)} />
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {isSaving && <p className="muted" style={{ fontSize: '0.8rem', marginTop: 'var(--space-2)' }}>Guardando…</p>}
        </>
      )}
    </div>
  )
}

function GridCell({
  html,
  puntaje,
  editable,
  onChange,
}: {
  html: string
  puntaje: number
  editable: boolean
  onChange: (value: string) => void
}) {
  return (
    <td>
      <div
        style={{ fontSize: '0.85rem', marginBottom: 'var(--space-1)' }}
        contentEditable={editable}
        suppressContentEditableWarning
        onBlur={e => onChange(e.currentTarget.innerHTML)}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <span className="badge badge-muted mono">{puntaje} pts</span>
    </td>
  )
}
