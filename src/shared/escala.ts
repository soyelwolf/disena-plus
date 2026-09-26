// Escala de valoración: one header per element (dpl_escalavaloracion) and its
// indicators (dpl_escalaindicador). Same flow as Lista de cotejo. Two kinds:
//  · administración (DDA courses of administración, contabilidad y economía):
//    fixed levels Excelente / Bueno / Regular / Con varios errores / No presenta.
//  · normal: the teacher picks Cualitativa, Cuantitativa or Mixta, which only
//    changes the level names (3 scored levels + a last one worth 0).
// Scores are stored by level position (supabase/schema-escala.sql).

import { supabase } from './supabaseClient'
import { INSTRUMENTO_VALORES, PUNTAJE_OBJETIVO, idConsigna, type CursoContexto, type Elemento } from './academico'

export type TipoEscala = 'Cualitativa' | 'Cuantitativa' | 'Mixta'
export const TIPOS_ESCALA: TipoEscala[] = ['Cualitativa', 'Cuantitativa', 'Mixta']

export type CampoNivel = 'dpl_puntajeconsolidado' | 'dpl_puntajeendesarrollo' | 'dpl_puntajeeninicio' | 'dpl_puntajeconerrores'
export const CAMPO_CERO = 'dpl_puntajenoevidenciado'

export interface NivelEscala {
  campo: CampoNivel
  label: string
  /** Sum of the level over all indicators must be exactly this (level 1: 20 pt). */
  objetivo?: number
  /** Or stay within these bounds. */
  min?: number
  max?: number
}

/**
 * UTP rules. Level 1 adds up to 20; the rest have a ceiling or floor on their
 * sum. In every indicator the scores go down level by level without repeating,
 * and the last level is always 0.
 */
export const REGLAS_ESCALA = {
  maxIndicadores: 10,
  indicadorMax: 250,
  observacionesMax: 500,
  admin: { bueno: { max: 17 }, regular: { max: 14 }, errores: { max: 10 } },
  normal: { nivel2: { min: 12 }, nivel3: { max: 11 } as { min?: number; max?: number } },
}

const NOMBRES: Record<TipoEscala | 'ninguno', [string, string, string, string]> = {
  Cualitativa: ['Consolidado', 'En desarrollo', 'En inicio', 'No evidenciado'],
  Cuantitativa: ['Siempre', 'Casi siempre', 'Algunas veces', 'Nunca'],
  Mixta: ['Siempre / Consolidado', 'Casi siempre / En desarrollo', 'Algunas veces / En inicio', 'Nunca / No evidenciado'],
  ninguno: ['Por defecto', 'Por defecto', 'Por defecto', 'Por defecto'],
}

/** Scored levels of a scale plus the name of the last one (always 0). */
export function nivelesEscala(admin: boolean, tipo: TipoEscala | null): { niveles: NivelEscala[]; cero: string } {
  if (admin) {
    const { bueno, regular, errores } = REGLAS_ESCALA.admin
    return {
      niveles: [
        { campo: 'dpl_puntajeconsolidado', label: 'Excelente', objetivo: PUNTAJE_OBJETIVO },
        { campo: 'dpl_puntajeendesarrollo', label: 'Bueno', ...bueno },
        { campo: 'dpl_puntajeeninicio', label: 'Regular', ...regular },
        { campo: 'dpl_puntajeconerrores', label: 'Con varios errores', ...errores },
      ],
      cero: 'No presenta',
    }
  }
  const n = NOMBRES[tipo ?? 'ninguno']
  const { nivel2, nivel3 } = REGLAS_ESCALA.normal
  return {
    niveles: [
      { campo: 'dpl_puntajeconsolidado', label: n[0], objetivo: PUNTAJE_OBJETIVO },
      { campo: 'dpl_puntajeendesarrollo', label: n[1], ...nivel2 },
      { campo: 'dpl_puntajeeninicio', label: n[2], ...nivel3 },
    ],
    cero: n[3],
  }
}

export interface IndicadorEscalaRow {
  dpl_escalaindicadorid: string
  dpl_escalavaloracionid: string
  dpl_orden: number | null
  dpl_indicador: string | null
  dpl_puntajeconsolidado: number | null
  dpl_puntajeendesarrollo: number | null
  dpl_puntajeeninicio: number | null
  dpl_puntajeconerrores: number | null
  dpl_observaciones: string | null
}

export type IndicadorEscalaCampos = Omit<IndicadorEscalaRow, 'dpl_escalaindicadorid' | 'dpl_escalavaloracionid' | 'dpl_orden'>

export interface EscalaElemento {
  elemento: Elemento
  escalaId: string | null
  /** Administración scale (fixed levels); otherwise the teacher picks the type. */
  admin: boolean
  tipo: TipoEscala | null
  indicadores: IndicadorEscalaRow[]
}

