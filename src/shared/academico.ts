// src/shared/academico.ts
// Data access for the "Diseño de contenido académico" process: the course
// context (programmes, units, elements, consignas), rubrics with their criteria
// and per-programme competencias, and the edit → approval workflow.
//
// Queries go straight to Supabase with plain `dpl_` rows — these screens need
// cross-table views (a whole course at once) that the older one-table services
// were not built for.

import { supabase } from './supabaseClient'
import { estaVacio, longitud } from './textoRico'
import { EQUIPO_DOCENTE, PARTE, REVISORES, TODOS, notificar, rutaDe } from './notificaciones'

// ── Limits & instrument catalogue ────────────────────────────────────────────

/** Max characters per field. One place to change them. */
export const LIMITES = {
  indicacionGeneral: 2000,
  indicacionesEspecificas: 10000,
  recomendaciones: 2000,
  anexo: 15000,
  criterioNombre: 150,
  criterioTexto: 1000,
} as const

/** Rubric rule: in every element, the "Estándar esperado" scores must add up to this. */
export const PUNTAJE_OBJETIVO = 20

export type InstrumentoTipo = 'rubrica' | 'matriz' | 'lista' | 'escala'

/** Stored values (kept identical to the SharePoint data) → instrument family. */
export const INSTRUMENTO_VALORES = {
  rubrica: 'rúbrica',
  matrizCon: 'matriz con rúbrica',
  matrizSin: 'matriz sin rúbrica',
  lista: 'lista de cotejo',
  escala: 'escala de valoración',
  escalaAdmin: 'escala de valoración (administración)',
  noAplica: 'no aplica',
} as const

export function tipoInstrumento(valor: string | null | undefined): InstrumentoTipo | null {
  const v = (valor ?? '').toLowerCase()
  if (!v) return null
  if (v.startsWith('rúbrica') || v.startsWith('rubrica')) return 'rubrica'
  if (v.startsWith('matriz')) return 'matriz'
  if (v.startsWith('lista')) return 'lista'
  if (v.startsWith('escala')) return 'escala'
  return null
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** "PRÁCTICA CALIFICADA 1" → "Práctica calificada 1" (source data is all caps). */
export function capitalizar(s: string | null | undefined): string {
  if (!s) return ''
  return (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).replace(
    /\b(i{1,3}|iv|vi{0,3}|ix|x)\b/g,
    m => m.toUpperCase(),
  )
}

function fail(error: { message: string; code?: string } | null, fallback: string): void {
  if (error) throw new Error(error.message || fallback)
}

/** PostgREST "relation does not exist" — the flow tables haven't been created yet. */
function isMissingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === 'PGRST205' || error.code === '42P01' || /does not exist|schema cache/i.test(error.message ?? '')
}

// ── Course context ───────────────────────────────────────────────────────────

export interface Programa {
  id: string
  nombre: string
}

export interface ConsignaRow {
  dpl_consignaid: string
  dpl_idconsignatext: string | null
  dpl_indicaciongeneral: string | null
  dpl_indicacionesespecificas: string | null
  dpl_recomendaciones: string | null
  dpl_anexo: string | null
  dpl_instrumento: string | null
  dpl_sesionid: string
  /** QUE_SE_EVALUARA: the Formato de orientación broken down for this element (reference, read only). */
  dpl_queseevaluara?: string | null
}

export interface Elemento {
  sesionId: string
  nombre: string
  idSesionText: string | null
  unidadId: string
  /** ID_UNIDAD_TEXT, part of ID_CONSIGNA_TEXT. */
  idUnidadText: string | null
  unidadNombre: string
  unidadNumero: number | null
  logroUnidad: string
  consigna: ConsignaRow | null
}

export interface CursoContexto {
  id: string
  nombre: string
  codigo: string
  idCursoText: string
  tipoEnsenanza: string
  logroCurso: string
  permite: Record<InstrumentoTipo | 'consignas', boolean>
  programas: Programa[]
  elementos: Elemento[]
}

export async function getCursoContexto(cursoId: string): Promise<CursoContexto> {
  const { data: curso, error: e1 } = await supabase
    .from('dpl_curso')
    .select('*')
    .eq('dpl_cursoid', cursoId)
    .maybeSingle()
  fail(e1, 'No se pudo cargar el curso.')
  if (!curso) throw new Error('El curso no existe.')

  const [{ data: cps, error: e2 }, { data: unidades, error: e3 }] = await Promise.all([
    supabase.from('dpl_cursoprograma').select('dpl_programaid, dpl_programa(dpl_nombre)').eq('dpl_cursoid', cursoId),
    supabase
      .from('dpl_unidad')
      .select('dpl_unidadid, dpl_idunidadtext, dpl_nombreunidad, dpl_numerounidad, dpl_logroespecifico')
      .eq('dpl_cursoid', cursoId)
      .order('dpl_numerounidad', { ascending: true }),
  ])
  fail(e2, 'No se pudieron cargar los programas.')
  fail(e3, 'No se pudieron cargar las unidades.')

  const unidadIds = (unidades ?? []).map(u => u.dpl_unidadid as string)
  let sesiones: Array<Record<string, unknown>> = []
  let consignas: ConsignaRow[] = []
  if (unidadIds.length) {
    const { data: ss, error: e4 } = await supabase
      .from('dpl_sesion')
      .select('dpl_sesionid, dpl_elemento, dpl_idsesiontext, dpl_unidadid')
      .in('dpl_unidadid', unidadIds)
    fail(e4, 'No se pudieron cargar los elementos.')
    // dpl_sesion holds every session of the syllabus; only the ones with an
    // assigned element (ElementoAsignado) are evaluation elements.
    sesiones = (ss ?? []).filter(s => typeof s.dpl_elemento === 'string' && s.dpl_elemento.trim() !== '')
    const sesionIds = sesiones.map(s => s.dpl_sesionid as string)
    if (sesionIds.length) {
      const { data: cs, error: e5 } = await supabase
        .from('dpl_consigna')
        .select(
          'dpl_consignaid, dpl_idconsignatext, dpl_indicaciongeneral, dpl_indicacionesespecificas, dpl_recomendaciones, dpl_anexo, dpl_instrumento, dpl_sesionid, dpl_queseevaluara',
        )
        .in('dpl_sesionid', sesionIds)
      fail(e5, 'No se pudieron cargar las consignas.')
      consignas = (cs ?? []) as ConsignaRow[]
    }
  }

  const unidadPorId = new Map((unidades ?? []).map(u => [u.dpl_unidadid as string, u]))
  const elementos: Elemento[] = sesiones
    .map(s => {
      const u = unidadPorId.get(s.dpl_unidadid as string)
      return {
        sesionId: s.dpl_sesionid as string,
        nombre: capitalizar(s.dpl_elemento as string),
        idSesionText: (s.dpl_idsesiontext as string) ?? null,
        unidadId: s.dpl_unidadid as string,
        idUnidadText: (u?.dpl_idunidadtext as string) ?? null,
        unidadNombre: capitalizar((u?.dpl_nombreunidad as string) ?? ''),
        unidadNumero: (u?.dpl_numerounidad as number) ?? null,
        logroUnidad: (u?.dpl_logroespecifico as string) ?? '',
        consigna: consignas.find(c => c.dpl_sesionid === s.dpl_sesionid) ?? null,
      }
    })
    .sort(
      (a, b) =>
        (a.unidadNumero ?? 0) - (b.unidadNumero ?? 0) ||
        (a.idSesionText ?? '').localeCompare(b.idSesionText ?? '', 'es', { numeric: true }),
    )

  const programas: Programa[] = (cps ?? [])
    .map(cp => {
      const p = cp.dpl_programa as unknown as { dpl_nombre?: string } | null
      return { id: cp.dpl_programaid as string, nombre: capitalizar(p?.dpl_nombre ?? 'Programa') }
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))

  return {
    id: cursoId,
    nombre: capitalizar(curso.dpl_nombrecurso),
    codigo: curso.dpl_codigocatalogo ?? '',
    idCursoText: curso.dpl_idcursotext ?? '',
    tipoEnsenanza: curso.dpl_tipoensenanza ?? '',
    logroCurso: curso.dpl_logrocurso ?? '',
    permite: {
      consignas: !!curso.dpl_permiteconsignas,
      rubrica: !!curso.dpl_permiterubricas,
      matriz: !!curso.dpl_permitematrizsn,
      lista: !!curso.dpl_permitelistacotejo,
      escala: !!curso.dpl_permiteescala,
    },
    programas,
    elementos,
  }
}

// ── Consignas ────────────────────────────────────────────────────────────────

/** ID_CONSIGNA_TEXT exactly as in SharePoint: <curso>-<unidad>-<sesión>, e.g. C16-U69-S313. */
export function idConsigna(idCursoText: string, e: Pick<Elemento, 'idUnidadText' | 'idSesionText'>): string | null {
  return [idCursoText, e.idUnidadText, e.idSesionText].filter(Boolean).join('-') || null
}

