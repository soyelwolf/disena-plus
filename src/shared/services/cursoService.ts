// src/shared/services/cursoService.ts
// CRUD service for the "Curso" table (dpl_curso) via Supabase.
//
// Column names match the original Dataverse logical names so the existing
// mapCursoEntity() mapper (src/types/curso.ts) keeps working unchanged against
// Supabase rows — see src/shared/supabaseClient.ts for why.

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
  withStateLabel,
  type PaginatedResult,
} from '../supabaseClient'
import {
  mapCursoEntity,
  type CreateCursoInput,
  type Curso,
  type CursoEntity,
  type UpdateCursoInput,
} from '../../types/curso'

const TABLE = 'dpl_curso'
const UNIDADES_EMBED =
  'dpl_Curso_Unidad:dpl_unidad(dpl_unidadid,dpl_nombreunidad,dpl_idunidadtext,dpl_numerounidad)'

const toEntity = (row: Record<string, unknown>): CursoEntity => withStateLabel(row) as CursoEntity

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListCursosParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeUnidades?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildNombreContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_nombrecurso', op: 'contains', value: search })

export const buildCarreraFilter = (carrera: string): string =>
  encodeFilter({ field: 'dpl_carrera', op: 'eq', value: carrera })

export const buildCicloFilter = (ciclo: number): string =>
  encodeFilter({ field: 'dpl_ciclo', op: 'eq', value: Math.trunc(ciclo) })

export const buildActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export const listCursos = async (params?: ListCursosParams): Promise<PaginatedResult<Curso>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase
    .from(TABLE)
    .select(params?.includeUnidades ? `*, ${UNIDADES_EMBED}` : '*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_nombrecurso asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar los cursos.')

  const items = (data ?? []).map(toEntity).map(mapCursoEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllCursos = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Curso[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select('*')
    query = applyFilter(query, params?.filter)
    query = applyOrderBy(query, params?.orderBy ?? 'dpl_nombrecurso asc')
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapCursoEntity)
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getCursoById = async (
  id: string,
  options?: { includeUnidades?: boolean },
): Promise<Curso | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(options?.includeUnidades ? `*, ${UNIDADES_EMBED}` : '*')
    .eq('dpl_cursoid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar el curso.')
  return data ? mapCursoEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildCursoRow = (
  payload: CreateCursoInput | UpdateCursoInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_nombrecurso', payload.nombre)
  set('dpl_idcursotext', payload.idCursoText)
  set('dpl_codigocatalogo', payload.codigoCatalogo)
  set('dpl_carrera', payload.carrera)
  set('dpl_tipoensenanza', payload.tipoEnsenanza)
  set('dpl_ciclo', payload.ciclo)
  set('dpl_logrocurso', payload.logroCurso)
  set('dpl_permiteconsignas', payload.permiteConsignas)
  set('dpl_permiterubricas', payload.permiteRubricas)
  set('dpl_permitematrizsn', payload.permiteMatrizSN)
  set('dpl_permitelistacotejo', payload.permiteListaCotejo)
  set('dpl_permiteescala', payload.permiteEscala)
  return row
}

export const createCurso = async (payload: CreateCursoInput): Promise<Curso> => {
  const row = buildCursoRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear el curso.')
  return mapCursoEntity(toEntity(data))
}

export const updateCurso = async (id: string, payload: UpdateCursoInput): Promise<Curso> => {
  const row = buildCursoRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_cursoid', id)
  assertNoError(error, 'No se pudo actualizar el curso.')
  const updated = await getCursoById(id)
  if (!updated) throw new Error('No se pudo recuperar el curso actualizado.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteCurso = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_cursoid', id)
  assertNoError(error, 'No se pudo eliminar el curso.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getCursoCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_cursoid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de cursos.')
  return count ?? 0
}

export const getCursoCountByCarrera = async (): Promise<Array<{ carrera: string; count: number }>> => {
  const cursos = await listAllCursos()
  const groups = new Map<string, number>()
  for (const c of cursos) {
    const key = c.carrera || 'Sin carrera'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([carrera, count]) => ({ carrera, count }))
}
