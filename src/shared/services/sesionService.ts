// src/shared/services/sesionService.ts
// CRUD service for the "Sesión / Elemento" table (dpl_sesion) via Supabase.
//
// Column names match the original Dataverse logical names so the existing
// mapSesionEntity() mapper (src/types/sesion.ts) keeps working unchanged
// against Supabase rows — see src/shared/supabaseClient.ts for why.

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
  mapSesionEntity,
  type CreateSesionInput,
  type Sesion,
  type SesionEntity,
  type UpdateSesionInput,
} from '../../types/sesion'

const TABLE = 'dpl_sesion'
const UNIDAD_EMBED =
  'dpl_UnidadId:dpl_unidad(dpl_unidadid,dpl_nombreunidad,dpl_idunidadtext,dpl_numerounidad,dpl_logroespecifico)'

const toEntity = (row: Record<string, unknown>): SesionEntity =>
  withStateLabel(withLookupValue(row, 'dpl_unidadid')) as SesionEntity

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListSesionesParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeUnidad?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildElementoContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_elemento', op: 'contains', value: search })

export const buildTemaContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_tema', op: 'contains', value: search })

export const buildIdSesionTextFilter = (idSesionText: string): string =>
  encodeFilter({ field: 'dpl_idsesiontext', op: 'eq', value: idSesionText })

export const buildUnidadFilter = (unidadId: string): string =>
  encodeFilter({ field: 'dpl_unidadid', op: 'eq', value: unidadId })

export const buildSinUnidadFilter = (): string => encodeFilter({ field: 'dpl_unidadid', op: 'isNull' })

export const buildActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export const listSesiones = async (
  params?: ListSesionesParams,
): Promise<PaginatedResult<Sesion>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase
    .from(TABLE)
    .select(params?.includeUnidad ? `*, ${UNIDAD_EMBED}` : '*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_elemento asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las sesiones.')

  const items = (data ?? []).map(toEntity).map(mapSesionEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllSesiones = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Sesion[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select('*')
    query = applyFilter(query, params?.filter)
    query = applyOrderBy(query, params?.orderBy ?? 'dpl_elemento asc')
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapSesionEntity)
}

export const listSesionesByUnidad = async (
  unidadId: string,
  params?: Omit<ListSesionesParams, 'filter'> & { extraFilter?: string },
): Promise<PaginatedResult<Sesion>> =>
  listSesiones({
    ...params,
    filter: combineFilters(buildUnidadFilter(unidadId), params?.extraFilter),
  })

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getSesionById = async (
  id: string,
  options?: { includeUnidad?: boolean },
): Promise<Sesion | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(options?.includeUnidad ? `*, ${UNIDAD_EMBED}` : '*')
    .eq('dpl_sesionid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la sesión.')
  return data ? mapSesionEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildSesionRow = (
  payload: CreateSesionInput | UpdateSesionInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_elemento', payload.elemento)
  set('dpl_idsesiontext', payload.idSesionText)
  set('dpl_abreviatura', payload.abreviatura)
  set('dpl_tema', payload.tema)
  set('dpl_unidadid', payload.unidadId)
  return row
}

export const createSesion = async (payload: CreateSesionInput): Promise<Sesion> => {
  const row = buildSesionRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la sesión.')
  return mapSesionEntity(toEntity(data))
}

export const updateSesion = async (id: string, payload: UpdateSesionInput): Promise<Sesion> => {
  const row = buildSesionRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_sesionid', id)
  assertNoError(error, 'No se pudo actualizar la sesión.')
  const updated = await getSesionById(id)
  if (!updated) throw new Error('No se pudo recuperar la sesión actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteSesion = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_sesionid', id)
  assertNoError(error, 'No se pudo eliminar la sesión.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getSesionCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_sesionid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de sesiones.')
  return count ?? 0
}

export const getSesionCountByUnidad = async (): Promise<Array<{ unidadId: string; count: number }>> => {
  const sesiones = await listAllSesiones()
  const groups = new Map<string, number>()
  for (const s of sesiones) groups.set(s.unidadId, (groups.get(s.unidadId) ?? 0) + 1)
  return [...groups.entries()].map(([unidadId, count]) => ({ unidadId, count }))
}
