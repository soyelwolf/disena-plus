import { useCallback, useEffect, useState } from 'react'
import { getCursoContexto, getProceso, type CursoContexto, type ProcesoCurso } from '../academico'
import { useAuth } from '../AuthContext'

/** Course context + workflow state for the "Diseño de contenido académico" screens. */
export function useContenidoAcademico(cursoId: string | undefined) {
  const [ctx, setCtx] = useState<CursoContexto | null>(null)
  const [proceso, setProceso] = useState<ProcesoCurso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(async () => {
    if (!cursoId) return
    setError(null)
    try {
      const [c, p] = await Promise.all([getCursoContexto(cursoId), getProceso(cursoId)])
      setCtx(c)
      setProceso(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    } finally {
      setLoading(false)
    }
  }, [cursoId])

  useEffect(() => {
    setLoading(true)
    recargar()
  }, [recargar])

  return { ctx, setCtx, proceso, error, loading, recargar }
}

/** Whether the signed-in user may edit an instrument right now, and why not. */
export function usePuedeEditar(proceso: ProcesoCurso | null, instrumento: 'consignas' | 'rubricas') {
  const { can } = useAuth()
  if (!can('editar_contenido')) return { puede: false, motivo: 'Tu rol solo permite ver esta información.' }
  if (!proceso) return { puede: false, motivo: '' }
  if (proceso.estado === 'aprobado') return { puede: false, motivo: 'El proceso fue aprobado por DDA y está cerrado.' }
  if (proceso.estado !== 'en_edicion') return { puede: false, motivo: 'La edición está deshabilitada mientras los aprobadores revisan la información.' }
  if (proceso.finalizado[instrumento]) return { puede: false, motivo: 'Finalizaste la edición. Solo el Monitor EA puede habilitarla de nuevo.' }
  return { puede: true, motivo: '' }
}