/** Elements whose consigna still has no instrument chosen ("no aplica" counts as chosen). */
export function sinInstrumento(ctx: CursoContexto): Elemento[] {
  return ctx.elementos.filter(e => !(e.consigna?.dpl_instrumento ?? '').trim())
}

export type ConsignaCampos = Pick<
  ConsignaRow,
  'dpl_indicaciongeneral' | 'dpl_indicacionesespecificas' | 'dpl_recomendaciones' | 'dpl_anexo' | 'dpl_instrumento'
>

export const CAMPOS_CONSIGNA: Array<{ key: keyof ConsignaCampos; label: string; max: number; opcional?: boolean }> = [
  { key: 'dpl_indicaciongeneral', label: 'Indicación general', max: LIMITES.indicacionGeneral },
  { key: 'dpl_indicacionesespecificas', label: 'Indicaciones específicas', max: LIMITES.indicacionesEspecificas },
  { key: 'dpl_recomendaciones', label: 'Recomendaciones', max: LIMITES.recomendaciones },
  { key: 'dpl_anexo', label: 'Anexo (Opcional)', max: LIMITES.anexo, opcional: true },
]

export interface ConsignaValidacion {
  completa: boolean
  errores: Partial<Record<keyof ConsignaCampos, string>>
}

export function validarConsigna(c: Partial<ConsignaCampos> | null): ConsignaValidacion {
  const errores: ConsignaValidacion['errores'] = {}
  if (!c?.dpl_instrumento) errores.dpl_instrumento = 'Elige un instrumento.'
  for (const campo of CAMPOS_CONSIGNA) {
    const v = c?.[campo.key] ?? ''
    if (estaVacio(v) && !campo.opcional) errores[campo.key] = 'Completar información'
    else if (longitud(v) > campo.max) errores[campo.key] = 'Excediste el número de caracteres'
  }
  return { completa: Object.keys(errores).length === 0, errores }
}

export async function guardarConsigna(
  elemento: Elemento,
  idCursoText: string,
  campos: Partial<ConsignaCampos>,
  usuario: string,
): Promise<ConsignaRow> {
  const payload = { ...campos, dpl_usuarioregistro: usuario, dpl_fecharegistro: new Date().toISOString() }
  if (elemento.consigna) {
    const { data, error } = await supabase
      .from('dpl_consigna')
      .update({ ...payload, modifiedon: new Date().toISOString() })
      .eq('dpl_consignaid', elemento.consigna.dpl_consignaid)
      .select()
      .single()
    fail(error, 'No se pudo guardar la consigna.')
    return data as ConsignaRow
  }
  const { data, error } = await supabase
    .from('dpl_consigna')
    .insert({
      ...payload,
      dpl_sesionid: elemento.sesionId,
      dpl_idconsignatext: idConsigna(idCursoText, elemento),
    })
    .select()
    .single()
  fail(error, 'No se pudo crear la consigna.')
  return data as ConsignaRow
}

// ── Rúbricas ─────────────────────────────────────────────────────────────────

export interface CriterioRow {
  dpl_rubricacriterioid: string
  dpl_rubricaid: string
  dpl_orden: number | null
  dpl_criterio: string | null
  dpl_definicioncriterio: string | null
  dpl_estandaresperado: string | null
  dpl_puntajeestandar: number | null
  dpl_enproceso2: string | null
  dpl_puntajeenproceso2: number | null
  dpl_enproceso1: string | null
  dpl_puntajeenproceso1: number | null
  dpl_inicial: string | null
  dpl_puntajeinicial: number | null
}

export type CriterioCampos = Omit<CriterioRow, 'dpl_rubricacriterioid' | 'dpl_rubricaid' | 'dpl_orden'>

export const NIVELES: Array<{ texto: keyof CriterioCampos; puntaje: keyof CriterioCampos; label: string }> = [
  { texto: 'dpl_estandaresperado', puntaje: 'dpl_puntajeestandar', label: 'Estándar esperado' },
  { texto: 'dpl_enproceso2', puntaje: 'dpl_puntajeenproceso2', label: 'En proceso 2' },
  { texto: 'dpl_enproceso1', puntaje: 'dpl_puntajeenproceso1', label: 'En proceso 1' },
  { texto: 'dpl_inicial', puntaje: 'dpl_puntajeinicial', label: 'Inicial' },
]

export interface CompetenciaCurso {
  competenciaId: string
  programaId: string
  nombre: string
  descripcion: string
  tipo: string
  nivel: number | null
  cursoEvidencia: boolean
  competenciaEvidencia: boolean
}

export interface SeleccionCompetencia {
  id: string
  criterioId: string
  competenciaId: string
  /** null = legacy selection (made before per-programme selection existed): applies to every programme. */
  programaId: string | null
}

export interface RubricaElemento {
  elemento: Elemento
  rubricaId: string | null
  criterios: CriterioRow[]
}

export interface RubricasCurso {
  /** Elements that have a rubric and whose consigna still uses one. */
  elementos: RubricaElemento[]
  /** Have a rubric, but the consigna changed to an instrument without rubric (can be removed). */
  sobrantes: RubricaElemento[]
  /** The consigna now uses a rubric, but the element has none yet (can be added). */
  faltantes: Elemento[]
  competencias: CompetenciaCurso[]
  selecciones: SeleccionCompetencia[]
  /** False until schema-flujo.sql adds dpl_programaid to the selection table. */
  seleccionPorPrograma: boolean
}

/** Elements with a rubric record — created when Rúbricas is activated (or migrated from SharePoint). */
export async function getRubricasCurso(ctx: CursoContexto): Promise<RubricasCurso> {
  const sesionIds = ctx.elementos.map(e => e.sesionId)
  const { data: rubricas, error: e1 } = sesionIds.length
    ? await supabase.from('dpl_rubrica').select('dpl_rubricaid, dpl_sesionid').in('dpl_sesionid', sesionIds)
    : { data: [], error: null }
  fail(e1, 'No se pudieron cargar las rúbricas.')

  const rubricaPorSesion = new Map((rubricas ?? []).map(r => [r.dpl_sesionid as string, r.dpl_rubricaid as string]))
  const rubricaIds = [...rubricaPorSesion.values()]

  let criterios: CriterioRow[] = []
  if (rubricaIds.length) {
    const { data, error } = await supabase
      .from('dpl_rubricacriterio')
      .select('*')
      .in('dpl_rubricaid', rubricaIds)
      .order('dpl_orden', { ascending: true })
    fail(error, 'No se pudieron cargar los criterios.')
    criterios = (data ?? []) as CriterioRow[]
  }

  const { data: cpc, error: e3 } = await supabase
    .from('dpl_cursoprogramacompetencia')
    .select('dpl_programaid, dpl_nivel, dpl_cursoevidencia, dpl_competenciaevidencia, dpl_competencia(dpl_competenciaid, dpl_competencia, dpl_descripcion, dpl_tipocompetencia)')
    .eq('dpl_cursoid', ctx.id)
  fail(e3, 'No se pudieron cargar las competencias.')
  const competencias: CompetenciaCurso[] = (cpc ?? []).map(r => {
    const c = r.dpl_competencia as unknown as Record<string, string>
    return {
      competenciaId: c?.dpl_competenciaid,
      programaId: r.dpl_programaid as string,
      nombre: c?.dpl_competencia ?? '',
      descripcion: c?.dpl_descripcion ?? '',
      tipo: capitalizar(c?.dpl_tipocompetencia ?? 'Específica'),
      nivel: (r.dpl_nivel as number) ?? null,
      cursoEvidencia: !!r.dpl_cursoevidencia,
      competenciaEvidencia: !!r.dpl_competenciaevidencia,
    }
  })

  let selecciones: SeleccionCompetencia[] = []
  let seleccionPorPrograma = true
  const criterioIds = criterios.map(c => c.dpl_rubricacriterioid)
  if (criterioIds.length) {
    let res: { data: Array<Record<string, unknown>> | null; error: { message: string } | null } = await supabase
      .from('dpl_rubricacriteriocompetencia')
      .select('dpl_rubricacriteriocompetenciaid, dpl_rubricacriterioid, dpl_competenciaid, dpl_programaid')
      .in('dpl_rubricacriterioid', criterioIds)
    if (res.error && /dpl_programaid/.test(res.error.message)) {
      seleccionPorPrograma = false
      res = await supabase
        .from('dpl_rubricacriteriocompetencia')
        .select('dpl_rubricacriteriocompetenciaid, dpl_rubricacriterioid, dpl_competenciaid')
        .in('dpl_rubricacriterioid', criterioIds)
    }
    fail(res.error, 'No se pudieron cargar las competencias elegidas.')
    selecciones = (res.data ?? []).map(r => ({
      id: r.dpl_rubricacriteriocompetenciaid as string,
      criterioId: r.dpl_rubricacriterioid as string,
      competenciaId: r.dpl_competenciaid as string,
      programaId: (r.dpl_programaid as string) ?? null,
    }))
  }

  const conRubrica: RubricaElemento[] = ctx.elementos
    .filter(e => rubricaPorSesion.has(e.sesionId))
    .map(e => {
      const rubricaId = rubricaPorSesion.get(e.sesionId) ?? null
      return { elemento: e, rubricaId, criterios: criterios.filter(c => c.dpl_rubricaid === rubricaId) }
    })
  // The rubric follows the instrument chosen in the consigna (an empty choice keeps it).
  const elementos = conRubrica.filter(r => !r.elemento.consigna?.dpl_instrumento || usaRubrica(r.elemento))
  const sobrantes = conRubrica.filter(r => !elementos.includes(r))
  const faltantes = ctx.elementos.filter(e => usaRubrica(e) && !rubricaPorSesion.has(e.sesionId))

  return { elementos, sobrantes, faltantes, competencias, selecciones, seleccionPorPrograma }
}

