import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useEscalaValoracion } from '../../shared/hooks/useEscalaValoracion'
import GenerarIABoton from '../../components/GenerarIABoton'
import { RESPUESTA_TIERS, type RespuestaTier } from '../../types/escalaIndicador'
import { MOCK_ESCALAS, MOCK_CURSO_ID } from '../../shared/mockData'

export default function EscalaDetalle() {
  const { cursoId, sesionId, elementoNombre } = useParams<{ cursoId: string; sesionId: string; elementoNombre?: string }>()
  const isMock = cursoId === MOCK_CURSO_ID

  const { escala: fetchedEscala, indicadores: fetchedIndicadores, isLoading, error, isSaving, saveEvaluacion, puntajeObtenido, puntajeMaximo } =
    useEscalaValoracion(isMock ? undefined : { sesionId })

  const mockEscala = sesionId ? MOCK_ESCALAS[sesionId] : undefined
  const usingMock = isMock || (!isLoading && !!error)
  const escala = usingMock ? mockEscala : fetchedEscala
  const indicadores = usingMock ? mockEscala?.indicadores ?? [] : fetchedIndicadores

  const [mockRespuestas, setMockRespuestas] = useState<Record<string, RespuestaTier | null>>({})

  useEffect(() => {
    document.title = 'Escala de Valoración — Diseña+'
  }, [])

  const handleRespuesta = (indicadorId: string, tier: RespuestaTier) => {
    if (usingMock) {
      setMockRespuestas(prev => ({ ...prev, [indicadorId]: prev[indicadorId] === tier ? null : tier }))
      return
    }
    void saveEvaluacion({ id: indicadorId, respuesta: tier })
  }

  const puntajeActual = usingMock
    ? indicadores.reduce((t, i) => {
        const tier = mockRespuestas[i.id]
        return tier ? t + i.puntajes[tier] : t
      }, 0)
    : puntajeObtenido

  const puntajeMax = usingMock
    ? indicadores.reduce((t, i) => t + Math.max(...Object.values(i.puntajes)), 0)
    : puntajeMaximo

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}/escala`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver</Link>

      {isLoading && !isMock && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando…</p>}

      {!isLoading && !escala && (
        <div className="card animate-in" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
          <p className="muted">No se encontró una escala de valoración para este elemento.</p>
        </div>
      )}

      {escala && (
        <>
          <div className="row-between animate-in" style={{ margin: 'var(--space-3) 0 var(--space-3)' }}>
            <h1 style={{ fontSize: '1.3rem' }}>Escala de Valoración — {elementoNombre ?? escala.nombre}</h1>
            <div className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
              {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
              <GenerarIABoton />
            </div>
          </div>

          <p className="badge badge-muted animate-in" style={{ marginBottom: 'var(--space-3)' }}>
            Puntaje: {puntajeActual} / {puntajeMax}
          </p>

          <div className="card animate-in" style={{ overflowX: 'auto' }}>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th style={{ minWidth: 260 }}>Indicadores</th>
                  {RESPUESTA_TIERS.map(t => <th key={t.key}>{t.label}</th>)}
                  <th style={{ minWidth: 160 }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {indicadores.map((ind, idx) => {
                  const seleccionado = usingMock ? mockRespuestas[ind.id] ?? null : ind.respuesta
                  return (
                    <tr key={ind.id}>
                      <td className="mono">I{idx + 1}</td>
                      <td>{ind.indicador}</td>
                      {RESPUESTA_TIERS.map(t => (
                        <td key={t.key} style={{ textAlign: 'center' }}>
                          <label className="sr-only" htmlFor={`${ind.id}-${t.key}`}>{t.label}</label>
                          <input
                            id={`${ind.id}-${t.key}`}
                            type="radio"
                            name={`escala-${ind.id}`}
                            checked={seleccionado === t.key}
                            onChange={() => handleRespuesta(ind.id, t.key)}
                          />
                          <div className="mono muted" style={{ fontSize: '0.75rem' }}>{ind.puntajes[t.key]}</div>
                        </td>
                      ))}
                      <td style={{ fontSize: '0.85rem' }}>{ind.observaciones || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {isSaving && <p className="muted" style={{ fontSize: '0.8rem', marginTop: 'var(--space-2)' }}>Guardando…</p>}
        </>
      )}
    </div>
  )
}
