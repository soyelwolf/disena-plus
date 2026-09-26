// In-app notifications (bell in the header, supabase/schema-notificaciones.sql).
// Written by the app when something happens in a course, one row per recipient,
// chosen by their role in that course (dpl_cursoasignacion). The person who did
// it is never notified. A failure here never blocks the action itself.

import { supabase } from './supabaseClient'

export type TipoNotificacion = 'finalizado' | 'enviado' | 'comentario' | 'respuesta' | 'aprobado' | 'devuelto' | 'habilitado' | 'incidencia'

export interface Notificacion {
  id: string
  cursoId: string | null
  tipo: TipoNotificacion
  titulo: string
  detalle: string | null
  ruta: string | null
  actor: string | null
  leida: boolean
  fecha: string
}

/** Roles of dpl_cursoasignacion grouped the way notifications address them. */
export const REVISORES = ['monitor_ea', 'monitor_qa', 'monitor_disena', 'dda']
export const EQUIPO_DOCENTE = ['docente', 'asesor']
export const TODOS = [...EQUIPO_DOCENTE, ...REVISORES]

const RUTA_INSTRUMENTO: Record<string, string> = { consignas: 'consignas', rubricas: 'rubricas', lista: 'lista', escala: 'escala' }
export const PARTE: Record<string, string> = { consignas: 'Consignas', rubricas: 'Rúbricas', matriz: 'Matriz', lista: 'Lista de cotejo', escala: 'Escala de valoración' }

export function rutaDe(cursoId: string, instrumento?: string | null): string {
  const r = instrumento ? RUTA_INSTRUMENTO[instrumento] : undefined
  return r ? `/cursos/${cursoId}/${r}` : `/cursos/${cursoId}`
}

/**
 * Notify the people of a course with the given roles (and/or specific e-mails),
 * except the actor. Never throws: a notification must not break the action.
 */
export async function notificar(params: {
  cursoId: string
  roles?: string[]
  correos?: string[]
  actorCorreo: string
  tipo: TipoNotificacion
  titulo: (curso: string) => string
  detalle?: string | null
  ruta: string
}): Promise<void> {
  try {
    const actor = params.actorCorreo.toLowerCase()
    const [{ data: curso }, { data: asig }, { data: usuarios }] = await Promise.all([
      supabase.from('dpl_curso').select('dpl_nombrecurso, dpl_idcursotext, dpl_tipoensenanza').eq('dpl_cursoid', params.cursoId).maybeSingle(),
      params.roles?.length
        ? supabase.from('dpl_cursoasignacion').select('dpl_usuarioid, dpl_rol').eq('dpl_cursoid', params.cursoId).in('dpl_rol', params.roles)
        : Promise.resolve({ data: [] as Array<{ dpl_usuarioid: string }> }),
      supabase.from('dpl_usuario').select('dpl_usuarioid, dpl_correo, dpl_nombre'),
    ])
    const porCorreo = new Map((usuarios ?? []).map(u => [String(u.dpl_correo ?? '').toLowerCase(), u]))
    const destinatarios = new Set<string>((asig ?? []).map(a => a.dpl_usuarioid as string))
    for (const c of params.correos ?? []) {
      const u = porCorreo.get(c.toLowerCase())
      if (u) destinatarios.add(u.dpl_usuarioid as string)
    }
    const actorId = porCorreo.get(actor)?.dpl_usuarioid
    if (actorId) destinatarios.delete(actorId as string)
    if (!destinatarios.size) return
    const nombreCurso = curso
      ? `${capital(String(curso.dpl_nombrecurso ?? ''))}${curso.dpl_idcursotext ? ` (${curso.dpl_idcursotext}${curso.dpl_tipoensenanza ? ` · ${curso.dpl_tipoensenanza}` : ''})` : ''}`
      : 'Un curso'
    const actorNombre = (porCorreo.get(actor)?.dpl_nombre as string | undefined) ?? params.actorCorreo
    await supabase.from('dpl_notificacion').insert(
      [...destinatarios].map(id => ({
        dpl_usuarioid: id,
        dpl_cursoid: params.cursoId,
        dpl_tipo: params.tipo,
        dpl_titulo: params.titulo(nombreCurso),
        dpl_detalle: params.detalle ?? null,
        dpl_ruta: params.ruta,
        dpl_actor: actorNombre,
      })),
    )
  } catch {
    // Notifications table missing or offline: the action already happened; nothing else to do.
  }
}

const capital = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s)

export async function listarNotificaciones(usuarioId: string): Promise<{ tabla: boolean; items: Notificacion[] }> {
  const { data, error } = await supabase
    .from('dpl_notificacion')
    .select('*')
    .eq('dpl_usuarioid', usuarioId)
    .order('createdon', { ascending: false })
    .limit(60)
  if (error) return { tabla: !/does not exist|schema cache/i.test(error.message), items: [] }
  return {
    tabla: true,
    items: (data ?? []).map(n => ({
      id: n.dpl_notificacionid,
      cursoId: n.dpl_cursoid,
      tipo: n.dpl_tipo,
      titulo: n.dpl_titulo,
      detalle: n.dpl_detalle,
      ruta: n.dpl_ruta,
      actor: n.dpl_actor,
      leida: !!n.dpl_leida,
      fecha: n.createdon,
    })),
  }
}

export async function marcarLeidas(ids: string[]): Promise<void> {
  if (!ids.length) return
  await supabase.from('dpl_notificacion').update({ dpl_leida: true }).in('dpl_notificacionid', ids)
}
