// src/shared/academico.ts
// Data access for the "Diseño de contenido académico" process: the course
// context (programmes, units, elements, consignas), rubrics with their criteria
// and per-programme competencias, and the edit → approval workflow.
//
// Queries go straight to Supabase with plain `dpl_` rows — these screens need
// cross-table views (a whole course at once) that the older one-table services
// were not built for.

import { supabase } from './supabaseClient'

// ── Limits & instrument catalogue ────────────────────────────────────────────

/** Max characters per field. One place to change them. */
export const LIMITES = {
  consigna: 1000,
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
}

export interface Elemento {
  sesionId: string
  nombre: string
  idSesionText: string | null
  unidadId: string
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
      .select('dpl_unidadid, dpl_nombreunidad, dpl_numerounidad, dpl_logroespecifico')
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
    sesiones = ss ?? []
    const sesionIds = sesiones.map(s => s.dpl_sesionid as string)
    if (sesionIds.length) {
      const { data: cs, error: e5 } = await supabase
        .from('dpl_consigna')
        .select(
          'dpl_consignaid, dpl_idconsignatext, dpl_indicaciongeneral, dpl_indicacionesespecificas, dpl_recomendaciones, dpl_anexo, dpl_instrumento, dpl_sesionid',
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

export type ConsignaCampos = Pick<
  ConsignaRow,
  'dpl_indicaciongeneral' | 'dpl_indicacionesespecificas' | 'dpl_recomendaciones' | 'dpl_anexo' | 'dpl_instrumento'
>

export const CAMPOS_CONSIGNA: Array<{ key: keyof ConsignaCampos; label: string; opcional?: boolean }> = [
  { key: 'dpl_indicaciongeneral', label: 'Indicación general' },
  { key: 'dpl_indicacionesespecificas', label: 'Indicaciones específicas' },
  { key: 'dpl_recomendaciones', label: 'Recomendaciones' },
  { key: 'dpl_anexo', label: 'Anexo (Opcional)', opcional: true },
]

export interface ConsignaValidacion {
  completa: boolean
  errores: Partial<Record<keyof ConsignaCampos, string>>
}

export function validarConsigna(c: Partial<ConsignaCampos> | null): ConsignaValidacion {
  const errores: ConsignaValidacion['errores'] = {}
  if (!c?.dpl_instrumento) errores.dpl_instrumento = 'Elige un instrumento.'
  for (const campo of CAMPOS_CONSIGNA) {
    const v = (c?.[campo.key] ?? '').trim()
    if (!v && !campo.opcional) errores[campo.key] = 'Completar información'
    else if (v.length > LIMITES.consigna) errores[campo.key] = 'Excediste el número de caracteres'
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
      dpl_idconsignatext: [idCursoText, elemento.idSesionText].filter(Boolean).join('-') || null,
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
  elementos: RubricaElemento[]
  competencias: CompetenciaCurso[]
  selecciones: SeleccionCompetencia[]
  /** False until schema-flujo.sql adds dpl_programaid to the selection table. */
  seleccionPorPrograma: boolean
}

/** Elements that use a rubric: their consigna chose "Rúbrica", or a rubric already exists for them. */
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

  const elementos: RubricaElemento[] = ctx.elementos
    .filter(e => tipoInstrumento(e.consigna?.dpl_instrumento) === 'rubrica' || rubricaPorSesion.has(e.sesionId))
    .map(e => {
      const rubricaId = rubricaPorSesion.get(e.sesionId) ?? null
      return { elemento: e, rubricaId, criterios: criterios.filter(c => c.dpl_rubricaid === rubricaId) }
    })

  return { elementos, competencias, selecciones, seleccionPorPrograma }
}

export function totalEstandar(criterios: Array<Pick<CriterioRow, 'dpl_puntajeestandar'>>): number {
  return criterios.reduce((s, c) => s + (Number(c.dpl_puntajeestandar) || 0), 0)
}

export type ProblemaRubrica = 'sin_criterios' | 'suma'

export function problemaElemento(r: RubricaElemento): ProblemaRubrica | null {
  if (r.criterios.length === 0) return 'sin_criterios'
  if (totalEstandar(r.criterios) !== PUNTAJE_OBJETIVO) return 'suma'
  return null
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
export type InstrumentoFlujo = 'consignas' | 'rubricas'

export const ESTADO_LABEL: Record<EstadoProceso, string> = {
  en_edicion: 'En edición',
  revision_monitor: 'En revisión · Monitor EA',
  revision_dda: 'En revisión · DDA',
  aprobado: 'Aprobado',
}

export interface EventoProceso {
  id: string
  accion: 'finalizado' | 'enviado' | 'aprobado' | 'devuelto' | 'habilitado'
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
  finalizado: { consignas: false, rubricas: false },
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
  cambios: Partial<{ estado: EstadoProceso; consignas: boolean; rubricas: boolean }>,
): Promise<void> {
  const row: Record<string, unknown> = {
    dpl_cursoid: cursoId,
    dpl_proceso: PROCESO,
    modifiedon: new Date().toISOString(),
  }
  if (cambios.estado) row.dpl_estado = cambios.estado
  if (cambios.consignas !== undefined) row.dpl_consignas_finalizado = cambios.consignas
  if (cambios.rubricas !== undefined) row.dpl_rubricas_finalizado = cambios.rubricas
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
}

/** Which instruments this course must finalize before the process goes to review. */
export function instrumentosRequeridos(ctx: CursoContexto, rubricas: RubricasCurso | null): InstrumentoFlujo[] {
  const req: InstrumentoFlujo[] = ['consignas']
  const usaRubrica = rubricas
    ? rubricas.elementos.length > 0
    : ctx.elementos.some(e => tipoInstrumento(e.consigna?.dpl_instrumento) === 'rubrica')
  if (usaRubrica) req.push('rubricas')
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
  await guardarProceso(cursoId, { estado: 'en_edicion', consignas: false, rubricas: false })
  await registrarEvento(cursoId, { accion: 'devuelto', rol, usuario, comentario })
}

/** Monitor EA re-opens editing (also after DDA approval). Approval starts over. */
export async function habilitarEdicion(cursoId: string, usuario: string, comentario?: string): Promise<void> {
  await guardarProceso(cursoId, { estado: 'en_edicion', consignas: false, rubricas: false })
  await registrarEvento(cursoId, { accion: 'habilitado', rol: 'monitor_ea', usuario, comentario })
}

// ── Comments ─────────────────────────────────────────────────────────────────

export interface Comentario {
  id: string
  entidadId: string
  autor: string
  rol: string
  texto: string
  fecha: string
}

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
    autor: c.dpl_autor ?? '',
    rol: c.dpl_rol ?? '',
    texto: c.dpl_texto,
    fecha: c.createdon,
  }))
}

export async function agregarComentario(params: {
  cursoId: string
  instrumento: InstrumentoFlujo
  entidadId: string
  autor: string
  rol: string
  texto: string
}): Promise<void> {
  const { error } = await supabase.from('dpl_comentario').insert({
    dpl_cursoid: params.cursoId,
    dpl_instrumento: params.instrumento,
    dpl_entidadid: params.entidadId,
    dpl_autor: params.autor,
    dpl_rol: params.rol,
    dpl_texto: params.texto,
  })
  fail(error, 'No se pudo guardar el comentario.')
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
