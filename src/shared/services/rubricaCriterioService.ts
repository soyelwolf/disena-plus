// src/shared/services/rubricaCriterioService.ts
// CRUD service for "Criterio de Rúbrica" (dpl_rubricacriterio) via Supabase —
// the individual rows of a rubric's editable grid.
//
// Column names match the original Dataverse logical names so the existing
// mapRubricaCriterioEntity() mapper (src/types/rubricaCriterio.ts) keeps
// working unchanged against Supabase rows.

import {
  applyFilter,
  applyOrderBy,
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
  mapRubricaCriterioEntity,
  sortCriteriosByOrden,
  type CreateRubricaCriterioInput,
  type RubricaCriterio,
  type RubricaCriterioEntity,
  type UpdateRubricaCriterioInput,
} from '../../types/rubricaCriterio'

const TABLE = 'dpl_rubricacriterio'

export const CRITERIO_RESUMEN_SELECT = [
  'dpl_rubricacriterioid',
  'dpl_criterio',
  'dpl_orden',
  'dpl_puntajeestandar',
  'dpl_puntajeenproceso2',
  'dpl_puntajeenproceso1',
  'dpl_puntajeinicial',
]

export const CRITERIO_SELECT = '*'

const toEntity = (row: Record<string, unknown>): RubricaCriterioEntity =>
  withStateLabel(withLookupValue(row, 'dpl_rubricaid')) as RubricaCriterioEntity

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildCriteriosDeRubricaFilter = (rubricaId: string): string =>
  encodeFilter({ field: 'dpl_rubricaid', op: 'eq', value: rubricaId })

export const buildCriterioContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_criterio', op: 'contains', value: search })

export const buildCriteriosActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListCriteriosParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
}

export const listRubricaCriterios = async (
  params?: ListCriteriosParams,
): Promise<PaginatedResult<RubricaCriterio>> => {
  const pageSize = params?.pageSize ?? 25
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select('*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_orden asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar los criterios.')

  const items = (data ?? []).map(toEntity).map(mapRubricaCriterioEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listCriteriosByRubrica = async (rubricaId: string): Promise<RubricaCriterio[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select('*').eq('dpl_rubricaid', rubricaId)
    query = query.order('dpl_orden', { ascending: true })
    return query.range(from, to)
  }, 50)
  return sortCriteriosByOrden(rows.map(toEntity).map(mapRubricaCriterioEntity))
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getRubricaCriterioById = async (id: string): Promise<RubricaCriterio | null> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('dpl_rubricacriterioid', id)
    .maybeSingle()
  assertNoError(error, 'No se pudo cargar el criterio.')
  return data ? mapRubricaCriterioEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildCriterioRow = (
  payload: CreateRubricaCriterioInput | UpdateRubricaCriterioInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_criterio', payload.criterio)
  set('dpl_orden', payload.orden)
  set('dpl_definicioncriterio', payload.definicionCriterio)
  set('dpl_estandaresperado', payload.estandarEsperado)
  set('dpl_puntajeestandar', payload.puntajeEstandar)
  set('dpl_enproceso2', payload.enProceso2)
  set('dpl_puntajeenproceso2', payload.puntajeEnProceso2)
  set('dpl_enproceso1', payload.enProceso1)
  set('dpl_puntajeenproceso1', payload.puntajeEnProceso1)
  set('dpl_inicial', payload.inicial)
  set('dpl_puntajeinicial', payload.puntajeInicial)
  set('dpl_rubricaid', payload.rubricaId)
  return row
}

export const createRubricaCriterio = async (
  payload: CreateRubricaCriterioInput,
): Promise<RubricaCriterio> => {
  const row = buildCriterioRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear el criterio.')
  return mapRubricaCriterioEntity(toEntity(data))
}

export const updateRubricaCriterio = async (
  id: string,
  payload: UpdateRubricaCriterioInput,
): Promise<RubricaCriterio> => {
  const row = buildCriterioRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_rubricacriterioid', id)
  assertNoError(error, 'No se pudo actualizar el criterio.')
  const updated = await getRubricaCriterioById(id)
  if (!updated) throw new Error('No se pudo recuperar el criterio actualizado.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteRubricaCriterio = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_rubricacriterioid', id)
  assertNoError(error, 'No se pudo eliminar el criterio.')
}

// ── Reorder ───────────────────────────────────────────────────────────────────

export const reorderRubricaCriterios = async (orderedIds: string[]): Promise<void> => {
  for (let index = 0; index < orderedIds.length; index++) {
    await updateRubricaCriterio(orderedIds[index], { orden: index + 1 })
  }
}

// ── Count ─────────────────────────────────────────────────────────────────────

export const getCriterioCountByRubrica = async (rubricaId: string): Promise<number> => {
  const { count, error } = await supabase
    .from(TABLE)
    .select('dpl_rubricacriterioid', { count: 'exact', head: true })
    .eq('dpl_rubricaid', rubricaId)
  assertNoError(error, 'No se pudo obtener el total de criterios.')
  return count ?? 0
}