export function totalEstandar(criterios: Array<Pick<CriterioRow, 'dpl_puntajeestandar'>>): number {
  return criterios.reduce((s, c) => s + (Number(c.dpl_puntajeestandar) || 0), 0)
}

export type ProblemaRubrica = 'sin_criterios' | 'suma' | 'reglas'

export function problemaElemento(r: RubricaElemento): ProblemaRubrica | null {
  if (r.criterios.length === 0) return 'sin_criterios'
  if (totalEstandar(r.criterios) !== PUNTAJE_OBJETIVO) return 'suma'
  if (advertenciasRubrica(r.criterios).length) return 'reglas'
  return null
}

/** Rubric rules (UTP). */
export const REGLAS_RUBRICA = { minCriterios: 4, maxCriterios: 10, inicialMin: 2, inicialMax: 10 }

const redondear = (n: number) => Math.round(n * 100) / 100

/**
 * Rubric rules shown as warnings while the teacher works (saving is never
 * blocked; "Finalizar edición general" requires all of them).
 * Criteria in screen order; scores may be strings (form) or numbers (database).
 */
export function advertenciasRubrica(criterios: Array<Partial<Record<keyof CriterioCampos, unknown>>>): string[] {
  const { minCriterios, maxCriterios, inicialMin, inicialMax } = REGLAS_RUBRICA
  const vacio = (v: unknown) => v === null || v === undefined || String(v).trim() === ''
  const num = (v: unknown) => (vacio(v) ? null : Number(String(v).replace(',', '.')))
  const avisos: string[] = []
  if (!criterios.length) return avisos
  const n = criterios.length
  if (n < minCriterios) avisos.push(`Tiene ${n} ${n === 1 ? 'criterio' : 'criterios'}: el mínimo es ${minCriterios}.`)
  if (n > maxCriterios) avisos.push(`Tiene ${n} criterios: el máximo es ${maxCriterios}.`)

  const suma = (k: keyof CriterioCampos) => redondear(criterios.reduce<number>((s, c) => s + (Number.isFinite(num(c[k])) ? (num(c[k]) as number) : 0), 0))
  const total = suma('dpl_puntajeestandar')
  const falta = redondear(PUNTAJE_OBJETIVO - total)
  if (falta > 0) avisos.push(`El estándar esperado suma ${total} de ${PUNTAJE_OBJETIVO} pt: ${falta === 1 ? 'falta' : 'faltan'} ${falta} pt.`)
  else if (falta < 0) avisos.push(`El estándar esperado suma ${total} pt: te pasaste por ${-falta} pt (debe ser ${PUNTAJE_OBJETIVO}).`)
  const inicial = suma('dpl_puntajeinicial')
  if (inicial < inicialMin || inicial > inicialMax) avisos.push(`Inicial suma ${inicial} pt: debe estar entre ${inicialMin} y ${inicialMax} pt.`)

  criterios.forEach((c, i) => {
    // Texts: saved as the teacher types, so they may still be empty or too long.
    const textos: Array<[keyof CriterioCampos, string, number]> = [
      ['dpl_criterio', 'Nombre', LIMITES.criterioNombre],
      ['dpl_definicioncriterio', 'Descripción', LIMITES.criterioTexto],
      ...NIVELES.map(l => [l.texto, l.label, LIMITES.criterioTexto] as [keyof CriterioCampos, string, number]),
    ]
    const sinTexto = textos.filter(([k]) => estaVacio(String(c[k] ?? ''))).map(([, l]) => l)
    if (sinTexto.length === textos.length && NIVELES.every(l => vacio(c[l.puntaje]))) {
      avisos.push(`Criterio N°${i + 1}: está vacío; complétalo o elimínalo.`)
      return
    }
    const largos = textos.filter(([k, , max]) => longitud(String(c[k] ?? '')) > max).map(([, l]) => l)
    if (sinTexto.length) avisos.push(`Criterio N°${i + 1}: falta completar ${sinTexto.join(', ')}.`)
    if (largos.length) avisos.push(`Criterio N°${i + 1}: excede el límite de caracteres en ${largos.join(', ')}.`)
    const faltan = NIVELES.filter(l => vacio(c[l.puntaje])).map(l => l.label)
    const invalidos = NIVELES.filter(l => !vacio(c[l.puntaje]) && !(Number.isFinite(num(c[l.puntaje])) && (num(c[l.puntaje]) as number) >= 0)).map(l => l.label)
    if (faltan.length) avisos.push(`Criterio N°${i + 1}: falta el puntaje de ${faltan.join(', ')}.`)
    if (invalidos.length) avisos.push(`Criterio N°${i + 1}: el puntaje de ${invalidos.join(', ')} debe ser un número.`)
    if (faltan.length || invalidos.length) return
    const p = NIVELES.map(l => num(c[l.puntaje]) as number)
    if (!p.every((x, k) => k === 0 || p[k - 1] > x))
      avisos.push(`Criterio N°${i + 1}: los puntajes (${p.join(' - ')}) deben bajar de nivel en nivel y sin repetirse, por ejemplo 6 - 5 - 3 - 1.`)
  })
  return avisos
}

/** Whether the consigna of an element uses a rubric (Rúbrica or Matriz con rúbrica). */
export function usaRubrica(e: Elemento): boolean {
  return ([INSTRUMENTO_VALORES.rubrica, INSTRUMENTO_VALORES.matrizCon] as string[]).includes((e.consigna?.dpl_instrumento ?? '').toLowerCase())
}

/** Remove the rubric of an element whose consigna no longer uses one (criteria, competences and comments too). */
export async function quitarRubricaElemento(r: RubricaElemento): Promise<void> {
  const ids = r.criterios.map(c => c.dpl_rubricacriterioid)
  if (ids.length) await supabase.from('dpl_comentario').delete().in('dpl_entidadid', ids)
  if (!r.rubricaId) return
  const { error } = await supabase.from('dpl_rubrica').delete().eq('dpl_rubricaid', r.rubricaId)
  fail(error, 'No se pudo quitar la rúbrica.')
}

/** Create the (empty) rubric of elements whose consigna now uses one. */
export async function agregarARubricas(elementos: Elemento[], usuario: string): Promise<void> {
  for (const e of elementos) await asegurarRubrica(e, usuario)
}

async function asegurarRubrica(elemento: Elemento, usuario: string): Promise<string> {
  const { data: existente } = await supabase
    .from('dpl_rubrica')
    .select('dpl_rubricaid')
    .eq('dpl_sesionid', elemento.sesionId)
    .maybeSingle()
  if (existente) return existente.dpl_rubricaid as string
  const { data, error } = await supabase
    .from('dpl_rubrica')
    .insert({
      dpl_sesionid: elemento.sesionId,
      dpl_nombre: `Rúbrica — ${elemento.nombre}`,
      dpl_usuarioregistro: usuario,
      dpl_fecharegistro: new Date().toISOString(),
    })
    .select('dpl_rubricaid')
    .single()
  fail(error, 'No se pudo crear la rúbrica.')
  return data!.dpl_rubricaid as string
}

/** Insert new criteria after the existing ones. Returns the first new criterion's id. */
export async function crearCriterios(
  elemento: Elemento,
  filas: CriterioCampos[],
  usuario: string,
): Promise<string> {
  const rubricaId = await asegurarRubrica(elemento, usuario)
  const { count } = await supabase
    .from('dpl_rubricacriterio')
    .select('dpl_rubricacriterioid', { count: 'exact', head: true })
    .eq('dpl_rubricaid', rubricaId)
  const base = count ?? 0
  const { data, error } = await supabase
    .from('dpl_rubricacriterio')
    .insert(filas.map((f, i) => ({ ...f, dpl_rubricaid: rubricaId, dpl_orden: base + i + 1 })))
    .select('dpl_rubricacriterioid, dpl_orden')
  fail(error, 'No se pudieron guardar los criterios.')
  const ordered = (data ?? []).sort((a, b) => (a.dpl_orden as number) - (b.dpl_orden as number))
  return ordered[0]?.dpl_rubricacriterioid as string
}

export async function actualizarCriterio(id: string, campos: CriterioCampos): Promise<void> {
  const { error } = await supabase
    .from('dpl_rubricacriterio')
    .update({ ...campos, modifiedon: new Date().toISOString() })
    .eq('dpl_rubricacriterioid', id)
  fail(error, 'No se pudo guardar el criterio.')
}

