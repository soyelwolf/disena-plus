import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useListaCotejo } from '../../shared/hooks/useListaCotejo'
import { listListasCotejoPorSesion } from '../../shared/services/listaCotejoService'
import { RESPUESTA } from '../../types/listaCotejo'
import { MOCK_LISTAS_COTEJO, MOCK_CURSO_ID } from '../../shared/mockData'

export default function ListaCotejoDetalle() {
  const { cursoId, sesionId, elementoNombre } = useParams<{ cursoId: string; sesionId: string; elementoNombre?: string }>()
  const isMock = cursoId === MOCK_CURSO_ID

  const [listaId, setListaId] = useState<string | undefined>(undefined)
  const [resolveError, setResolveError] = useState(false)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    document.title = 'Lista de Cotejo — Diseña+'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (isMock || !sesionId) {
        setResolved(true)
        return
      }
      try {
        const result = await listListasCotejoPorSesion(sesionId, { pageSize: 1 })
        if (!cancelled) {
          setListaId(result.items[0]?.id)
          setResolved(true)
        }
      } catch {
        if (!cancelled) {
          setResolveError(true)
          setResolved(true)
        }
      }
    }
    void resolve()
    return () => {
      cancelled = true
    }
  }, [sesionId, isMock])

  const { listaCotejo: fetchedLista, indicadores: fetchedIndicadores, isLoading, error, isSaving, setRespuesta, puntajeObtenido, puntajeTotal } =
    useListaCotejo(listaId)

  const mockLista = sesionId ? MOCK_LISTAS_COTEJO[sesionId] : undefined
  const usingMock = isMock || resolveError || (!isLoading && resolved && !!error) || (resolved && !listaId && !isMock)
  const lista = usingMock ? mockLista : fetchedLista
  const indicadores = usingMock ? mockLista?.indicadores ?? [] : fetchedIndicadores

  const [mockRespuestas, setMockRespuestas] = useState<Record<string, 'si' | 'no' | null>>({})

  const puntajeMax = usingMock
    ? indicadores.reduce((t, i) => t + i.puntaje, 0)
    : puntajeTotal
  const puntajeActual = usingMock
    ? indicadores.reduce((t, i) => (mockRespuestas[i.id] === 'si' ? t + i.puntaje : t), 0)
    : puntajeObtenido

  const handleRespuesta = (indicadorId: string, respuesta: 'si' | 'no') => {
    if (usingMock) {
      setMockRespuestas(prev => ({ ...prev, [indicadorId]: prev[indicadorId] === respuesta ? null : respuesta }))
      return
    }
    void setRespuesta(indicadorId, RESPUESTA[respuesta])
  }

  const loadingOverall = !resolved || (!!listaId && isLoading)

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}/lista-cotejo`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver</Link>

      {loadingOverall && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando…</p>}

      {!loadingOverall && !lista && (
        <div className="card animate-in" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
          <p className="muted">No se encontró una lista de cotejo para este elemento.</p>
        </div>
      )}

      {lista && (
        <>
          <div className="row-between animate-in" style={{ margin: 'var(--space-3) 0 var(--space-3)' }}>
            <h1 style={{ fontSize: '1.3rem' }}>Lista de Cotejo — {elementoNombre ?? lista.nombre}</h1>
            {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
          </div>

          <p className={`badge ${puntajeActual === puntajeMax ? 'badge-success' : 'badge-muted'} animate-in`} style={{ marginBottom: 'var(--space-3)' }}>
            Suma {puntajeActual} / {puntajeMax}{puntajeActual === puntajeMax ? ', correcto' : ''}
          </p>

          <div className="card animate-in" style={{ overflowX: 'auto' }}>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th style={{ minWidth: 280 }}>Indicadores</th>
                  <th>Puntaje</th>
                  <th>Sí</th>
                  <th>No</th>
                  <th style={{ minWidth: 180 }}>Observaciones</th>
                </tr>
              </thead>
              <tbody>
                {indicadores.map((ind, idx) => {
                  const respuesta = usingMock ? mockRespuestas[ind.id] ?? null : ind.respuestaKey
                  return (
                    <tr key={ind.id}>
                      <td className="mono">I{idx + 1}</td>
                      <td>{ind.indicador}</td>
                      <td className="mono">{ind.puntaje}</td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={respuesta === 'si'}
                          onChange={() => handleRespuesta(ind.id, 'si')}
                          aria-label={`Sí, indicador ${idx + 1}`}
                        />
                      </td>
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          checked={respuesta === 'no'}
                          onChange={() => handleRespuesta(ind.id, 'no')}
                          aria-label={`No, indicador ${idx + 1}`}
                        />
                      </td>
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
