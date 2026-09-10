import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMatriz } from '../../shared/hooks/useMatriz'
import { listMatrizsBySesion } from '../../shared/services/matrizService'
import { MOCK_MATRICES, MOCK_CURSO_ID } from '../../shared/mockData'

export default function MatrizDetalle() {
  const { cursoId, sesionId, elementoNombre } = useParams<{ cursoId: string; sesionId: string; elementoNombre?: string }>()
  const isMock = cursoId === MOCK_CURSO_ID

  const [matrizId, setMatrizId] = useState<string | undefined>(undefined)
  const [resolveError, setResolveError] = useState(false)
  const [resolved, setResolved] = useState(false)

  useEffect(() => {
    document.title = 'Matriz — Diseña+'
  }, [])

  useEffect(() => {
    let cancelled = false
    async function resolve() {
      if (isMock || !sesionId) {
        setResolved(true)
        return
      }
      try {
        const result = await listMatrizsBySesion(sesionId, { pageSize: 1 })
        if (!cancelled) {
          setMatrizId(result.items[0]?.id)
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

  const { matriz: fetchedMatriz, preguntas: fetchedPreguntas, isLoading, error, isSaving, editPregunta, mutationError } =
    useMatriz(matrizId)

  const mockMatriz = sesionId ? MOCK_MATRICES[sesionId] : undefined
  const usingMock = isMock || resolveError || (!isLoading && resolved && !!error) || (resolved && !matrizId && !isMock)
  const matriz = usingMock ? mockMatriz : fetchedMatriz
  const preguntas = usingMock ? mockMatriz?.preguntas ?? [] : fetchedPreguntas

  const handleEdit = (preguntaId: string, campo: 'taxonomia' | 'tipoItem' | 'plataforma', valor: string) => {
    if (usingMock) return
    void editPregunta(preguntaId, { [campo]: valor })
  }

  const loadingOverall = !resolved || (!!matrizId && isLoading)

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}/matriz`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver</Link>

      {loadingOverall && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando…</p>}

      {!loadingOverall && !matriz && (
        <div className="card animate-in" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
          <p className="muted">No se encontró una matriz para este elemento.</p>
        </div>
      )}

      {matriz && (
        <>
          <div className="row-between animate-in" style={{ margin: 'var(--space-3) 0 var(--space-3)' }}>
            <h1 style={{ fontSize: '1.3rem' }}>Matriz de {elementoNombre ?? matriz.nombre}</h1>
            {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
          </div>

          {mutationError && <p style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>{mutationError}</p>}

          <p className="muted animate-in" style={{ fontSize: '0.82rem', marginBottom: 'var(--space-3)' }}>
            ⚠️ La IA puede cometer errores, verifica antes de guardar. Suma de puntajes:{' '}
            <strong>{preguntas.reduce((t, p) => t + p.puntajeIA, 0).toFixed(2)}</strong> / 20
          </p>

          <div className="card animate-in" style={{ overflowX: 'auto' }}>
            <table className="grid-table">
              <thead>
                <tr>
                  <th>N°</th>
                  <th style={{ minWidth: 240 }}>Eje temático</th>
                  <th>Taxonomía</th>
                  <th>Tipo de ítem</th>
                  <th>Plataforma</th>
                  <th>Cant. ítems</th>
                  <th>Puntaje IA</th>
                </tr>
              </thead>
              <tbody>
                {preguntas.map((p, idx) => (
                  <tr key={p.id}>
                    <td className="mono">{idx + 1}</td>
                    <td style={{ fontWeight: 600 }}>{p.ejeTematico}</td>
                    <td
                      contentEditable={!usingMock}
                      suppressContentEditableWarning
                      onBlur={e => handleEdit(p.id, 'taxonomia', e.currentTarget.textContent ?? '')}
                    >
                      {p.taxonomia}
                    </td>
                    <td
                      contentEditable={!usingMock}
                      suppressContentEditableWarning
                      onBlur={e => handleEdit(p.id, 'tipoItem', e.currentTarget.textContent ?? '')}
                    >
                      {p.tipoItem}
                    </td>
                    <td
                      contentEditable={!usingMock}
                      suppressContentEditableWarning
                      onBlur={e => handleEdit(p.id, 'plataforma', e.currentTarget.textContent ?? '')}
                    >
                      {p.plataforma || '—'}
                    </td>
                    <td className="mono">{p.cantidadItems}</td>
                    <td className="mono">{p.puntajeIA.toFixed(2)}</td>
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