/** Delete a criterion and renumber the remaining ones 1..n. */
export async function eliminarCriterio(criterio: CriterioRow): Promise<void> {
  const { error } = await supabase.from('dpl_rubricacriterio').delete().eq('dpl_rubricacriterioid', criterio.dpl_rubricacriterioid)
  fail(error, 'No se pudo eliminar el criterio.')
  const { data: restantes, error: e2 } = await supabase
    .from('dpl_rubricacriterio')
    .select('dpl_rubricacriterioid')
    .eq('dpl_rubricaid', criterio.dpl_rubricaid)
    .order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudo reordenar los criterios.')
  await Promise.all(
    (restantes ?? []).map((r, i) =>
      supabase.from('dpl_rubricacriterio').update({ dpl_orden: i + 1 }).eq('dpl_rubricacriterioid', r.dpl_rubricacriterioid),
    ),
  )
}

export async function getCriterio(id: string): Promise<CriterioRow | null> {
  const { data, error } = await supabase.from('dpl_rubricacriterio').select('*').eq('dpl_rubricacriterioid', id).maybeSingle()
  fail(error, 'No se pudo cargar el criterio.')
  return (data as CriterioRow) ?? null
}

export async function marcarCompetencia(params: {
  criterioId: string
  competencia: CompetenciaCurso
  marcado: boolean
  existente?: SeleccionCompetencia
  porPrograma: boolean
}): Promise<void> {
  const { criterioId, competencia, marcado, existente, porPrograma } = params
  if (!marcado) {
    if (!existente) return
    const { error } = await supabase
      .from('dpl_rubricacriteriocompetencia')
      .delete()
      .eq('dpl_rubricacriteriocompetenciaid', existente.id)
    fail(error, 'No se pudo quitar la competencia.')
    return
  }
  const { error } = await supabase.from('dpl_rubricacriteriocompetencia').insert({
    dpl_rubricacriterioid: criterioId,
    dpl_competenciaid: competencia.competenciaId,
    dpl_nivel: competencia.nivel,
    dpl_competenciaevidencia: competencia.competenciaEvidencia,
    ...(porPrograma ? { dpl_programaid: competencia.programaId } : {}),
  })
  fail(error, 'No se pudo marcar la competencia.')
}

// ── Workflow ─────────────────────────────────────────────────────────────────

export type EstadoProceso = 'en_edicion' | 'revision_monitor' | 'revision_dda' | 'aprobado'
export type InstrumentoFlujo = 'consignas' | 'rubricas' | 'matriz' | 'lista' | 'escala'

export const ESTADO_LABEL: Record<EstadoProceso, string> = {
  en_edicion: 'En edición',
  revision_monitor: 'En revisión',
  revision_dda: 'En revisión · aprobado por Monitor EA',
  aprobado: 'Aprobado',
}

export interface EventoProceso {
  id: string
  /** cambio_instrumento / quitado: incidents the whole course team should know about. */
  accion: 'finalizado' | 'enviado' | 'aprobado' | 'devuelto' | 'habilitado' | 'cambio_instrumento' | 'quitado'
  instrumento: string | null
  rol: string | null
  usuario: string | null
  comentario: string | null
  fecha: string
}

export interface ProcesoCurso {
  /** False when schema-flujo.sql hasn't been run: finalize/approve are unavailable. */
  disponible: boolean
  estado: EstadoProceso
  finalizado: Record<InstrumentoFlujo, boolean>
  eventos: EventoProceso[]
}

const PROCESO = 'contenido_academico'

const PROCESO_VACIO: ProcesoCurso = {
  disponible: false,
  estado: 'en_edicion',
  finalizado: { consignas: false, rubricas: false, matriz: false, lista: false, escala: false },
  eventos: [],
}

export async function getProceso(cursoId: string): Promise<ProcesoCurso> {
  const { data, error } = await supabase
    .from('dpl_procesocurso')
    .select('*')
    .eq('dpl_cursoid', cursoId)
    .eq('dpl_proceso', PROCESO)
    .maybeSingle()
  if (isMissingTable(error)) return PROCESO_VACIO
  fail(error, 'No se pudo cargar el estado del proceso.')

  const { data: ev, error: e2 } = await supabase
    .from('dpl_procesoevento')
    .select('*')
    .eq('dpl_cursoid', cursoId)
    .eq('dpl_proceso', PROCESO)
    .order('createdon', { ascending: true })
  fail(e2, 'No se pudo cargar el historial.')

  return {
    disponible: true,
    estado: (data?.dpl_estado as EstadoProceso) ?? 'en_edicion',
    finalizado: {
      consignas: !!data?.dpl_consignas_finalizado,
      rubricas: !!data?.dpl_rubricas_finalizado,
      matriz: !!data?.dpl_matriz_finalizado,
      lista: !!data?.dpl_lista_finalizado,
      escala: !!data?.dpl_escala_finalizado,
    },
    eventos: (ev ?? []).map(e => ({
      id: e.dpl_procesoeventoid,
      accion: e.dpl_accion,
      instrumento: e.dpl_instrumento,
      rol: e.dpl_rol,
      usuario: e.dpl_usuario,
      comentario: e.dpl_comentario,
      fecha: e.createdon,
    })),
  }
}

async function guardarProceso(
  cursoId: string,
  cambios: Partial<{ estado: EstadoProceso; consignas: boolean; rubricas: boolean; matriz: boolean; lista: boolean; escala: boolean }>,
): Promise<void> {
  const row: Record<string, unknown> = {
    dpl_cursoid: cursoId,
    dpl_proceso: PROCESO,
    modifiedon: new Date().toISOString(),
  }
  if (cambios.estado) row.dpl_estado = cambios.estado
  if (cambios.consignas !== undefined) row.dpl_consignas_finalizado = cambios.consignas
  if (cambios.rubricas !== undefined) row.dpl_rubricas_finalizado = cambios.rubricas
  if (cambios.matriz !== undefined) row.dpl_matriz_finalizado = cambios.matriz
  if (cambios.lista !== undefined) row.dpl_lista_finalizado = cambios.lista
  if (cambios.escala !== undefined) row.dpl_escala_finalizado = cambios.escala
  const { error } = await supabase.from('dpl_procesocurso').upsert(row, { onConflict: 'dpl_cursoid,dpl_proceso' })
  fail(error, 'No se pudo actualizar el estado del proceso.')
}

async function registrarEvento(
  cursoId: string,
  e: { accion: EventoProceso['accion']; instrumento?: string; rol?: string; usuario: string; comentario?: string },
): Promise<void> {
  const { error } = await supabase.from('dpl_procesoevento').insert({
    dpl_cursoid: cursoId,
    dpl_proceso: PROCESO,
    dpl_accion: e.accion,
    dpl_instrumento: e.instrumento ?? null,
    dpl_rol: e.rol ?? null,
    dpl_usuario: e.usuario,
    dpl_comentario: e.comentario ?? null,
  })
  fail(error, 'No se pudo registrar el evento.')
  void notificarEvento(cursoId, e)
}

/** Who hears about each event of the course, according to their role in it. */
function notificarEvento(cursoId: string, e: { accion: EventoProceso['accion']; instrumento?: string; rol?: string; usuario: string; comentario?: string }): Promise<void> {
  const parte = e.instrumento ? PARTE[e.instrumento] ?? e.instrumento : ''
  const base = { cursoId, actorCorreo: e.usuario, ruta: rutaDe(cursoId, e.instrumento) }
  const quien = e.rol === 'dda' ? 'DDA' : 'Monitor EA'
  switch (e.accion) {
    case 'finalizado':
      return notificar({ ...base, roles: REVISORES, tipo: 'finalizado', titulo: c => `${c}: se finalizó ${parte}`, detalle: 'El docente terminó esta parte; puede seguir editando hasta que aprueben.' })
    case 'enviado':
      return notificar({ ...base, ruta: rutaDe(cursoId), roles: REVISORES, tipo: 'enviado', titulo: c => `${c}: listo para revisión`, detalle: 'Todas las partes del diseño de contenido académico quedaron finalizadas.' })
    case 'aprobado':
      return notificar({
        ...base,
        ruta: rutaDe(cursoId),
        roles: [...EQUIPO_DOCENTE, e.rol === 'dda' ? 'monitor_ea' : 'dda'],
        tipo: 'aprobado',
        titulo: c => `${c}: aprobado por ${quien}`,
        detalle: e.rol === 'dda' ? 'Con los dos checks, el proceso quedó cerrado.' : 'Falta la aprobación de DDA.',
      })
    case 'devuelto':
      return notificar({ ...base, ruta: rutaDe(cursoId), roles: [...EQUIPO_DOCENTE, ...REVISORES], tipo: 'devuelto', titulo: c => `${c}: devuelto por ${quien}`, detalle: e.comentario ?? 'Se habilitó la edición para hacer los cambios.' })
    case 'habilitado':
      return notificar({ ...base, ruta: rutaDe(cursoId), roles: [...EQUIPO_DOCENTE, 'dda'], tipo: 'habilitado', titulo: c => `${c}: el Monitor EA habilitó la edición`, detalle: e.comentario ?? 'La aprobación empieza de nuevo.' })
    case 'cambio_instrumento':
    case 'quitado':
      return notificar({ ...base, roles: TODOS, tipo: 'incidencia', titulo: c => `${c}: incidencia${parte ? ` en ${parte}` : ''}`, detalle: e.comentario ?? null })
  }
}

