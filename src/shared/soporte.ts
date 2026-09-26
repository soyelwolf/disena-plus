// Support requests from the Soporte screen: a thread of messages between the
// person who asks and the administrators (supabase/schema-soporte.sql).

import { supabase } from './supabaseClient'

export type TemaSoporte = 'uso' | 'error' | 'acceso' | 'sugerencia' | 'otro'
export type EstadoSoporte = 'abierto' | 'respondido' | 'cerrado'

export const TEMAS_SOPORTE: Record<TemaSoporte, string> = {
  uso: 'Consulta sobre el uso',
  error: 'Algo no funciona',
  acceso: 'Acceso, cursos o permisos',
  sugerencia: 'Sugerencia',
  otro: 'Otro',
}

export interface Consulta {
  id: string
  correo: string
  nombre: string
  tema: TemaSoporte
  asunto: string
  estado: EstadoSoporte
  creado: string
  modificado: string
}

export interface MensajeSoporte {
  id: string
  autor: string
  correo: string | null
  esAdmin: boolean
  texto: string
  creado: string
}

function fail(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')
}

const aConsulta = (r: Record<string, string>): Consulta => ({
  id: r.dpl_soporteid,
  correo: r.dpl_correo,
  nombre: r.dpl_nombre,
  tema: r.dpl_tema as TemaSoporte,
  asunto: r.dpl_asunto,
  estado: r.dpl_estado as EstadoSoporte,
  creado: r.createdon,
  modificado: r.modifiedon,
})

/** Requests of one person, or every request (correo = null, for administrators). */
export async function listarConsultas(correo: string | null): Promise<{ tabla: boolean; consultas: Consulta[] }> {
  let q = supabase.from('dpl_soporte').select('*').order('modifiedon', { ascending: false })
  if (correo) q = q.eq('dpl_correo', correo.toLowerCase())
  const { data, error } = await q
  if (isMissingTable(error)) return { tabla: false, consultas: [] }
  fail(error, 'No se pudieron cargar las consultas.')
  return { tabla: true, consultas: (data ?? []).map(aConsulta) }
}

export async function crearConsulta(c: { correo: string; nombre: string; tema: TemaSoporte; asunto: string; mensaje: string }): Promise<Consulta> {
  const { data, error } = await supabase
    .from('dpl_soporte')
    .insert({ dpl_correo: c.correo.toLowerCase(), dpl_nombre: c.nombre, dpl_tema: c.tema, dpl_asunto: c.asunto.trim() })
    .select()
    .single()
  fail(error, 'No se pudo enviar la consulta.')
  const { error: e2 } = await supabase
    .from('dpl_soportemensaje')
    .insert({ dpl_soporteid: data.dpl_soporteid, dpl_autor: c.nombre, dpl_correoautor: c.correo.toLowerCase(), dpl_texto: c.mensaje.trim() })
  fail(e2, 'No se pudo enviar el mensaje.')
  return aConsulta(data)
}

export async function listarMensajes(soporteId: string): Promise<MensajeSoporte[]> {
  const { data, error } = await supabase
    .from('dpl_soportemensaje')
    .select('*')
    .eq('dpl_soporteid', soporteId)
    .order('createdon', { ascending: true })
  fail(error, 'No se pudieron cargar los mensajes.')
  return (data ?? []).map(m => ({
    id: m.dpl_soportemensajeid,
    autor: m.dpl_autor,
    correo: m.dpl_correoautor,
    esAdmin: !!m.dpl_esadmin,
    texto: m.dpl_texto,
    creado: m.createdon,
  }))
}

/** Adds a message; support answering marks it "respondido", the asker reopens it. */
export async function responderConsulta(soporteId: string, m: { autor: string; correo: string; esAdmin: boolean; texto: string }): Promise<void> {
  const { error } = await supabase
    .from('dpl_soportemensaje')
    .insert({ dpl_soporteid: soporteId, dpl_autor: m.autor, dpl_correoautor: m.correo.toLowerCase(), dpl_esadmin: m.esAdmin, dpl_texto: m.texto.trim() })
  fail(error, 'No se pudo enviar el mensaje.')
  await cambiarEstadoConsulta(soporteId, m.esAdmin ? 'respondido' : 'abierto')
}

export async function cambiarEstadoConsulta(soporteId: string, estado: EstadoSoporte): Promise<void> {
  const { error } = await supabase
    .from('dpl_soporte')
    .update({ dpl_estado: estado, modifiedon: new Date().toISOString() })
    .eq('dpl_soporteid', soporteId)
  fail(error, 'No se pudo actualizar la consulta.')
}
