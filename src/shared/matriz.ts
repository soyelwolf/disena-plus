// Matriz de formulación de preguntas: one header per element (dpl_matriz) and its questions
// (dpl_matrizpregunta, 1 to 10). Same flow as Lista de cotejo / Escala. Two kinds, from the
// instrument of the consigna:
//  · con rúbrica: each question also has its Criterio (the rubric evaluates it); always 1 item.
//  · sin rúbrica: the Taxonomía limits the Tipos de ítem (TAXONOMIA_MATRIZ_SN_RUBRICA) and each
//    question can ask for 1 to 10 items.
// Puntaje estándar esperado = puntaje por ítem × cantidad de ítems; they add up to 20.

import { supabase } from './supabaseClient'
import { INSTRUMENTO_VALORES, PUNTAJE_OBJETIVO, type CursoContexto, type Elemento } from './academico'

export const REGLAS_MATRIZ = { maxPreguntas: 10, maxItems: 10, ejeMax: 300, indicadorMax: 500, criterioMax: 250 }

/** Bloom levels in their order (TAXONOMIA_MATRIZ_SN_RUBRICA → Taxonomía_Bloom). */
export const NIVELES_TAXONOMIA = ['Recordar', 'Comprender', 'Aplicar', 'Analizar', 'Evaluar', 'Crear']

export interface TaxonomiaItem {
  taxonomia: string
  tipo: string
  plataforma: string
  orden: number
}

export interface PreguntaRow {
  dpl_matrizpreguntaid: string
  dpl_matrizid: string
  dpl_orden: number | null
  dpl_nombreunidad: string | null
  dpl_ejetematico: string | null
  dpl_taxonomia: string | null
  dpl_tipoitem: string | null
  dpl_plataforma: string | null
  dpl_cantidaditems: number | null
  dpl_criterio: string | null
  dpl_indicador: string | null
  /** Puntaje por ítem (PUNTAJE_n_IA). */
  dpl_puntajeia: number | null
  /** Puntaje estándar esperado (P_estandar_n) = por ítem × cantidad. */
  dpl_puntajeestandar: number | null
}

export type PreguntaCampos = Omit<PreguntaRow, 'dpl_matrizpreguntaid' | 'dpl_matrizid' | 'dpl_orden'>

export interface MatrizElemento {
  elemento: Elemento
  matrizId: string | null
  conRubrica: boolean
  preguntas: PreguntaRow[]
}

export interface MatricesCurso {
  elementos: MatrizElemento[]
  sobrantes: MatrizElemento[]
  faltantes: Elemento[]
}