export interface EscalasCurso {
  elementos: EscalaElemento[]
  sobrantes: EscalaElemento[]
  faltantes: Elemento[]
}

function fail(error: { message: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

export function usaEscala(e: Elemento): boolean {
  const v = (e.consigna?.dpl_instrumento ?? '').toLowerCase()
  return v === INSTRUMENTO_VALORES.escala || v === INSTRUMENTO_VALORES.escalaAdmin
}
export const esEscalaAdmin = (e: Elemento) => (e.consigna?.dpl_instrumento ?? '').toLowerCase() === INSTRUMENTO_VALORES.escalaAdmin

const aTipo = (v: unknown): TipoEscala | null => TIPOS_ESCALA.find(t => t.toLowerCase() === String(v ?? '').trim().toLowerCase()) ?? null

/** Rows imported before schema-escala.sql keep levels 1-3 in the old columns (excelente, bueno, regular). */
function normalizar(r: Record<string, unknown>): IndicadorEscalaRow {
  const n = (a: unknown, b: unknown) => (a === null || a === undefined ? ((b as number | null | undefined) ?? null) : (a as number))
  return {
    dpl_escalaindicadorid: r.dpl_escalaindicadorid as string,
    dpl_escalavaloracionid: r.dpl_escalavaloracionid as string,
    dpl_orden: (r.dpl_orden as number | null) ?? null,
    dpl_indicador: (r.dpl_indicador as string | null) ?? null,
    dpl_puntajeconsolidado: n(r.dpl_puntajeconsolidado, r.dpl_puntajeexcelente),
    dpl_puntajeendesarrollo: n(r.dpl_puntajeendesarrollo, r.dpl_puntajebueno),
    dpl_puntajeeninicio: n(r.dpl_puntajeeninicio, r.dpl_puntajeregular),
    dpl_puntajeconerrores: (r.dpl_puntajeconerrores as number | null) ?? null,
    dpl_observaciones: (r.dpl_observaciones as string | null) ?? null,
  }
}

export async function getEscalasCurso(ctx: CursoContexto): Promise<EscalasCurso> {
  const sesionIds = ctx.elementos.map(e => e.sesionId)
  const { data: escalas, error } = sesionIds.length
    ? await supabase.from('dpl_escalavaloracion').select('*').in('dpl_sesionid', sesionIds)
    : { data: [], error: null }
  fail(error, 'No se pudieron cargar las escalas de valoración.')
  const porSesion = new Map((escalas ?? []).map(x => [x.dpl_sesionid as string, x as Record<string, unknown>]))
  const ids = (escalas ?? []).map(x => x.dpl_escalavaloracionid as string)
  let indicadores: IndicadorEscalaRow[] = []
  if (ids.length) {
    const { data, error: e2 } = await supabase.from('dpl_escalaindicador').select('*').in('dpl_escalavaloracionid', ids).order('dpl_orden', { ascending: true })
    fail(e2, 'No se pudieron cargar los indicadores.')
    indicadores = (data ?? []).map(normalizar)
  }
  const conEscala: EscalaElemento[] = ctx.elementos
    .filter(e => porSesion.has(e.sesionId))
    .map(e => {
      const cab = porSesion.get(e.sesionId)!
      const escalaId = cab.dpl_escalavaloracionid as string
      return { elemento: e, escalaId, admin: esEscalaAdmin(e), tipo: aTipo(cab.dpl_tipoescala), indicadores: indicadores.filter(i => i.dpl_escalavaloracionid === escalaId) }
    })
  const elementos = conEscala.filter(x => !x.elemento.consigna?.dpl_instrumento || usaEscala(x.elemento))
  const sobrantes = conEscala.filter(x => !elementos.includes(x))
  const faltantes = ctx.elementos.filter(e => usaEscala(e) && !porSesion.has(e.sesionId))
  return { elementos, sobrantes, faltantes }
}

const redondear = (n: number) => Math.round(n * 100) / 100
const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
const num = (v: unknown) => (vacio(v) ? null : Number(String(v).replace(',', '.')))
const fmt = (n: number) => String(n).replace('.', ',')

type FilaLike = Partial<Record<keyof IndicadorEscalaCampos, unknown>>

/** Sum of one level over all indicators. */
export function sumaNivel(indicadores: FilaLike[], campo: CampoNivel): number {
  return redondear(indicadores.reduce<number>((s, i) => s + (Number.isFinite(num(i[campo])) ? (num(i[campo]) as number) : 0), 0))
}

/** One chip per level, like the Power Apps box: "✅ Excelente: 20 | ⚠ Bueno: 17,5 (máximo 17)". */
export function resumenNiveles(indicadores: FilaLike[], niveles: NivelEscala[]): Array<{ campo: CampoNivel; label: string; suma: number; ok: boolean; nota: string }> {
  return niveles.map(n => {
    const suma = sumaNivel(indicadores, n.campo)
    let nota = ''
    if (n.objetivo !== undefined && suma !== n.objetivo) {
      const d = redondear(n.objetivo - suma)
      nota = d > 0 ? `falta ${fmt(d)}` : `sobra ${fmt(-d)}`
    } else if (n.max !== undefined && suma > n.max) nota = `máximo ${fmt(n.max)}`
    else if (n.min !== undefined && suma < n.min) nota = `mínimo ${fmt(n.min)}`
    return { campo: n.campo, label: n.label, suma, ok: !nota, nota }
  })
}

/**
 * Scale rules shown as warnings while working (saving is never blocked;
 * "Finalizar edición general" requires all of them).
 */
export function advertenciasEscala(indicadores: FilaLike[], admin: boolean, tipo: TipoEscala | null): string[] {
  const { niveles, cero } = nivelesEscala(admin, tipo)
  const { maxIndicadores, indicadorMax, observacionesMax } = REGLAS_ESCALA
  const avisos: string[] = []
  if (!admin && !tipo) avisos.push('Elige el tipo de escala: cualitativa, cuantitativa o mixta.')
  if (!indicadores.length) return avisos
  if (indicadores.length > maxIndicadores) avisos.push(`Tiene ${indicadores.length} indicadores: el máximo es ${maxIndicadores}.`)
  for (const r of resumenNiveles(indicadores, niveles)) if (!r.ok) avisos.push(`${r.label} suma ${fmt(r.suma)} pt (${r.nota}).`)
  indicadores.forEach((i, k) => {
    const n = `Indicador N°${k + 1}`
    if (vacio(i.dpl_indicador) && vacio(i.dpl_observaciones) && niveles.every(l => vacio(i[l.campo]))) {
      avisos.push(`${n}: está vacío; complétalo o elimínalo.`)
      return
    }
    const faltan = [vacio(i.dpl_indicador) && 'Indicador', ...niveles.filter(l => vacio(i[l.campo])).map(l => l.label)].filter(Boolean)
    if (faltan.length) avisos.push(`${n}: falta completar ${faltan.join(', ')}.`)
    const invalidos = niveles.filter(l => !vacio(i[l.campo]) && !Number.isFinite(num(i[l.campo])))
    if (invalidos.length) avisos.push(`${n}: el puntaje de ${invalidos.map(l => l.label).join(', ')} debe ser un número.`)
    if (String(i.dpl_indicador ?? '').length > indicadorMax) avisos.push(`${n}: el indicador excede ${indicadorMax} caracteres.`)
    if (String(i.dpl_observaciones ?? '').length > observacionesMax) avisos.push(`${n}: las observaciones exceden ${observacionesMax} caracteres.`)
    if (faltan.length || invalidos.length) return
    const p = niveles.map(l => num(i[l.campo]) as number)
    niveles.forEach((l, j) => {
      if (j > 0 && p[j] === p[j - 1]) avisos.push(`${n}: ${niveles[j - 1].label} = ${l.label} (deben ser distintos).`)
      else if (j > 0 && p[j] > p[j - 1]) avisos.push(`${n}: ${l.label} debe ser menor que ${niveles[j - 1].label}.`)
    })
    if (p[p.length - 1] <= 0) avisos.push(`${n}: ${niveles[niveles.length - 1].label} debe ser mayor que 0 (${cero} vale 0).`)
  })
  return avisos
}

export type ProblemaEscala = 'sin_indicadores' | 'reglas'

export function problemaEscala(e: EscalaElemento): ProblemaEscala | null {
  if (e.indicadores.length === 0) return 'sin_indicadores'
  if (advertenciasEscala(e.indicadores, e.admin, e.tipo).length) return 'reglas'
  return null
}

async function asegurarEscala(ctx: CursoContexto, elemento: Elemento, usuario: string): Promise<string> {
  const { data: existente } = await supabase.from('dpl_escalavaloracion').select('dpl_escalavaloracionid').eq('dpl_sesionid', elemento.sesionId).maybeSingle()
  if (existente) return existente.dpl_escalavaloracionid as string
  const { data, error } = await supabase
    .from('dpl_escalavaloracion')
    .insert({
      dpl_sesionid: elemento.sesionId,
      dpl_nombre: `Escala de valoración — ${elemento.nombre}`,
      dpl_idescalatext: idConsigna(ctx.idCursoText, elemento),
      dpl_activado: true,
      dpl_usuarioregistro: usuario,
      dpl_fecharegistro: new Date().toISOString(),
    })
    .select('dpl_escalavaloracionid')
    .single()
  fail(error, 'No se pudo crear la escala de valoración.')
  return data!.dpl_escalavaloracionid as string
}

export async function agregarAEscalas(ctx: CursoContexto, elementos: Elemento[], usuario: string): Promise<void> {
  for (const e of elementos) await asegurarEscala(ctx, e, usuario)
}

export async function quitarEscalaElemento(e: EscalaElemento): Promise<void> {
  const ids = e.indicadores.map(i => i.dpl_escalaindicadorid)
  if (ids.length) await supabase.from('dpl_comentario').delete().in('dpl_entidadid', ids)
  if (!e.escalaId) return
  const { error } = await supabase.from('dpl_escalavaloracion').delete().eq('dpl_escalavaloracionid', e.escalaId)
  fail(error, 'No se pudo quitar la escala de valoración.')
}

/** Cualitativa / Cuantitativa / Mixta (column "Escala" of SharePoint). */
export async function guardarTipoEscala(ctx: CursoContexto, elemento: Elemento, tipo: TipoEscala | null, usuario: string): Promise<void> {
  const id = await asegurarEscala(ctx, elemento, usuario)
  const { error } = await supabase.from('dpl_escalavaloracion').update({ dpl_tipoescala: tipo, modifiedon: new Date().toISOString() }).eq('dpl_escalavaloracionid', id)
  fail(error, 'No se pudo guardar el tipo de escala.')
}

export async function getEscalaDeElemento(sesionId: string): Promise<{ tipo: TipoEscala | null; indicadores: IndicadorEscalaRow[] }> {
  const { data: cab, error } = await supabase.from('dpl_escalavaloracion').select('*').eq('dpl_sesionid', sesionId).maybeSingle()
  fail(error, 'No se pudo cargar la escala de valoración.')
  if (!cab) return { tipo: null, indicadores: [] }
  const { data, error: e2 } = await supabase.from('dpl_escalaindicador').select('*').eq('dpl_escalavaloracionid', cab.dpl_escalavaloracionid).order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudieron cargar los indicadores.')
  return { tipo: aTipo(cab.dpl_tipoescala), indicadores: (data ?? []).map(normalizar) }
}

export async function eliminarIndicadorEscala(ind: IndicadorEscalaRow): Promise<void> {
  await supabase.from('dpl_comentario').delete().eq('dpl_entidadid', ind.dpl_escalaindicadorid)
  const { error } = await supabase.from('dpl_escalaindicador').delete().eq('dpl_escalaindicadorid', ind.dpl_escalaindicadorid)
  fail(error, 'No se pudo eliminar el indicador.')
  const { data: restantes, error: e2 } = await supabase
    .from('dpl_escalaindicador')
    .select('dpl_escalaindicadorid')
    .eq('dpl_escalavaloracionid', ind.dpl_escalavaloracionid)
    .order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudo reordenar los indicadores.')
  await Promise.all((restantes ?? []).map((r, i) => supabase.from('dpl_escalaindicador').update({ dpl_orden: i + 1 }).eq('dpl_escalaindicadorid', r.dpl_escalaindicadorid)))
}

/** Save the whole scale edited at once (numbered 1..n in screen order). The last level is always 0. */
export async function guardarEscalaCompleta(
  ctx: CursoContexto,
  elemento: Elemento,
  filas: Array<{ id: string | null; campos: IndicadorEscalaCampos }>,
  eliminados: string[],
  usuario: string,
): Promise<string[]> {
  if (eliminados.length) {
    await supabase.from('dpl_comentario').delete().in('dpl_entidadid', eliminados)
    const { error } = await supabase.from('dpl_escalaindicador').delete().in('dpl_escalaindicadorid', eliminados)
    fail(error, 'No se pudieron quitar los indicadores.')
  }
  const escalaId = await asegurarEscala(ctx, elemento, usuario)
  const ahora = new Date().toISOString()
  const ids: string[] = []
  for (const [i, f] of filas.entries()) {
    const row = { ...f.campos, [CAMPO_CERO]: 0, dpl_orden: i + 1 }
    if (f.id) {
      const { error } = await supabase.from('dpl_escalaindicador').update({ ...row, modifiedon: ahora }).eq('dpl_escalaindicadorid', f.id)
      if (error && /dpl_puntaje(consolidado|endesarrollo|eninicio)/.test(error.message)) throw new Error('Falta ejecutar supabase/schema-escala.sql en Supabase.')
      fail(error, `No se pudo guardar el indicador N°${i + 1}.`)
      ids.push(f.id)
    } else {
      const { data, error } = await supabase.from('dpl_escalaindicador').insert({ ...row, dpl_escalavaloracionid: escalaId }).select('dpl_escalaindicadorid').single()
      if (error && /dpl_puntaje(consolidado|endesarrollo|eninicio)/.test(error.message)) throw new Error('Falta ejecutar supabase/schema-escala.sql en Supabase.')
      fail(error, `No se pudo crear el indicador N°${i + 1}.`)
      ids.push(data!.dpl_escalaindicadorid as string)
    }
  }
  return ids
}
