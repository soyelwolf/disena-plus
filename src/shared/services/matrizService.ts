// src/shared/services/matrizService.ts
// CRUD service for the "Matriz" table (dpl_matriz) via Supabase, including the
// embedded read of its child "Pregunta de Matriz" collection.
//
// Column names match the original Dataverse logical names so the existing
// mapMatrizEntity() mapper (src/types/matriz.ts) keeps working unchanged
// against Supabase rows. Note: dpl_matriz has no statecode/statuscode columns,
// matching the original Dataverse table.

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
  type PaginatedResult,
} from '../supabaseClient'
import {
  mapMatrizEntity,
  type CreateMatrizInput,
  type Matriz,
  type MatrizEntity,
  type UpdateMatrizInput,
} from '../../types/matriz'

const TABLE = 'dpl_matriz'
const PREGUNTAS_EMBED = 'dpl_Matriz_MatrizPregunta:dpl_matrizpregunta(*)'
const SESION_EMBED = 'dpl_SesionId:dpl_sesion(dpl_sesionid,dpl_elemento)'

const buildSelect = (options?: { includePreguntas?: boolean; includeSesion?: boolean }): string => {
  const parts = ['*']
  if (options?.includePreguntas) parts.push(PREGUNTAS_EMBED)
  if (options?.includeSesion) parts.push(SESION_EMBED)
  return parts.join(', ')
}

const toEntity = (row: Record<string, unknown>): MatrizEntity => {
  const withParent = withLookupValue(row, 'dpl_sesionid')
  const preguntas = withParent['dpl_Matriz_MatrizPregunta']
  if (Array.isArray(preguntas)) {
    withParent['dpl_Matriz_MatrizPregunta'] = preguntas.map(p =>
      withLookupValue(p as Record<string, unknown>, 'dpl_matrizid'),
    )
  }
  return withParent as MatrizEntity
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildMatrizNombreContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_nombre', op: 'contains', value: search })

export const buildMatrizBySesionFilter = (sesionId: string): string =>
  encodeFilter({ field: 'dpl_sesionid', op: 'eq', value: sesionId })

export const buildMatrizEstadoFilter = (estado: string): string =>
  encodeFilter({ field: 'dpl_estado', op: 'eq', value: estado })

export const buildMatrizActivadasFilter = (activado = true): string =>
  encodeFilter({ field: 'dpl_activado', op: 'eq', value: activado })

export const combineMatrizFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export interface ListMatrizsParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includePreguntas?: boolean
  includeSesion?: boolean
}

export const listMatrizs = async (
  params?: ListMatrizsParams,
): Promise<PaginatedResult<Matriz>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select(buildSelect(params), { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_nombre asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las matrices.')

  const items = (data ?? []).map(toEntity).map(mapMatrizEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllMatrizs = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Matriz[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select('*')
    query = applyFilter(query, params?.filter)
    query = applyOrderBy(query, params?.orderBy ?? 'dpl_nombre asc')
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapMatrizEntity)
}

export const listMatrizsBySesion = async (
  sesionId: string,
  params?: Omit<ListMatrizsParams, 'filter'>,
): Promise<PaginatedResult<Matriz>> =>
  listMatrizs({ ...params, filter: buildMatrizBySesionFilter(sesionId) })

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getMatrizById = async (
  id: string,
  options?: { includePreguntas?: boolean; includeSesion?: boolean },
): Promise<Matriz | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(buildSelect(options))
    .eq('dpl_matrizid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la matriz.')
  return data ? mapMatrizEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildMatrizRow = (
  payload: CreateMatrizInput | UpdateMatrizInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_nombre', payload.nombre)
  set('dpl_estado', payload.estado)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)
  set('dpl_sesionid', payload.sesionId)
  return row
}

export const createMatriz = async (payload: CreateMatrizInput): Promise<Matriz> => {
  const row = buildMatrizRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la matriz.')
  return mapMatrizEntity(toEntity(data))
}

export const updateMatriz = async (id: string, payload: UpdateMatrizInput): Promise<Matriz> => {
  const row = buildMatrizRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_matrizid', id)
  assertNoError(error, 'No se pudo actualizar la matriz.')
  const updated = await getMatrizById(id)
  if (!updated) throw new Error('No se pudo recuperar la matriz actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteMatriz = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_matrizid', id)
  assertNoError(error, 'No se pudo eliminar la matriz.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getMatrizCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_matrizid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de matrices.')
  return count ?? 0
}

export const getMatrizCountByEstado = async (): Promise<Array<{ estado: string; count: number }>> => {
  const matrices = await listAllMatrizs()
  const groups = new Map<string, number>()
  for (const m of matrices) {
    const key = m.estado || 'Sin estado'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([estado, count]) => ({ estado, count }))
}
