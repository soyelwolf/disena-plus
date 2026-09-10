// src/shared/services/unidadService.ts
// CRUD service for the "Unidad" table (dpl_unidad) via Supabase.
//
// Column names match the original Dataverse logical names so the existing
// mapUnidadEntity() mapper (src/types/unidad.ts) keeps working unchanged
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
  mapUnidadEntity,
  type CreateUnidadInput,
  type Unidad,
  type UnidadEntity,
  type UpdateUnidadInput,
} from '../../types/unidad'

const TABLE = 'dpl_unidad'
const CURSO_EMBED =
  'dpl_CursoId:dpl_curso(dpl_cursoid,dpl_nombrecurso,dpl_idcursotext,dpl_codigocatalogo,dpl_carrera,dpl_ciclo)'
const SESIONES_EMBED =
  'dpl_Unidad_Sesion:dpl_sesion(dpl_sesionid,dpl_elemento,dpl_idsesiontext,dpl_abreviatura,dpl_tema)'

const buildSelect = (options?: { includeCurso?: boolean; includeSesiones?: boolean }): string => {
  const parts = ['*']
  if (options?.includeCurso) parts.push(CURSO_EMBED)
  if (options?.includeSesiones) parts.push(SESIONES_EMBED)
  return parts.join(', ')
}

const toEntity = (row: Record<string, unknown>): UnidadEntity =>
  withStateLabel(withLookupValue(row, 'dpl_cursoid')) as UnidadEntity

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListUnidadesParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeCurso?: boolean
  includeSesiones?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildNombreContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_nombreunidad', op: 'contains', value: search })

export const buildCursoFilter = (cursoId: string): string =>
  encodeFilter({ field: 'dpl_cursoid', op: 'eq', value: cursoId })

export const buildNumeroFilter = (numero: number): string =>
  encodeFilter({ field: 'dpl_numerounidad', op: 'eq', value: Math.trunc(numero) })

export const buildIdUnidadTextFilter = (idUnidadText: string): string =>
  encodeFilter({ field: 'dpl_idunidadtext', op: 'eq', value: idUnidadText })

export const buildActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export const listUnidades = async (
  params?: ListUnidadesParams,
): Promise<PaginatedResult<Unidad>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select(buildSelect(params), { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_numerounidad asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las unidades.')

  const items = (data ?? []).map(toEntity).map(mapUnidadEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllUnidades = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
  includeCurso?: boolean
}): Promise<Unidad[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select(buildSelect(params))
    query = applyFilter(query, params?.filter)
    query = applyOrderBy(query, params?.orderBy ?? 'dpl_numerounidad asc')
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapUnidadEntity)
}

export const listUnidadesByCurso = async (
  cursoId: string,
  params?: Omit<ListUnidadesParams, 'filter'>,
): Promise<PaginatedResult<Unidad>> => listUnidades({ ...params, filter: buildCursoFilter(cursoId) })

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getUnidadById = async (
  id: string,
  options?: { includeCurso?: boolean; includeSesiones?: boolean },
): Promise<Unidad | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(buildSelect(options))
    .eq('dpl_unidadid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la unidad.')
  return data ? mapUnidadEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildUnidadRow = (
  payload: CreateUnidadInput | UpdateUnidadInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_nombreunidad', payload.nombre)
  set('dpl_idunidadtext', payload.idUnidadText)
  set('dpl_numerounidad', payload.numero)
  set('dpl_logroespecifico', payload.logroEspecifico)
  set('dpl_cursoid', payload.cursoId)
  return row
}

export const createUnidad = async (payload: CreateUnidadInput): Promise<Unidad> => {
  const row = buildUnidadRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la unidad.')
  return mapUnidadEntity(toEntity(data))
}

export const updateUnidad = async (id: string, payload: UpdateUnidadInput): Promise<Unidad> => {
  const row = buildUnidadRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_unidadid', id)
  assertNoError(error, 'No se pudo actualizar la unidad.')
  const updated = await getUnidadById(id)
  if (!updated) throw new Error('No se pudo recuperar la unidad actualizada.')
  return updated
}

export const setUnidadCurso = async (id: string, cursoId: string | null): Promise<Unidad> =>
  updateUnidad(id, { cursoId })

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteUnidad = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_unidadid', id)
  assertNoError(error, 'No se pudo eliminar la unidad.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getUnidadCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_unidadid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de unidades.')
  return count ?? 0
}

export const getUnidadCountByCurso = async (cursoId: string): Promise<number> =>
  getUnidadCount(buildCursoFilter(cursoId))

export const getUnidadCountGroupedByCurso = async (params?: {
  filter?: string
  pageSize?: number
}): Promise<Array<{ cursoId: string; cursoNombre: string; count: number }>> => {
  const unidades = await listAllUnidades({
    filter: params?.filter,
    pageSize: params?.pageSize ?? 100,
    includeCurso: true,
  })

  const groups = new Map<string, { cursoId: string; cursoNombre: string; count: number }>()
  for (const unidad of unidades) {
    const cursoId = unidad.curso?.id ?? unidad.cursoId ?? ''
    const existing = groups.get(cursoId)
    if (existing) {
      existing.count += 1
      continue
    }
    groups.set(cursoId, {
      cursoId,
      cursoNombre: unidad.curso?.nombre || unidad.cursoNombre || 'Sin curso',
      count: 1,
    })
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)
}