function fail(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

const instrumento = (e: Elemento) => (e.consigna?.dpl_instrumento ?? '').toLowerCase()
export const usaMatriz = (e: Elemento) => instrumento(e) === INSTRUMENTO_VALORES.matrizCon || instrumento(e) === INSTRUMENTO_VALORES.matrizSin
export const esMatrizConRubrica = (e: Elemento) => instrumento(e) === INSTRUMENTO_VALORES.matrizCon

let cacheTaxonomia: Promise<TaxonomiaItem[]> | null = null
/** TAXONOMIA_MATRIZ_SN_RUBRICA: which item types each Bloom level allows, and their name in the platform. */
export function getTaxonomia(): Promise<TaxonomiaItem[]> {
  cacheTaxonomia ??= (async () => {
    const { data, error } = await supabase.from('dpl_taxonomiaitem').select('dpl_taxonomia, dpl_tipoitem, dpl_nombreplataforma, dpl_orden').limit(1000)
    fail(error, 'No se pudo cargar la taxonomía.')
    return (data ?? []).map(t => ({ taxonomia: t.dpl_taxonomia, tipo: t.dpl_tipoitem, plataforma: t.dpl_nombreplataforma ?? '', orden: Number(t.dpl_orden ?? 0) }))
  })().catch(err => {
    cacheTaxonomia = null
    throw err
  })
  return cacheTaxonomia
}

/** Item types in their catalogue order; for a matrix without rubric, only those its level allows. */
export function tiposDeItem(taxonomia: TaxonomiaItem[], nivel: string | null, conRubrica: boolean): Array<{ tipo: string; plataforma: string }> {
  const filas = conRubrica || !nivel ? taxonomia : taxonomia.filter(t => t.taxonomia === nivel)
  const vistos = new Map<string, { tipo: string; plataforma: string; orden: number }>()
  for (const t of filas) if (!vistos.has(t.tipo)) vistos.set(t.tipo, { tipo: t.tipo, plataforma: t.plataforma, orden: t.orden })
  return [...vistos.values()].sort((a, b) => a.orden - b.orden).map(({ tipo, plataforma }) => ({ tipo, plataforma }))
}

/** "Seleccionar una alternativa" for "Opción múltiple", etc. */
export const plataformaDe = (taxonomia: TaxonomiaItem[], tipo: string | null) => taxonomia.find(t => t.tipo === tipo)?.plataforma ?? ''

const redondear = (n: number) => Math.round(n * 100) / 100
const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
const num = (v: unknown) => (vacio(v) ? null : Number(String(v).replace(',', '.')))
const fmt = (n: number) => String(n).replace('.', ',')

type FilaLike = Partial<Record<keyof PreguntaCampos, unknown>>

/** Puntaje estándar of a question: por ítem × cantidad (the stored one only when there is no por ítem). */
export function estandarDe(p: FilaLike): number {
  const porItem = num(p.dpl_puntajeia)
  const cantidad = num(p.dpl_cantidaditems) ?? 1
  if (porItem !== null && Number.isFinite(porItem)) return redondear(porItem * cantidad)
  const guardado = num(p.dpl_puntajeestandar)
  return guardado !== null && Number.isFinite(guardado) ? guardado : 0
}

export const totalMatriz = (preguntas: FilaLike[]) => redondear(preguntas.reduce<number>((s, p) => s + estandarDe(p), 0))

/** Matrix rules shown as warnings while working (required to finalize). */
export function advertenciasMatriz(preguntas: FilaLike[], conRubrica: boolean, taxonomia: TaxonomiaItem[]): string[] {
  const { maxPreguntas, maxItems, ejeMax, indicadorMax, criterioMax } = REGLAS_MATRIZ
  const avisos: string[] = []
  if (!preguntas.length) return avisos
  if (preguntas.length > maxPreguntas) avisos.push(`Tiene ${preguntas.length} preguntas: el máximo es ${maxPreguntas}.`)
  const total = totalMatriz(preguntas)
  const falta = redondear(PUNTAJE_OBJETIVO - total)
  if (falta > 0) avisos.push(`El puntaje estándar suma ${fmt(total)} pt: ${falta === 1 ? 'falta' : 'faltan'} ${fmt(falta)} para llegar a ${PUNTAJE_OBJETIVO}.`)
  else if (falta < 0) avisos.push(`El puntaje estándar suma ${fmt(total)} pt: te pasaste por ${fmt(-falta)} (debe ser ${PUNTAJE_OBJETIVO}).`)
  preguntas.forEach((p, k) => {
    const n = `Indicador N°${k + 1}`
    const campos: Array<[keyof PreguntaCampos, string]> = [
      ['dpl_nombreunidad', 'Unidad'],
      ['dpl_ejetematico', 'Eje temático'],
      ['dpl_taxonomia', 'Taxonomía'],
      ['dpl_tipoitem', 'Tipo de ítem'],
      ...(conRubrica ? ([['dpl_criterio', 'Criterio']] as Array<[keyof PreguntaCampos, string]>) : []),
      ['dpl_indicador', 'Indicador'],
      ['dpl_puntajeia', 'Puntaje por ítem'],
    ]
    if (campos.every(([c]) => vacio(p[c]))) {
      avisos.push(`${n}: está vacía; complétala o elimínala.`)
      return
    }
    const faltan = campos.filter(([c]) => vacio(p[c])).map(([, l]) => l)
    if (faltan.length) avisos.push(`${n}: falta completar ${faltan.join(', ')}.`)
    const puntaje = num(p.dpl_puntajeia)
    if (!vacio(p.dpl_puntajeia) && !(Number.isFinite(puntaje) && (puntaje as number) > 0)) avisos.push(`${n}: el puntaje por ítem debe ser un número mayor que 0.`)
    const cantidad = num(p.dpl_cantidaditems) ?? 1
    if (!conRubrica && (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > maxItems)) avisos.push(`${n}: la cantidad de ítems debe ser de 1 a ${maxItems}.`)
    // Without rubric the level decides which item types are valid.
    if (!conRubrica && !vacio(p.dpl_taxonomia) && !vacio(p.dpl_tipoitem) && taxonomia.length && !tiposDeItem(taxonomia, String(p.dpl_taxonomia), false).some(t => t.tipo === p.dpl_tipoitem))
      avisos.push(`${n}: «${p.dpl_tipoitem}» no corresponde al nivel «${p.dpl_taxonomia}».`)
    const largos = [
      String(p.dpl_ejetematico ?? '').length > ejeMax && 'Eje temático',
      String(p.dpl_indicador ?? '').length > indicadorMax && 'Indicador',
      conRubrica && String(p.dpl_criterio ?? '').length > criterioMax && 'Criterio',
    ].filter(Boolean)
    if (largos.length) avisos.push(`${n}: excede el límite de caracteres en ${largos.join(', ')}.`)
  })
  return avisos
}

export type ProblemaMatriz = 'sin_preguntas' | 'reglas'
export function problemaMatriz(m: MatrizElemento, taxonomia: TaxonomiaItem[]): ProblemaMatriz | null {
  if (!m.preguntas.length) return 'sin_preguntas'
  return advertenciasMatriz(m.preguntas, m.conRubrica, taxonomia).length ? 'reglas' : null
}

export async function getMatricesCurso(ctx: CursoContexto): Promise<MatricesCurso> {
  const sesionIds = ctx.elementos.map(e => e.sesionId)
  const { data: matrices, error } = sesionIds.length
    ? await supabase.from('dpl_matriz').select('dpl_matrizid, dpl_sesionid').in('dpl_sesionid', sesionIds)
    : { data: [], error: null }
  fail(error, 'No se pudieron cargar las matrices.')
  const porSesion = new Map((matrices ?? []).map(m => [m.dpl_sesionid as string, m.dpl_matrizid as string]))
  const ids = [...porSesion.values()]
  let preguntas: PreguntaRow[] = []
  if (ids.length) {
    const { data, error: e2 } = await supabase.from('dpl_matrizpregunta').select('*').in('dpl_matrizid', ids).order('dpl_orden', { ascending: true })
    fail(e2, 'No se pudieron cargar las preguntas.')
    preguntas = (data ?? []) as PreguntaRow[]
  }
  const conMatriz: MatrizElemento[] = ctx.elementos
    .filter(e => porSesion.has(e.sesionId))
    .map(e => {
      const matrizId = porSesion.get(e.sesionId) ?? null
      return { elemento: e, matrizId, conRubrica: esMatrizConRubrica(e), preguntas: preguntas.filter(p => p.dpl_matrizid === matrizId) }
    })
  const elementos = conMatriz.filter(m => !m.elemento.consigna?.dpl_instrumento || usaMatriz(m.elemento))
  const sobrantes = conMatriz.filter(m => !elementos.includes(m))
  const faltantes = ctx.elementos.filter(e => usaMatriz(e) && !porSesion.has(e.sesionId))
  return { elementos, sobrantes, faltantes }
}

async function asegurarMatriz(elemento: Elemento, usuario: string): Promise<string> {
  const { data: existente } = await supabase.from('dpl_matriz').select('dpl_matrizid').eq('dpl_sesionid', elemento.sesionId).maybeSingle()
  if (existente) return existente.dpl_matrizid as string
  const { data, error } = await supabase
    .from('dpl_matriz')
    .insert({ dpl_sesionid: elemento.sesionId, dpl_nombre: `Matriz — ${elemento.nombre}`, dpl_activado: true, dpl_usuarioregistro: usuario, dpl_fecharegistro: new Date().toISOString() })
    .select('dpl_matrizid')
    .single()
  fail(error, 'No se pudo crear la matriz.')
  return data!.dpl_matrizid as string
}

export async function agregarAMatrices(elementos: Elemento[], usuario: string): Promise<void> {
  for (const e of elementos) await asegurarMatriz(e, usuario)
}

export async function quitarMatrizElemento(m: MatrizElemento): Promise<void> {
  const ids = m.preguntas.map(p => p.dpl_matrizpreguntaid)
  if (ids.length) await supabase.from('dpl_comentario').delete().in('dpl_entidadid', ids)
  if (!m.matrizId) return
  const { error } = await supabase.from('dpl_matriz').delete().eq('dpl_matrizid', m.matrizId)
  fail(error, 'No se pudo quitar la matriz.')
}

export async function getPreguntasDeElemento(sesionId: string): Promise<PreguntaRow[]> {
  const { data: m, error } = await supabase.from('dpl_matriz').select('dpl_matrizid').eq('dpl_sesionid', sesionId).maybeSingle()
  fail(error, 'No se pudo cargar la matriz.')
  if (!m) return []
  const { data, error: e2 } = await supabase.from('dpl_matrizpregunta').select('*').eq('dpl_matrizid', m.dpl_matrizid).order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudieron cargar las preguntas.')
  return (data ?? []) as PreguntaRow[]
}

export async function eliminarPregunta(p: PreguntaRow): Promise<void> {
  await supabase.from('dpl_comentario').delete().eq('dpl_entidadid', p.dpl_matrizpreguntaid)
  const { error } = await supabase.from('dpl_matrizpregunta').delete().eq('dpl_matrizpreguntaid', p.dpl_matrizpreguntaid)
  fail(error, 'No se pudo eliminar la pregunta.')
  const { data: restantes, error: e2 } = await supabase.from('dpl_matrizpregunta').select('dpl_matrizpreguntaid').eq('dpl_matrizid', p.dpl_matrizid).order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudo reordenar las preguntas.')
  await Promise.all((restantes ?? []).map((r, i) => supabase.from('dpl_matrizpregunta').update({ dpl_orden: i + 1 }).eq('dpl_matrizpreguntaid', r.dpl_matrizpreguntaid)))
}

/** Save the whole matrix (numbered 1..n in screen order); the standard score is always por ítem × cantidad. */
export async function guardarMatrizCompleta(
  elemento: Elemento,
  filas: Array<{ id: string | null; campos: PreguntaCampos }>,
  eliminados: string[],
  usuario: string,
): Promise<string[]> {
  if (eliminados.length) {
    await supabase.from('dpl_comentario').delete().in('dpl_entidadid', eliminados)
    const { error } = await supabase.from('dpl_matrizpregunta').delete().in('dpl_matrizpreguntaid', eliminados)
    fail(error, 'No se pudieron quitar las preguntas.')
  }
  const matrizId = await asegurarMatriz(elemento, usuario)
  const ahora = new Date().toISOString()
  const ids: string[] = []
  for (const [i, f] of filas.entries()) {
    const porItem = f.campos.dpl_puntajeia
    // With rubric each question is one item.
    const cantidad = esMatrizConRubrica(elemento) ? 1 : f.campos.dpl_cantidaditems ?? 1
    const row = { ...f.campos, dpl_cantidaditems: cantidad, dpl_puntajeestandar: porItem === null ? null : redondear(porItem * cantidad), dpl_orden: i + 1 }
    if (f.id) {
      const { error } = await supabase.from('dpl_matrizpregunta').update({ ...row, modifiedon: ahora }).eq('dpl_matrizpreguntaid', f.id)
      fail(error, `No se pudo guardar la pregunta N°${i + 1}.`)
      ids.push(f.id)
    } else {
      const { data, error } = await supabase.from('dpl_matrizpregunta').insert({ ...row, dpl_matrizid: matrizId }).select('dpl_matrizpreguntaid').single()
      fail(error, `No se pudo crear la pregunta N°${i + 1}.`)
      ids.push(data!.dpl_matrizpreguntaid as string)
    }
  }
  return ids
}
