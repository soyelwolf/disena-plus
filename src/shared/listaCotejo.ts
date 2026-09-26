// Lista de cotejo: one header per element (dpl_listacotejo) and its indicators
// (dpl_listacotejoindicador). Mirrors the rubric: it follows the instrument
// chosen in the consigna, the rules are warnings while working and a
// requirement for "Finalizar edición general".

import { supabase } from './supabaseClient'
import { INSTRUMENTO_VALORES, PUNTAJE_OBJETIVO, idConsigna, type CursoContexto, type Elemento } from './academico'

/** UTP rules of the checklist (SharePoint LISTA_DE_COTEJO has 10 indicator columns). */
export const REGLAS_LISTA = { maxIndicadores: 10, indicadorMax: 250, observacionesMax: 500 }

export interface IndicadorRow {
  dpl_listacotejoindicadorid: string
  dpl_listacotejoid: string
  dpl_orden: number | null
  dpl_indicador: string | null
  dpl_puntaje: number | null
  dpl_observaciones: string | null
  /** Sí / No, filled when grading (100000000 = Sí, 100000001 = No). */
  dpl_respuesta: number | null
}

export type IndicadorCampos = Pick<IndicadorRow, 'dpl_indicador' | 'dpl_puntaje' | 'dpl_observaciones'>

export interface ListaElemento {
  elemento: Elemento
  listaId: string | null
  indicadores: IndicadorRow[]
}

export interface ListasCurso {
  /** Elements with a checklist whose consigna still uses one. */
  elementos: ListaElemento[]
  /** Have a checklist, but the consigna changed to another instrument (can be removed). */
  sobrantes: ListaElemento[]
  /** The consigna now uses a checklist, but the element has none yet (can be added). */
  faltantes: Elemento[]
}