/**
 * Incident in the course history (seen by everyone in "Flujo de trabajo"), e.g. a
 * consigna changed its instrument and an instrument already filled in stopped counting.
 */
export async function registrarIncidencia(
  cursoId: string,
  e: { accion: 'cambio_instrumento' | 'quitado'; instrumento: string; rol: string; usuario: string; comentario: string },
): Promise<void> {
  await registrarEvento(cursoId, e)
}

/** Which instruments this course must finalize before the process goes to review. */
export function instrumentosRequeridos(ctx: CursoContexto, rubricas: RubricasCurso | null): InstrumentoFlujo[] {
  const req: InstrumentoFlujo[] = ['consignas']
  const usaRubrica = rubricas
    ? rubricas.elementos.length > 0
    : ctx.elementos.some(e => tipoInstrumento(e.consigna?.dpl_instrumento) === 'rubrica')
  if (usaRubrica) req.push('rubricas')
  // Matriz, Lista de cotejo, Escala: assigned to the course and chosen in at least one consigna.
  if (ctx.permite.matriz && ctx.elementos.some(e => tipoInstrumento(e.consigna?.dpl_instrumento) === 'matriz')) req.push('matriz')
  if (ctx.permite.lista && ctx.elementos.some(e => tipoInstrumento(e.consigna?.dpl_instrumento) === 'lista')) req.push('lista')
  if (ctx.permite.escala && ctx.elementos.some(e => tipoInstrumento(e.consigna?.dpl_instrumento) === 'escala')) req.push('escala')
  return req
}

/**
 * Finalize one instrument. When every required instrument is finalized the
 * process moves to the Monitor EA's review. Returns whether it was sent.
 */
export async function finalizarInstrumento(
  cursoId: string,
  instrumento: InstrumentoFlujo,
  requeridos: InstrumentoFlujo[],
  proceso: ProcesoCurso,
  usuario: string,
): Promise<{ enviado: boolean }> {
  const finalizado = { ...proceso.finalizado, [instrumento]: true }
  const enviado = requeridos.every(r => finalizado[r])
  await guardarProceso(cursoId, { [instrumento]: true, ...(enviado ? { estado: 'revision_monitor' as const } : {}) })
  await registrarEvento(cursoId, { accion: 'finalizado', instrumento, rol: 'docente', usuario })
  if (enviado) await registrarEvento(cursoId, { accion: 'enviado', rol: 'docente', usuario })
  return { enviado }
}

export async function aprobarProceso(cursoId: string, rol: 'monitor_ea' | 'dda', usuario: string): Promise<void> {
  await guardarProceso(cursoId, { estado: rol === 'monitor_ea' ? 'revision_dda' : 'aprobado' })
  await registrarEvento(cursoId, { accion: 'aprobado', rol, usuario })
}

/** Send back to the teacher with a comment. Everything becomes editable again. */
export async function devolverProceso(
  cursoId: string,
  rol: 'monitor_ea' | 'dda',
  usuario: string,
  comentario: string,
): Promise<void> {
  await guardarProceso(cursoId, { estado: 'en_edicion', consignas: false, rubricas: false, matriz: false, lista: false, escala: false })
  await registrarEvento(cursoId, { accion: 'devuelto', rol, usuario, comentario })
}

/** Monitor EA re-opens editing (also after DDA approval). Approval starts over. */
export async function habilitarEdicion(cursoId: string, usuario: string, comentario?: string): Promise<void> {
  await guardarProceso(cursoId, { estado: 'en_edicion', consignas: false, rubricas: false, matriz: false, lista: false, escala: false })
  await registrarEvento(cursoId, { accion: 'habilitado', rol: 'monitor_ea', usuario, comentario })
}

// ── Comments ─────────────────────────────────────────────────────────────────

/** Who speaks in a thread: the two approver sides, or the teaching team replying. */
export type LadoComentario = 'monitor_ea' | 'dda' | 'docente'

export interface Comentario {
  id: string
  entidadId: string
  /** Field of the record; 'general' for comments on the whole record. */
  campo: string
  padreId: string | null
  lado: LadoComentario
  autor: string
  correo: string
  rol: string
  texto: string
  fecha: string
  cita: string | null
  textoItem: string | null
  resuelto: boolean
  resueltoPor: string | null
  fechaResuelto: string | null
}

export const CAMPO_GENERAL = 'general'

export async function getComentarios(cursoId: string, instrumento: InstrumentoFlujo): Promise<Comentario[]> {
  const { data, error } = await supabase
    .from('dpl_comentario')
    .select('*')
    .eq('dpl_cursoid', cursoId)
    .eq('dpl_instrumento', instrumento)
    .order('createdon', { ascending: true })
  if (isMissingTable(error)) return []
  fail(error, 'No se pudieron cargar los comentarios.')
  return (data ?? []).map(c => ({
    id: c.dpl_comentarioid,
    entidadId: c.dpl_entidadid,
    campo: c.dpl_campo ?? CAMPO_GENERAL,
    padreId: c.dpl_padreid ?? null,
    lado: (c.dpl_lado ?? (/dda/i.test(c.dpl_rol ?? '') ? 'dda' : 'monitor_ea')) as LadoComentario,
    autor: c.dpl_autor ?? '',
    correo: c.dpl_correoautor ?? '',
    rol: c.dpl_rol ?? '',
    texto: c.dpl_texto,
    fecha: c.createdon,
    cita: c.dpl_cita ?? null,
    textoItem: c.dpl_textoitem ?? null,
    resuelto: !!c.dpl_resuelto,
    resueltoPor: c.dpl_resueltopor ?? null,
    fechaResuelto: c.dpl_fecharesuelto ?? null,
  }))
}

const FALTA_SCRIPT_COMENTARIOS = 'Falta ejecutar supabase/schema-comentarios.sql en Supabase.'

export async function agregarComentario(params: {
  cursoId: string
  instrumento: InstrumentoFlujo
  entidadId: string
  campo: string
  padreId?: string | null
  lado: LadoComentario
  autor: string
  correo: string
  rol: string
  texto: string
  cita?: string | null
  textoItem?: string | null
}): Promise<void> {
  const { error } = await supabase.from('dpl_comentario').insert({
    dpl_cursoid: params.cursoId,
    dpl_instrumento: params.instrumento,
    dpl_entidadid: params.entidadId,
    dpl_campo: params.campo === CAMPO_GENERAL ? null : params.campo,
    dpl_padreid: params.padreId ?? null,
    dpl_lado: params.lado,
    dpl_autor: params.autor,
    dpl_correoautor: params.correo,
    dpl_rol: params.rol,
    dpl_texto: params.texto,
    dpl_cita: params.cita ?? null,
    dpl_textoitem: params.textoItem ?? null,
  })
  if (error && /column|schema cache/i.test(error.message)) throw new Error(FALTA_SCRIPT_COMENTARIOS)
  fail(error, 'No se pudo guardar el comentario.')
  void notificarComentario(params)
}

/** A reviewer's new comment reaches the teaching team; a reply reaches whoever wrote the comment. */
async function notificarComentario(p: { cursoId: string; instrumento: InstrumentoFlujo; padreId?: string | null; lado: LadoComentario; autor: string; correo: string; rol: string; texto: string }): Promise<void> {
  const parte = PARTE[p.instrumento] ?? p.instrumento
  const detalle = p.texto.length > 160 ? `${p.texto.slice(0, 157)}…` : p.texto
  const base = { cursoId: p.cursoId, actorCorreo: p.correo, ruta: rutaDe(p.cursoId, p.instrumento), detalle }
  if (!p.padreId) {
    if (p.lado === 'docente') return
    return notificar({ ...base, roles: EQUIPO_DOCENTE, tipo: 'comentario', titulo: c => `${c}: ${p.rol || 'Un revisor'} comentó en ${parte}` })
  }
  const { data: padre } = await supabase.from('dpl_comentario').select('dpl_correoautor').eq('dpl_comentarioid', p.padreId).maybeSingle()
  return notificar({
    ...base,
    correos: padre?.dpl_correoautor ? [padre.dpl_correoautor as string] : [],
    // A reviewer answering in a thread: the teaching team needs to see it too.
    roles: p.lado === 'docente' ? [] : EQUIPO_DOCENTE,
    tipo: 'respuesta',
    titulo: c => `${c}: ${p.autor} respondió un comentario en ${parte}`,
  })
}

