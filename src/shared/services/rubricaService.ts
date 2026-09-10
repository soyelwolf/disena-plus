// src/shared/services/rubricaService.ts
// CRUD service for the "Rúbrica" table (dpl_rubrica) via Supabase, including the
// embedded read that loads a rubric together with its child "Criterio de
// Rúbrica" rows (see ./rubricaCriterioService.ts for row-level CRUD).
//
// Column names match the original Dataverse logical names so the existing
// mapRubricaEntity() mapper (src/types/rubrica.ts) keeps working unchanged
// against Supabase rows.

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
  mapRubricaEntity,
  type CreateRubricaInput,
  type Rubrica,
  type RubricaEntity,
  type UpdateRubricaInput,
} from '../../types/rubrica'
import { listCriteriosByRubrica } from './rubricaCriterioService'

const TABLE = 'dpl_rubrica'
const CRITERIOS_EMBED = 'dpl_Rubrica_RubricaCriterio:dpl_rubricacriterio(*)'

const toEntity = (row: Record<string, unknown>): RubricaEntity => {
  const withParent = withStateLabel(withLookupValue(row, 'dpl_sesionid'))
  const criterios = withParent['dpl_Rubrica_RubricaCriterio']
  if (Array.isArray(criterios)) {
    withParent['dpl_Rubrica_RubricaCriterio'] = criterios.map(c =>
      withStateLabel(withLookupValue(c as Record<string, unknown>, 'dpl_rubricaid')),
    )
  }
  return withParent as RubricaEntity
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildRubricasDeSesionFilter = (sesionId: string): string =>
  encodeFilter({ field: 'dpl_sesionid', op: 'eq', value: sesionId })

export const buildRubricaNombreContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_nombre', op: 'contains', value: search })

export const buildRubricaEstadoFilter = (estado: string): string =>
  encodeFilter({ field: 'dpl_estado', op: 'eq', value: estado })

export const buildRubricasActivadasFilter = (): string => encodeFilter({ field: 'dpl_activado', op: 'eq', value: true })

export const buildRubricasActivasFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export interface ListRubricasParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeCriterios?: boolean
  criteriosCompletos?: boolean
}

export const listRubricas = async (
  params?: ListRubricasParams,
): Promise<PaginatedResult<Rubrica>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase
    .from(TABLE)
    .select(params?.includeCriterios ? `*, ${CRITERIOS_EMBED}` : '*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_nombre asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las rúbricas.')

  const items = (data ?? []).map(toEntity).map(mapRubricaEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllRubricas = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Rubrica[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select('*')
    query = applyFilter(query, params?.filter)
    query = applyOrderBy(query, params?.orderBy ?? 'dpl_nombre asc')
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapRubricaEntity)
}

export const listRubricasBySesion = async (
  sesionId: string,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica[]> => {
  const result = await listRubricas({
    filter: buildRubricasDeSesionFilter(sesionId),
    orderBy: 'createdon desc',
    includeCriterios: options?.includeCriterios,
    pageSize: 50,
  })
  return result.items
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getRubricaById = async (
  id: string,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(options?.includeCriterios ? `*, ${CRITERIOS_EMBED}` : '*')
    .eq('dpl_rubricaid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la rúbrica.')
  return data ? mapRubricaEntity(toEntity(data)) : null
}

export const getRubricaBySesionId = async (
  sesionId: string,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica | null> => {
  let query: any = supabase
    .from(TABLE)
    .select(options?.includeCriterios ? `*, ${CRITERIOS_EMBED}` : '*')
    .eq('dpl_sesionid', sesionId)
    .order('createdon', { ascending: false })
    .limit(1)

  const { data, error } = await query
  assertNoError(error, 'No se pudo cargar la rúbrica.')
  const row = data?.[0]
  if (!row) return null

  const rubrica = mapRubricaEntity(toEntity(row))
  if (options?.includeCriterios && rubrica.criteriosNextLink) {
    return { ...rubrica, criterios: await listCriteriosByRubrica(rubrica.id), criteriosNextLink: undefined }
  }
  return rubrica
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildRubricaRow = (
  payload: CreateRubricaInput | UpdateRubricaInput,
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

export const createRubrica = async (payload: CreateRubricaInput): Promise<Rubrica> => {
  const row = buildRubricaRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la rúbrica.')
  return mapRubricaEntity(toEntity(data))
}

export const updateRubrica = async (
  id: string,
  payload: UpdateRubricaInput,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica> => {
  const row = buildRubricaRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_rubricaid', id)
  assertNoError(error, 'No se pudo actualizar la rúbrica.')
  const updated = await getRubricaById(id, options)
  if (!updated) throw new Error('No se pudo recuperar la rúbrica actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteRubrica = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_rubricaid', id)
  assertNoError(error, 'No se pudo eliminar la rúbrica.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getRubricaCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_rubricaid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de rúbricas.')
  return count ?? 0
}

export const getRubricaCountByEstado = async (): Promise<Array<{ estado: string; count: number }>> => {
  const rubricas = await listAllRubricas()
  const groups = new Map<string, number>()
  for (const r of rubricas) {
    const key = r.estado || 'Sin estado'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([estado, count]) => ({ estado, count }))
}