function fail(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

export function usaLista(e: Elemento): boolean {
  return (e.consigna?.dpl_instrumento ?? '').toLowerCase() === INSTRUMENTO_VALORES.lista
}

export async function getListasCurso(ctx: CursoContexto): Promise<ListasCurso> {
  const sesionIds = ctx.elementos.map(e => e.sesionId)
  const { data: listas, error } = sesionIds.length
    ? await supabase.from('dpl_listacotejo').select('dpl_listacotejoid, dpl_sesionid').in('dpl_sesionid', sesionIds)
    : { data: [], error: null }
  fail(error, 'No se pudieron cargar las listas de cotejo.')
  const listaPorSesion = new Map((listas ?? []).map(l => [l.dpl_sesionid as string, l.dpl_listacotejoid as string]))
  const ids = [...listaPorSesion.values()]
  let indicadores: IndicadorRow[] = []
  if (ids.length) {
    const { data, error: e2 } = await supabase
      .from('dpl_listacotejoindicador')
      .select('*')
      .in('dpl_listacotejoid', ids)
      .order('dpl_orden', { ascending: true })
    fail(e2, 'No se pudieron cargar los indicadores.')
    indicadores = (data ?? []) as IndicadorRow[]
  }
  const conLista: ListaElemento[] = ctx.elementos
    .filter(e => listaPorSesion.has(e.sesionId))
    .map(e => {
      const listaId = listaPorSesion.get(e.sesionId) ?? null
      return { elemento: e, listaId, indicadores: indicadores.filter(i => i.dpl_listacotejoid === listaId) }
    })
  // Follows the instrument chosen in the consigna (an empty choice keeps it).
  const elementos = conLista.filter(l => !l.elemento.consigna?.dpl_instrumento || usaLista(l.elemento))
  const sobrantes = conLista.filter(l => !elementos.includes(l))
  const faltantes = ctx.elementos.filter(e => usaLista(e) && !listaPorSesion.has(e.sesionId))
  return { elementos, sobrantes, faltantes }
}

const redondear = (n: number) => Math.round(n * 100) / 100
const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
const num = (v: unknown) => (vacio(v) ? null : Number(String(v).replace(',', '.')))

export function totalLista(indicadores: Array<Partial<Record<keyof IndicadorCampos, unknown>>>): number {
  return redondear(indicadores.reduce<number>((s, i) => s + (Number.isFinite(num(i.dpl_puntaje)) ? (num(i.dpl_puntaje) as number) : 0), 0))
}

/**
 * Checklist rules shown as warnings while the teacher works (saving is never
 * blocked; "Finalizar edición general" requires all of them). Indicators in
 * screen order; scores may be strings (form) or numbers (database).
 */
export function advertenciasLista(indicadores: Array<Partial<Record<keyof IndicadorCampos, unknown>>>): string[] {
  const { maxIndicadores, indicadorMax, observacionesMax } = REGLAS_LISTA
  const avisos: string[] = []
  if (!indicadores.length) return avisos
  const n = indicadores.length
  if (n > maxIndicadores) avisos.push(`Tiene ${n} indicadores: el máximo es ${maxIndicadores}.`)
  const total = totalLista(indicadores)
  const falta = redondear(PUNTAJE_OBJETIVO - total)
  if (falta > 0) avisos.push(`La suma total de puntaje debe ser ${PUNTAJE_OBJETIVO} pt: suma ${total} pt, ${falta === 1 ? 'falta' : 'faltan'} ${falta} pt.`)
  else if (falta < 0) avisos.push(`La suma total de puntaje debe ser ${PUNTAJE_OBJETIVO} pt: suma ${total} pt, te pasaste por ${-falta} pt.`)
  indicadores.forEach((i, k) => {
    const n = `Indicador N°${k + 1}`
    if (vacio(i.dpl_indicador) && vacio(i.dpl_puntaje) && vacio(i.dpl_observaciones)) {
      avisos.push(`${n}: está vacío; complétalo o elimínalo.`)
      return
    }
    // Observaciones is optional.
    const faltan = [vacio(i.dpl_indicador) && 'Indicador', vacio(i.dpl_puntaje) && 'Puntaje'].filter(Boolean)
    if (faltan.length) avisos.push(`${n}: falta completar ${faltan.join(', ')}.`)
    const p = num(i.dpl_puntaje)
    if (!vacio(i.dpl_puntaje) && !(Number.isFinite(p) && (p as number) > 0)) avisos.push(`${n}: el puntaje debe ser un número mayor que 0.`)
    const largos = [
      String(i.dpl_indicador ?? '').length > indicadorMax && 'Indicador',
      String(i.dpl_observaciones ?? '').length > observacionesMax && 'Observaciones',
    ].filter(Boolean)
    if (largos.length) avisos.push(`${n}: excede el límite de caracteres en ${largos.join(', ')}.`)
  })
  return avisos
}

export type ProblemaLista = 'sin_indicadores' | 'reglas'

export function problemaLista(l: ListaElemento): ProblemaLista | null {
  if (l.indicadores.length === 0) return 'sin_indicadores'
  if (advertenciasLista(l.indicadores).length) return 'reglas'
  return null
}

async function asegurarLista(ctx: CursoContexto, elemento: Elemento, usuario: string): Promise<string> {
  const { data: existente } = await supabase.from('dpl_listacotejo').select('dpl_listacotejoid').eq('dpl_sesionid', elemento.sesionId).maybeSingle()
  if (existente) return existente.dpl_listacotejoid as string
  const { data, error } = await supabase
    .from('dpl_listacotejo')
    .insert({
      dpl_sesionid: elemento.sesionId,
      dpl_nombre: `Lista de cotejo — ${elemento.nombre}`,
      dpl_idlistatext: idConsigna(ctx.idCursoText, elemento),
      dpl_activado: true,
      dpl_usuarioregistro: usuario,
      dpl_fecharegistro: new Date().toISOString(),
    })
    .select('dpl_listacotejoid')
    .single()
  fail(error, 'No se pudo crear la lista de cotejo.')
  return data!.dpl_listacotejoid as string
}

/** Create the (empty) checklist of elements whose consigna now uses one. */
export async function agregarAListas(ctx: CursoContexto, elementos: Elemento[], usuario: string): Promise<void> {
  for (const e of elementos) await asegurarLista(ctx, e, usuario)
}

/** Remove the checklist of an element whose consigna no longer uses one (indicators and comments too). */
export async function quitarListaElemento(l: ListaElemento): Promise<void> {
  const ids = l.indicadores.map(i => i.dpl_listacotejoindicadorid)
  if (ids.length) await supabase.from('dpl_comentario').delete().in('dpl_entidadid', ids)
  if (!l.listaId) return
  const { error } = await supabase.from('dpl_listacotejo').delete().eq('dpl_listacotejoid', l.listaId)
  fail(error, 'No se pudo quitar la lista de cotejo.')
}

export async function getIndicadoresDeElemento(sesionId: string): Promise<IndicadorRow[]> {
  const { data: lista, error } = await supabase.from('dpl_listacotejo').select('dpl_listacotejoid').eq('dpl_sesionid', sesionId).maybeSingle()
  fail(error, 'No se pudo cargar la lista de cotejo.')
  if (!lista) return []
  const { data, error: e2 } = await supabase
    .from('dpl_listacotejoindicador')
    .select('*')
    .eq('dpl_listacotejoid', lista.dpl_listacotejoid)
    .order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudieron cargar los indicadores.')
  return (data ?? []) as IndicadorRow[]
}

/** Delete one indicator and renumber the rest 1..n. */
export async function eliminarIndicador(ind: IndicadorRow): Promise<void> {
  await supabase.from('dpl_comentario').delete().eq('dpl_entidadid', ind.dpl_listacotejoindicadorid)
  const { error } = await supabase.from('dpl_listacotejoindicador').delete().eq('dpl_listacotejoindicadorid', ind.dpl_listacotejoindicadorid)
  fail(error, 'No se pudo eliminar el indicador.')
  const { data: restantes, error: e2 } = await supabase
    .from('dpl_listacotejoindicador')
    .select('dpl_listacotejoindicadorid')
    .eq('dpl_listacotejoid', ind.dpl_listacotejoid)
    .order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudo reordenar los indicadores.')
  await Promise.all(
    (restantes ?? []).map((r, i) =>
      supabase.from('dpl_listacotejoindicador').update({ dpl_orden: i + 1 }).eq('dpl_listacotejoindicadorid', r.dpl_listacotejoindicadorid),
    ),
  )
}

/**
 * Save the whole checklist edited at once: removes the indicators taken out,
 * updates the ones kept, inserts the new ones, numbered 1..n in screen order.
 */
export async function guardarListaCompleta(
  ctx: CursoContexto,
  elemento: Elemento,
  filas: Array<{ id: string | null; campos: IndicadorCampos }>,
  eliminados: string[],
  usuario: string,
): Promise<string[]> {
  if (eliminados.length) {
    await supabase.from('dpl_comentario').delete().in('dpl_entidadid', eliminados)
    const { error } = await supabase.from('dpl_listacotejoindicador').delete().in('dpl_listacotejoindicadorid', eliminados)
    fail(error, 'No se pudieron quitar los indicadores.')
  }
  const listaId = await asegurarLista(ctx, elemento, usuario)
  const ahora = new Date().toISOString()
  const ids: string[] = []
  for (const [i, f] of filas.entries()) {
    if (f.id) {
      const { error } = await supabase
        .from('dpl_listacotejoindicador')
        .update({ ...f.campos, dpl_orden: i + 1, modifiedon: ahora })
        .eq('dpl_listacotejoindicadorid', f.id)
      fail(error, `No se pudo guardar el indicador N°${i + 1}.`)
      ids.push(f.id)
    } else {
      const { data, error } = await supabase
        .from('dpl_listacotejoindicador')
        .insert({ ...f.campos, dpl_listacotejoid: listaId, dpl_orden: i + 1 })
        .select('dpl_listacotejoindicadorid')
        .single()
      fail(error, `No se pudo crear el indicador N°${i + 1}.`)
      ids.push(data!.dpl_listacotejoindicadorid as string)
    }
  }
  return ids
}