/** Open (unresolved) comment threads of the course, per part. */
export async function comentariosPendientes(cursoId: string): Promise<Record<string, number>> {
  const { data, error } = await supabase.from('dpl_comentario').select('dpl_instrumento').eq('dpl_cursoid', cursoId).is('dpl_padreid', null).eq('dpl_resuelto', false)
  if (error) return {}
  const res: Record<string, number> = {}
  for (const c of data ?? []) res[c.dpl_instrumento as string] = (res[c.dpl_instrumento as string] ?? 0) + 1
  return res
}

/** Only the author of a comment marks it resolved (or opens it again). */
export async function resolverComentario(id: string, resuelto: boolean, usuario: string): Promise<void> {
  const { error } = await supabase
    .from('dpl_comentario')
    .update({ dpl_resuelto: resuelto, dpl_resueltopor: resuelto ? usuario : null, dpl_fecharesuelto: resuelto ? new Date().toISOString() : null })
    .eq('dpl_comentarioid', id)
  if (error && /column|schema cache/i.test(error.message)) throw new Error(FALTA_SCRIPT_COMENTARIOS)
  fail(error, 'No se pudo actualizar el comentario.')
}

export interface EstadoComentarios {
  /** Approver sides (Monitor EA, DDA) with open comments: 0, 1 or 2. */
  lados: number
  abiertos: number
  resueltos: number
}

/** Badge state of one item (or of a whole record when campo is omitted). */
export function estadoComentarios(comentarios: Comentario[], entidadId: string, campo?: string): EstadoComentarios {
  const raices = comentarios.filter(c => !c.padreId && c.entidadId === entidadId && (campo === undefined || c.campo === campo))
  const abiertos = raices.filter(c => !c.resuelto)
  return {
    lados: new Set(abiertos.map(c => c.lado)).size,
    abiertos: abiertos.length,
    resueltos: raices.length - abiertos.length,
  }
}


/** "hace 3 días" style relative time. */
export function haceCuanto(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.round(diff / 60000)
  if (min < 1) return 'hace un momento'
  if (min < 60) return `hace ${min} min`
  const h = Math.round(min / 60)
  if (h < 24) return `hace ${h} h`
  const d = Math.round(h / 24)
  return d === 1 ? 'hace 1 día' : `hace ${d} días`
}

// ── Users & course assignments ───────────────────────────────────────────────

export interface UsuarioRegistrado {
  id: string
  nombre: string
  correo: string
  roles: string[]
}

/**
 * Look a person up by email. `null` table = dpl_usuario doesn't exist yet
 * (schema not applied), so callers fall back to demo sign-in.
 */
export async function buscarUsuario(correo: string): Promise<{ tabla: boolean; usuario: UsuarioRegistrado | null; inactivo?: boolean }> {
  const { data, error } = await supabase
    .from('dpl_usuario')
    .select('dpl_usuarioid, dpl_nombre, dpl_correo, dpl_roles, dpl_activo')
    .eq('dpl_correo', correo.toLowerCase())
    .maybeSingle()
  if (isMissingTable(error)) return { tabla: false, usuario: null }
  fail(error, 'No se pudo validar el usuario.')
  if (!data) return { tabla: true, usuario: null }
  if (data.dpl_activo === false) return { tabla: true, usuario: null, inactivo: true }
  return {
    tabla: true,
    usuario: { id: data.dpl_usuarioid, nombre: data.dpl_nombre, correo: data.dpl_correo, roles: data.dpl_roles ?? [] },
  }
}

/** Roles of a person in one course (asignado, docente, asesor, monitor_ea, monitor_qa, monitor_disena, dda). */
export async function getRolesEnCurso(usuarioId: string, cursoId: string): Promise<string[]> {
  const { data, error } = await supabase.from('dpl_cursoasignacion').select('dpl_rol').eq('dpl_usuarioid', usuarioId).eq('dpl_cursoid', cursoId)
  if (isMissingTable(error)) return []
  fail(error, 'No se pudo cargar tu rol en el curso.')
  return [...new Set((data ?? []).map(r => r.dpl_rol as string))]
}

/** Course ids a user sees: those where they are "Persona Asignada". */
export async function getCursosAsignados(usuarioId: string): Promise<Set<string>> {
  const { data, error } = await supabase.from('dpl_cursoasignacion').select('dpl_cursoid').eq('dpl_usuarioid', usuarioId).eq('dpl_rol', 'asignado')
  if (isMissingTable(error)) return new Set()
  fail(error, 'No se pudieron cargar tus cursos asignados.')
  return new Set((data ?? []).map(r => r.dpl_cursoid as string))
}

// ── Admin: users & assignments (Centro de datos) ─────────────────────────────

export interface UsuarioAdmin {
  id: string
  nombre: string
  correo: string | null
  roles: string[]
  activo: boolean
}

export interface Asignacion {
  cursoId: string
  usuarioId: string
  rol: string
}

export async function listarUsuarios(): Promise<{ tabla: boolean; usuarios: UsuarioAdmin[]; asignaciones: Asignacion[] }> {
  const { data, error } = await supabase.from('dpl_usuario').select('*').order('dpl_nombre', { ascending: true })
  if (isMissingTable(error)) return { tabla: false, usuarios: [], asignaciones: [] }
  fail(error, 'No se pudieron cargar los usuarios.')
  const { data: asig, error: e2 } = await supabase.from('dpl_cursoasignacion').select('dpl_cursoid, dpl_usuarioid, dpl_rol')
  fail(e2, 'No se pudieron cargar las asignaciones.')
  return {
    tabla: true,
    usuarios: (data ?? []).map(u => ({
      id: u.dpl_usuarioid,
      nombre: u.dpl_nombre,
      correo: u.dpl_correo,
      roles: u.dpl_roles ?? [],
      activo: u.dpl_activo !== false,
    })),
    asignaciones: (asig ?? []).map(a => ({ cursoId: a.dpl_cursoid, usuarioId: a.dpl_usuarioid, rol: a.dpl_rol })),
  }
}

export async function guardarUsuario(u: Partial<UsuarioAdmin> & { nombre: string }): Promise<UsuarioAdmin> {
  const correo = u.correo?.trim().toLowerCase() || null
  const row = {
    dpl_nombre: u.nombre.trim(),
    dpl_correo: correo,
    dpl_roles: u.roles ?? [],
    dpl_activo: u.activo ?? true,
    modifiedon: new Date().toISOString(),
  }
  const q = u.id
    ? supabase.from('dpl_usuario').update(row).eq('dpl_usuarioid', u.id)
    : supabase.from('dpl_usuario').insert(row)
  const { data, error } = await q.select().single()
  if (error && /duplicate key/i.test(error.message)) {
    throw new Error(/correo/.test(error.message) ? 'Ese correo ya pertenece a otro usuario.' : 'Ya existe un usuario con ese nombre.')
  }
  fail(error, 'No se pudo guardar el usuario.')
  return { id: data.dpl_usuarioid, nombre: data.dpl_nombre, correo: data.dpl_correo, roles: data.dpl_roles ?? [], activo: data.dpl_activo !== false }
}

export async function cambiarAsignacion(a: Asignacion, asignado: boolean): Promise<void> {
  if (asignado) {
    const { error } = await supabase
      .from('dpl_cursoasignacion')
      .upsert({ dpl_cursoid: a.cursoId, dpl_usuarioid: a.usuarioId, dpl_rol: a.rol }, { onConflict: 'dpl_cursoid,dpl_usuarioid,dpl_rol' })
    fail(error, 'No se pudo asignar el curso.')
  } else {
    const { error } = await supabase
      .from('dpl_cursoasignacion')
      .delete()
      .eq('dpl_cursoid', a.cursoId)
      .eq('dpl_usuarioid', a.usuarioId)
      .eq('dpl_rol', a.rol)
    fail(error, 'No se pudo quitar la asignación.')
  }
}

/** Criteria already saved for one element (ordered), for "Agregar criterio" to continue from. */
export async function getCriteriosDeElemento(sesionId: string): Promise<CriterioRow[]> {
  const { data: rubrica, error } = await supabase.from('dpl_rubrica').select('dpl_rubricaid').eq('dpl_sesionid', sesionId).maybeSingle()
  fail(error, 'No se pudo cargar la rúbrica.')
  if (!rubrica) return []
  const { data, error: e2 } = await supabase
    .from('dpl_rubricacriterio')
    .select('*')
    .eq('dpl_rubricaid', rubrica.dpl_rubricaid)
    .order('dpl_orden', { ascending: true })
  fail(e2, 'No se pudieron cargar los criterios.')
  return (data ?? []) as CriterioRow[]
}

// ── Activation ("¿Qué proceso activarás?") ───────────────────────────────────
// Mirrors the Power Automate CONSOLIDADO_INPUTS_* flows: the administrator
// enables processes per course (Permite_*); the teacher presses ACTIVAR once
// per process, which pulls the course data into that process (one row per
// element) and marks it done in Activado_*. The IA is a separate step, run
// inside each process element by element — IA_Para*_Corrido is not used for
// activation anymore. Nothing is copied: rows point at the course/unit/session.

export type ProcesoActivable = 'consignas' | 'rubrica' | 'matriz' | 'lista' | 'escala'

