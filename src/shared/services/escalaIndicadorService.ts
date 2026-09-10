// src/shared/services/escalaIndicadorService.ts
// CRUD service for "Indicador de Escala" (dpl_escalaindicador) via Supabase.
//
// Column names match the original Dataverse logical names so the existing
// mapEscalaIndicadorEntity() mapper (src/types/escalaIndicador.ts) keeps
// working unchanged against Supabase rows.

import {
  applyFilter,
  assertNoError,
  buildPaginatedResult,
  combineFilterConditions,
  encodeFilter,
  fetchAllRows,
  parseOffset,
  supabase,
  withLookupValue,
  withStateLabel,
  type PaginatedResult,
} from '../supabaseClient'
import {
  mapEscalaIndicadorEntity,
  respuestaStoredValue,
  sortIndicadores,
  type CreateEscalaIndicadorInput,
  type EscalaIndicador,
  type EscalaIndicadorEntity,
  type EvaluacionIndicadorInput,
  type UpdateEscalaIndicadorInput,
} from '../../types/escalaIndicador'

const TABLE = 'dpl_escalaindicador'

export const ESCALA_INDICADOR_SELECT_COLUMNS = [
  'dpl_escalaindicadorid',
  'dpl_indicador',
  'dpl_orden',
  'dpl_puntajeexcelente',
  'dpl_puntajebueno',
  'dpl_puntajeregular',
  'dpl_puntajeconerrores',
  'dpl_puntajenoevidenciado',
  'dpl_respuestaseleccionada',
  'dpl_observaciones',
] as const

const toEntity = (row: Record<string, unknown>): EscalaIndicadorEntity =>
  withStateLabel(withLookupValue(row, 'dpl_escalavaloracionid')) as EscalaIndicadorEntity

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildIndicadoresDeEscalaFilter = (escalaValoracionId: string): string =>
  encodeFilter({ field: 'dpl_escalavaloracionid', op: 'eq', value: escalaValoracionId })

export const buildIndicadorContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_indicador', op: 'contains', value: search })

export const buildSinRespuestaFilter = (): string =>
  encodeFilter({ field: 'dpl_respuestaseleccionada', op: 'isNull' })

export const buildIndicadoresActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineIndicadorFilters = combineFilterConditions

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListEscalaIndicadoresParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
}

export const listEscalaIndicadores = async (
  params?: ListEscalaIndicadoresParams,
): Promise<PaginatedResult<EscalaIndicador>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select('*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  const [column, direction] = (params?.orderBy ?? 'dpl_orden asc').trim().split(/\s+/)
  query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' })
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar los indicadores.')

  const items = (data ?? []).map(toEntity).map(mapEscalaIndicadorEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listIndicadoresByEscala = async (
  escalaValoracionId: string,
  options?: { pageSize?: number; extraFilter?: string },
): Promise<EscalaIndicador[]> => {
  void options?.extraFilter
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    const query: any = supabase
      .from(TABLE)
      .select('*')
      .eq('dpl_escalavaloracionid', escalaValoracionId)
      .order('dpl_orden', { ascending: true })
    return query.range(from, to)
  }, options?.pageSize ?? 50)
  return sortIndicadores(rows.map(toEntity).map(mapEscalaIndicadorEntity))
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getEscalaIndicadorById = async (id: string): Promise<EscalaIndicador | null> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('dpl_escalaindicadorid', id)
    .maybeSingle()
  assertNoError(error, 'No se pudo cargar el indicador.')
  return data ? mapEscalaIndicadorEntity(toEntity(data)) : null
}

// ── Body builder ──────────────────────────────────────────────────────────────

const buildEscalaIndicadorRow = (
  payload: CreateEscalaIndicadorInput | UpdateEscalaIndicadorInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_indicador', payload.indicador)
  set('dpl_orden', payload.orden)
  set('dpl_puntajeexcelente', payload.puntajeExcelente)
  set('dpl_puntajebueno', payload.puntajeBueno)
  set('dpl_puntajeregular', payload.puntajeRegular)
  set('dpl_puntajeconerrores', payload.puntajeConErrores)
  set('dpl_puntajenoevidenciado', payload.puntajeNoEvidenciado)
  set('dpl_observaciones', payload.observaciones)
  if (!partial || payload.respuesta !== undefined) {
    row['dpl_respuestaseleccionada'] = respuestaStoredValue(payload.respuesta ?? null)
  }
  set('dpl_escalavaloracionid', payload.escalaValoracionId)
  return row
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createEscalaIndicador = async (
  payload: CreateEscalaIndicadorInput,
): Promise<EscalaIndicador> => {
  const row = buildEscalaIndicadorRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear el indicador.')
  return mapEscalaIndicadorEntity(toEntity(data))
}

export const createEscalaIndicadores = async (
  escalaValoracionId: string,
  rows: Array<Omit<CreateEscalaIndicadorInput, 'escalaValoracionId'>>,
): Promise<EscalaIndicador[]> => {
  const created: EscalaIndicador[] = []
  for (const row of rows) {
    created.push(await createEscalaIndicador({ ...row, escalaValoracionId }))
  }
  return sortIndicadores(created)
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateEscalaIndicador = async (
  id: string,
  payload: UpdateEscalaIndicadorInput,
): Promise<EscalaIndicador> => {
  const row = buildEscalaIndicadorRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_escalaindicadorid', id)
  assertNoError(error, 'No se pudo actualizar el indicador.')
  const updated = await getEscalaIndicadorById(id)
  if (!updated) throw new Error('No se pudo recuperar el indicador actualizado.')
  return updated
}

export const saveEvaluacionIndicador = async (
  input: EvaluacionIndicadorInput,
): Promise<EscalaIndicador> =>
  updateEscalaIndicador(input.id, {
    respuesta: input.respuesta,
    ...(input.observaciones !== undefined ? { observaciones: input.observaciones } : {}),
  })

export const saveEvaluacionIndicadores = async (
  inputs: EvaluacionIndicadorInput[],
): Promise<EscalaIndicador[]> => {
  const saved: EscalaIndicador[] = []
  for (const input of inputs) {
    saved.push(await saveEvaluacionIndicador(input))
  }
  return sortIndicadores(saved)
}

export const reorderEscalaIndicador = async (id: string, orden: number): Promise<EscalaIndicador> =>
  updateEscalaIndicador(id, { orden })

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteEscalaIndicador = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_escalaindicadorid', id)
  assertNoError(error, 'No se pudo eliminar el indicador.')
}

export const deleteIndicadoresByEscala = async (escalaValoracionId: string): Promise<number> => {
  const rows = await listIndicadoresByEscala(escalaValoracionId)
  for (const row of rows) {
    await deleteEscalaIndicador(row.id)
  }
  return rows.length
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getEscalaIndicadorCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_escalaindicadorid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de indicadores.')
  return count ?? 0
}

export const getIndicadorCountByRespuesta = async (
  escalaValoracionId?: string,
): Promise<Array<{ respuesta: string; count: number }>> => {
  let query: any = supabase.from(TABLE).select('dpl_respuestaseleccionada')
  if (escalaValoracionId) query = query.eq('dpl_escalavaloracionid', escalaValoracionId)
  const { data, error } = await query
  assertNoError(error, 'No se pudo agrupar los indicadores.')
  const groups = new Map<string, number>()
  for (const row of data ?? []) {
    const key = (row.dpl_respuestaseleccionada as string | null) ?? 'Sin evaluar'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([respuesta, count]) => ({ respuesta, count }))
}
