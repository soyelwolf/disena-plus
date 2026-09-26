import { useCallback, useEffect, useState } from 'react'
import { getCursoContexto, getProceso, getRolesEnCurso, type CursoContexto, type LadoComentario, type ProcesoCurso } from '../academico'
import { useAuth } from '../AuthContext'

/**
 * What the signed-in person may do in THIS course. It comes from the person
 * columns of LISTADO_CURSOS_PARA_IA (dpl_cursoasignacion): the same person can
 * be Monitor EA in one course and DDA or adviser in another. "Persona Asignada"
 * only decides who sees the course; the other columns say what they can do.
 * The Usuarios list only lets people sign in; "Administrador" only opens the
 * Centro de datos and lets them see every course.
 */
export interface RolCurso {
  /** Docente / Asesor: fills in the content and replies to comments. */
  editar: boolean
  /** Monitor EA: first approval, and the only one who can re-enable editing. */
  monitor: boolean
  dda: boolean
  /** Any reviewer (Monitor EA, Monitor QA, Monitor Diseña+, DDA): opens and resolves comments. */
  revisor: boolean
  admin: boolean
  /** Side the person speaks for in comment threads (null = can't comment). */
  lado: LadoComentario | null
  /** Label shown next to their comments. */
  etiqueta: string
}

const SIN_ROL: RolCurso = { editar: false, monitor: false, dda: false, revisor: false, admin: false, lado: null, etiqueta: '' }

function rolDesde(asignaciones: string[], admin: boolean): RolCurso {
  const tiene = (r: string) => asignaciones.includes(r)
  const editar = tiene('docente') || tiene('asesor')
  const monitor = tiene('monitor_ea')
  const dda = tiene('dda')
  const otroMonitor = tiene('monitor_qa') || tiene('monitor_disena')
  const revisor = monitor || dda || otroMonitor
  // Monitor QA / Diseña+ comment on the monitors' side, under their own label.
  const lado: LadoComentario | null = monitor || otroMonitor ? 'monitor_ea' : dda ? 'dda' : editar ? 'docente' : null
  const etiqueta = monitor ? 'Monitor EA'
    : tiene('monitor_qa') ? 'Monitor QA'
    : tiene('monitor_disena') ? 'Monitor Diseña+'
    : dda ? 'DDA'
    : tiene('docente') ? 'Docente'
    : tiene('asesor') ? 'Asesor'
    : admin ? 'Administrador' : ''
  return { editar, monitor, dda, revisor, admin, lado, etiqueta }
}

/** Course context + workflow state + the person's role in the course. */
export function useContenidoAcademico(cursoId: string | undefined) {
  const { user, can } = useAuth()
  const admin = can('administrar_datos')
  const verTodo = can('ver_todo')
  const usuarioId = user?.usuarioId
  const rolesGlobales = (user?.roles ?? []).join(',')
  const [ctx, setCtx] = useState<CursoContexto | null>(null)
  const [proceso, setProceso] = useState<ProcesoCurso | null>(null)
  const [rol, setRol] = useState<RolCurso>(SIN_ROL)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const recargar = useCallback(async () => {
    if (!cursoId) return
    setError(null)
    try {
      let asignaciones: string[]
      if (usuarioId) {
        asignaciones = await getRolesEnCurso(usuarioId, cursoId)
        if (!asignaciones.includes('asignado') && !verTodo) throw new Error('No tienes acceso a este curso. Solo puedes ver los cursos donde figuras como Persona Asignada.')
      } else {
        // Demo sign-in before the users table exists: fall back to the chosen roles.
        const g = rolesGlobales.split(',')
        asignaciones = ['asignado', ...g.filter(r => r !== 'administrador')]
      }
      const [c, p] = await Promise.all([getCursoContexto(cursoId), getProceso(cursoId)])
      setRol(rolDesde(asignaciones, admin))
      setCtx(c)
      setProceso(p)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    } finally {
      setLoading(false)
    }
  }, [cursoId, verTodo, usuarioId, admin, rolesGlobales])

  useEffect(() => {
    setLoading(true)
    recargar()
  }, [recargar])

  return { ctx, setCtx, proceso, rol, error, loading, recargar }
}

/** Whether the signed-in user may edit an instrument right now, and why not. */
export function usePuedeEditar(proceso: ProcesoCurso | null, rol: RolCurso) {
  if (!rol.editar) return { puede: false, motivo: 'En este curso tu rol solo permite ver esta información.' }
  if (!proceso) return { puede: false, motivo: '' }
  // "Finalizar edición general" only notifies the approvers; screens freeze
  // only when both approval checks are in (Monitor EA and DDA).
  if (proceso.estado === 'aprobado') return { puede: false, motivo: 'El proceso fue aprobado por el Monitor EA y DDA, y está cerrado. Solo el Monitor EA puede habilitar la edición.' }
  return { puede: true, motivo: '' }
}