export interface EstadoActivacion {
  asignado: boolean
  activado: boolean
}

/** Activado_* of dpl_curso: the course data was pulled into the process (schema-activacion.sql). */
const COLUMNA_ACTIVADO: Record<ProcesoActivable, string> = {
  consignas: 'dpl_activado_consignas',
  rubrica: 'dpl_activado_rubrica',
  matriz: 'dpl_activado_matriz',
  lista: 'dpl_activado_lista',
  escala: 'dpl_activado_escala',
}
/** Before schema-activacion.sql, activation was stored in the IA columns: read them as a fallback. */
const COLUMNA_ACTIVADO_ANTIGUA: Record<ProcesoActivable, string> = {
  consignas: 'dpl_ia_consigna_corrido',
  rubrica: 'dpl_ia_rubrica_corrido',
  // Permite_Matriz_CN / IA_ParaMatrizConRubrica are no longer used: one Matriz process (SN).
  matriz: 'dpl_ia_matrizsinrubrica_corrido',
  lista: 'dpl_ia_lista_corrido',
  escala: 'dpl_ia_escala_corrido',
}

/** Permite_* check of LISTADO_CURSOS_PARA_IA for each process. */
export const COLUMNA_PERMITE: Record<ProcesoActivable, string> = {
  consignas: 'dpl_permiteconsignas',
  rubrica: 'dpl_permiterubricas',
  matriz: 'dpl_permitematrizsn',
  lista: 'dpl_permitelistacotejo',
  escala: 'dpl_permiteescala',
}

/** Admin assigns (or removes) a process for the course. */
export async function asignarProceso(cursoId: string, proceso: ProcesoActivable, valor: boolean): Promise<void> {
  const { error } = await supabase.from('dpl_curso').update({ [COLUMNA_PERMITE[proceso]]: valor }).eq('dpl_cursoid', cursoId)
  fail(error, 'No se pudo asignar el proceso.')
}

export async function getActivacion(ctx: CursoContexto): Promise<Record<ProcesoActivable, EstadoActivacion>> {
  const { data, error } = await supabase.from('dpl_curso').select('*').eq('dpl_cursoid', ctx.id).single()
  fail(error, 'No se pudo cargar el estado de activación.')
  const est = (p: ProcesoActivable, permite: boolean): EstadoActivacion => ({
    asignado: permite,
    activado: data && COLUMNA_ACTIVADO[p] in data ? !!data[COLUMNA_ACTIVADO[p]] : !!data?.[COLUMNA_ACTIVADO_ANTIGUA[p]],
  })
  return {
    consignas: est('consignas', ctx.permite.consignas),
    rubrica: est('rubrica', ctx.permite.rubrica),
    matriz: est('matriz', ctx.permite.matriz),
    lista: est('lista', ctx.permite.lista),
    escala: est('escala', ctx.permite.escala),
  }
}

/** Instruments (as stored in the consigna) that feed each process. */
const INSTRUMENTOS_DE: Record<Exclude<ProcesoActivable, 'consignas'>, string[]> = {
  rubrica: [INSTRUMENTO_VALORES.rubrica, INSTRUMENTO_VALORES.matrizCon],
  matriz: [INSTRUMENTO_VALORES.matrizSin, INSTRUMENTO_VALORES.matrizCon],
  lista: [INSTRUMENTO_VALORES.lista],
  escala: [INSTRUMENTO_VALORES.escala, INSTRUMENTO_VALORES.escalaAdmin],
}

const TABLA_CABECERA: Record<Exclude<ProcesoActivable, 'consignas'>, { tabla: string; nombre: string }> = {
  rubrica: { tabla: 'dpl_rubrica', nombre: 'Rúbrica' },
  matriz: { tabla: 'dpl_matriz', nombre: 'Matriz' },
  lista: { tabla: 'dpl_listacotejo', nombre: 'Lista de cotejo' },
  escala: { tabla: 'dpl_escalavaloracion', nombre: 'Escala de valoración' },
}

export type ProcesoInstrumento = Exclude<ProcesoActivable, 'consignas'>

/** Processes that use a consigna's instrument value (e.g. "matriz con rúbrica" → rubrica + matriz). */
export function procesosDeInstrumento(valor: string | null | undefined): ProcesoInstrumento[] {
  const v = (valor ?? '').toLowerCase()
  return (Object.keys(INSTRUMENTOS_DE) as ProcesoInstrumento[]).filter(p => INSTRUMENTOS_DE[p].includes(v))
}

export const PROCESO_LABEL: Record<ProcesoInstrumento, { nombre: string; unidad: [string, string] }> = {
  rubrica: { nombre: 'rúbrica', unidad: ['criterio', 'criterios'] },
  matriz: { nombre: 'matriz', unidad: ['pregunta', 'preguntas'] },
  lista: { nombre: 'lista de cotejo', unidad: ['indicador', 'indicadores'] },
  escala: { nombre: 'escala de valoración', unidad: ['indicador', 'indicadores'] },
}

/** What an element already has in each instrument (criteria, questions, indicators). */
export async function contenidoDeElemento(sesionId: string): Promise<Record<ProcesoInstrumento, number>> {
  const hijos: Record<ProcesoInstrumento, { items: string; pk: string }> = {
    rubrica: { items: 'dpl_rubricacriterio', pk: 'dpl_rubricaid' },
    matriz: { items: 'dpl_matrizpregunta', pk: 'dpl_matrizid' },
    lista: { items: 'dpl_listacotejoindicador', pk: 'dpl_listacotejoid' },
    escala: { items: 'dpl_escalaindicador', pk: 'dpl_escalavaloracionid' },
  }
  const res: Record<ProcesoInstrumento, number> = { rubrica: 0, matriz: 0, lista: 0, escala: 0 }
  await Promise.all(
    (Object.keys(hijos) as ProcesoInstrumento[]).map(async p => {
      const { data: cab } = await supabase.from(TABLA_CABECERA[p].tabla).select(hijos[p].pk).eq('dpl_sesionid', sesionId).maybeSingle()
      const id = cab ? (cab as unknown as Record<string, string>)[hijos[p].pk] : null
      if (!id) return
      const { count } = await supabase.from(hijos[p].items).select(hijos[p].pk, { count: 'exact', head: true }).eq(hijos[p].pk, id)
      res[p] = count ?? 0
    }),
  )
  return res
}

/**
 * How many rows ACTIVAR / "Preparar nuevos" would create now for each process
 * (same rule as activarProceso): elements without consigna, or elements whose
 * consigna chose the instrument but have no record of it yet.
 */
export async function pendientesPorPreparar(ctx: CursoContexto): Promise<Record<ProcesoActivable, number>> {
  const res: Record<ProcesoActivable, number> = { consignas: ctx.elementos.filter(e => !e.consigna).length, rubrica: 0, matriz: 0, lista: 0, escala: 0 }
  await Promise.all(
    (Object.keys(INSTRUMENTOS_DE) as Array<Exclude<ProcesoActivable, 'consignas'>>).map(async p => {
      const elegidos = ctx.elementos.filter(e => INSTRUMENTOS_DE[p].includes((e.consigna?.dpl_instrumento ?? '').toLowerCase()))
      if (!elegidos.length) return
      const { data, error } = await supabase.from(TABLA_CABECERA[p].tabla).select('dpl_sesionid').in('dpl_sesionid', elegidos.map(e => e.sesionId))
      if (error) return
      const ya = new Set((data ?? []).map(r => r.dpl_sesionid as string))
      res[p] = elegidos.filter(e => !ya.has(e.sesionId)).length
    }),
  )
  return res
}

/**
 * ACTIVAR a process for a course (only once). Consignas: one consigna per
 * evaluation element. Instruments: one record per element whose consigna chose
 * that instrument. Returns how many rows were created.
 */
