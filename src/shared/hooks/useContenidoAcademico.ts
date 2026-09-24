import { useCallback, useEffect, useState } from 'react'
import { getCursoContexto, getCursosAsignados, getProceso, type CursoContexto, type ProcesoCurso } from '../academico'
import { useAuth } from '../AuthContext'

/** Course context + workflow state for the "Diseño de contenido académico" screens. */
export function useContenidoAcademico(cursoId: string | undefined) {
  const { user, can } = useAuth()
  const verTodo = can('ver_todo') || !user?.usuarioId
  const usuarioId = user?.usuarioId
  const [ctx, setCtx] = useState<CursoContexto | null>(null)
  const [proceso, setProceso] = useState<ProcesoCurso | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(async () => {
    if (!cursoId) return
    setError(null)
    try {
      if (!verTodo && usuarioId) {
        const asignados = await getCursosAsignados(usuarioId)
        if (!asignados.has(cursoId)) throw new Error('No tienes acceso a este curso. Solo puedes ver los cursos que tienes asignados.')
      }
      const [c, p] = await Promise.all([getCursoContexto(cursoId), getProceso(cursoId)])
      setCtx(c)
      setProceso(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    } finally {
      setLoading(false)
    }
  }, [cursoId, verTodo, usuarioId])

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
  // "Finalizar edición general" only notifies the approvers; screens freeze
  // only once there is an approval check (Monitor EA, then DDA).
  void instrumento
  if (proceso.estado === 'aprobado') return { puede: false, motivo: 'El proceso fue aprobado por el Monitor EA y DDA, y está cerrado. Solo el Monitor EA puede habilitar la edición.' }
  if (proceso.estado === 'revision_dda') return { puede: false, motivo: 'El Monitor EA aprobó el proceso y está en revisión de DDA. Solo el Monitor EA puede habilitar la edición.' }
  return { puede: true, motivo: '' }
}