export async function activarProceso(ctx: CursoContexto, proceso: ProcesoActivable, usuario: string): Promise<number> {
  const ahora = new Date().toISOString()
  let creados = 0
  if (proceso === 'consignas') {
    const faltan = ctx.elementos.filter(e => !e.consigna)
    if (faltan.length) {
      const { error } = await supabase.from('dpl_consigna').insert(
        faltan.map(e => ({
          dpl_sesionid: e.sesionId,
          dpl_idconsignatext: idConsigna(ctx.idCursoText, e),
          dpl_activado: true,
          dpl_usuarioregistro: usuario,
          dpl_fecharegistro: ahora,
        })),
      )
      fail(error, 'No se pudieron crear las consignas.')
      creados = faltan.length
    }
  } else {
    const valores = INSTRUMENTOS_DE[proceso]
    const elegidos = ctx.elementos.filter(e => valores.includes((e.consigna?.dpl_instrumento ?? '').toLowerCase()))
    const { tabla, nombre } = TABLA_CABECERA[proceso]
    if (elegidos.length) {
      const { data: existentes, error: e1 } = await supabase.from(tabla).select('dpl_sesionid').in('dpl_sesionid', elegidos.map(e => e.sesionId))
      fail(e1, 'No se pudo revisar lo ya creado.')
      const ya = new Set((existentes ?? []).map(r => r.dpl_sesionid as string))
      const faltan = elegidos.filter(e => !ya.has(e.sesionId))
      if (faltan.length) {
        const { error } = await supabase.from(tabla).insert(
          faltan.map(e => ({ dpl_sesionid: e.sesionId, dpl_nombre: `${nombre} — ${e.nombre}`, dpl_activado: true, dpl_usuarioregistro: usuario, dpl_fecharegistro: ahora })),
        )
        fail(error, `No se pudo crear ${nombre.toLowerCase()}.`)
        creados = faltan.length
      }
    }
  }
  // Activating also leaves the process ticked as assigned (Permite_*). The IA columns are not touched.
  const marcas = { [COLUMNA_ACTIVADO[proceso]]: true, [COLUMNA_PERMITE[proceso]]: true }
  const { error } = await supabase.from('dpl_curso').update(marcas).eq('dpl_cursoid', ctx.id)
  if (error && /dpl_activado_/.test(error.message)) throw new Error('Falta ejecutar supabase/schema-activacion.sql en Supabase (separa "activado" de las columnas de IA).')
  fail(error, 'No se pudo marcar el proceso como activado.')
  return creados
}

/**
 * Save a whole rubric edited at once: removes the criteria taken out, updates
 * the ones kept, inserts the new ones, and numbers them 1..n in screen order.
 */
export async function guardarRubricaCompleta(
  elemento: Elemento,
  filas: Array<{ id: string | null; campos: CriterioCampos }>,
  eliminados: string[],
  usuario: string,
): Promise<string[]> {
  if (eliminados.length) {
    const { error } = await supabase.from('dpl_rubricacriterio').delete().in('dpl_rubricacriterioid', eliminados)
    fail(error, 'No se pudieron quitar los criterios.')
  }
  const rubricaId = await asegurarRubrica(elemento, usuario)
  const ahora = new Date().toISOString()
  const ids: string[] = []
  for (const [i, f] of filas.entries()) {
    if (f.id) {
      const { error } = await supabase
        .from('dpl_rubricacriterio')
        .update({ ...f.campos, dpl_orden: i + 1, modifiedon: ahora })
        .eq('dpl_rubricacriterioid', f.id)
      fail(error, `No se pudo guardar el criterio N°${i + 1}.`)
      ids.push(f.id)
    } else {
      const { data, error } = await supabase
        .from('dpl_rubricacriterio')
        .insert({ ...f.campos, dpl_rubricaid: rubricaId, dpl_orden: i + 1 })
        .select('dpl_rubricacriterioid')
        .single()
      fail(error, `No se pudo crear el criterio N°${i + 1}.`)
      ids.push(data!.dpl_rubricacriterioid as string)
    }
  }
  return ids
}

// ── IA BACKUP (initial proposal kept untouched to compare with the final version) ──

export type InstrumentoBackup = 'consignas' | 'rubricas' | 'matriz' | 'lista' | 'escala'

const BACKUP: Record<InstrumentoBackup, { items: string; backup: string; cabecera: { tabla: string; pk: string } | null }> = {
  consignas: { items: 'dpl_consigna', backup: 'dpl_consigna_backup', cabecera: null },
  rubricas: { items: 'dpl_rubricacriterio', backup: 'dpl_rubricacriterio_backup', cabecera: { tabla: 'dpl_rubrica', pk: 'dpl_rubricaid' } },
  matriz: { items: 'dpl_matrizpregunta', backup: 'dpl_matrizpregunta_backup', cabecera: { tabla: 'dpl_matriz', pk: 'dpl_matrizid' } },
  lista: { items: 'dpl_listacotejoindicador', backup: 'dpl_listacotejoindicador_backup', cabecera: { tabla: 'dpl_listacotejo', pk: 'dpl_listacotejoid' } },
  escala: { items: 'dpl_escalaindicador', backup: 'dpl_escalaindicador_backup', cabecera: { tabla: 'dpl_escalavaloracion', pk: 'dpl_escalavaloracionid' } },
}

const IA_COLUMNAS = ['dpl_json', 'dpl_inputs', 'dpl_resultadogpt', 'dpl_modeloia', 'dpl_herramientaia', 'dpl_fechaia', 'dpl_usuarioia'] as const

export interface DatosIA {
  json?: string | null
  inputs?: string | null
  resultado?: string | null
  modelo?: string | null
  herramienta?: string | null
  usuario?: string | null
}

/**
 * Copy what the IA just wrote to an element into its BACKUP list, untouched.
 * Call it right after the IA fills the instrument (before the teacher edits).
 * Returns the version number of the copy (1, 2, 3… per generation).
 */
export async function guardarBackupIA(ctx: CursoContexto, elemento: Elemento, instrumento: InstrumentoBackup, ia: DatosIA = {}): Promise<number> {
  const cfg = BACKUP[instrumento]
  let cabecera: Record<string, unknown> | null = null
  let filas: Array<Record<string, unknown>>
  if (cfg.cabecera) {
    const { data: cab, error: e1 } = await supabase.from(cfg.cabecera.tabla).select('*').eq('dpl_sesionid', elemento.sesionId).maybeSingle()
    fail(e1, 'No se pudo leer la propuesta para el backup.')
    if (!cab) return 0
    cabecera = cab
    const { data, error } = await supabase.from(cfg.items).select('*').eq(cfg.cabecera.pk, cab[cfg.cabecera.pk] as string).order('dpl_orden', { ascending: true })
    fail(error, 'No se pudo leer la propuesta para el backup.')
    filas = data ?? []
  } else {
    const { data, error } = await supabase.from(cfg.items).select('*').eq('dpl_sesionid', elemento.sesionId)
    fail(error, 'No se pudo leer la propuesta para el backup.')
    filas = data ?? []
    cabecera = filas[0] ?? null
  }
  if (!filas.length) return 0

  const { data: previa } = await supabase
    .from(cfg.backup)
    .select('dpl_version')
    .eq('dpl_sesionbackupid', elemento.sesionId)
    .order('dpl_version', { ascending: false })
    .limit(1)
  const version = ((previa?.[0]?.dpl_version as number | undefined) ?? 0) + 1
  const ahora = new Date().toISOString()
  const deIA: Record<string, unknown> = {}
  for (const c of IA_COLUMNAS) deIA[c] = cabecera?.[c] ?? null
  if (ia.json !== undefined) deIA.dpl_json = ia.json
  if (ia.inputs !== undefined) deIA.dpl_inputs = ia.inputs
  if (ia.resultado !== undefined) deIA.dpl_resultadogpt = ia.resultado
  if (ia.modelo !== undefined) deIA.dpl_modeloia = ia.modelo
  if (ia.herramienta !== undefined) deIA.dpl_herramientaia = ia.herramienta
  if (ia.usuario !== undefined) deIA.dpl_usuarioia = ia.usuario
  deIA.dpl_fechaia = deIA.dpl_fechaia ?? ahora

  const { error } = await supabase.from(cfg.backup).insert(
    filas.map(f => ({
      ...f,
      ...deIA,
      dpl_idcursotext: ctx.idCursoText,
      dpl_nombrecurso: ctx.nombre,
      dpl_elemento: elemento.nombre,
      dpl_sesionbackupid: elemento.sesionId,
      dpl_version: version,
      dpl_fechabackup: ahora,
      dpl_origen: 'ia',
    })),
  )
  if (error && /does not exist|schema cache/i.test(error.message)) throw new Error('Falta ejecutar supabase/schema-backups.sql en Supabase.')
  fail(error, 'No se pudo guardar el backup de la propuesta IA.')
  return version
}

export interface PropuestaIA {
  version: number
  fecha: string
  modelo: string | null
  herramienta: string | null
  filas: Array<Record<string, unknown>>
}

/** First IA proposal (version 1) of each element, keyed by session id. */
export async function getPropuestasIA(instrumento: InstrumentoBackup, sesionIds: string[]): Promise<Map<string, PropuestaIA>> {
  const res = new Map<string, PropuestaIA>()
  if (!sesionIds.length) return res
  const { data, error } = await supabase
    .from(BACKUP[instrumento].backup)
    .select('*')
    .in('dpl_sesionbackupid', sesionIds)
    .order('dpl_version', { ascending: true })
  if (error) return res // backup lists not created yet: nothing to compare
  for (const f of data ?? []) {
    const id = f.dpl_sesionbackupid as string
    const v = f.dpl_version as number
    const actual = res.get(id)
    // The initial proposal is the first version; later generations don't replace it.
    if (actual && actual.version !== v) continue
    if (!actual) res.set(id, { version: v, fecha: f.dpl_fechabackup, modelo: f.dpl_modeloia ?? null, herramienta: f.dpl_herramientaia ?? null, filas: [f] })
    else actual.filas.push(f)
  }
  for (const p of res.values()) p.filas.sort((a, b) => Number(a.dpl_orden ?? 0) - Number(b.dpl_orden ?? 0))
  return res
}
