// src/shared/services/matrizPreguntaService.ts
// CRUD service for "Pregunta de Matriz" (dpl_matrizpregunta) via Supabase — the
// row-level operations behind the editable grid.
//
// Column names match the original Dataverse logical names so the existing
// mapMatrizPreguntaEntity() mapper (src/types/matrizPregunta.ts) keeps working
// unchanged against Supabase rows.

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
  mapMatrizPreguntaEntity,
  sortPreguntasByOrden,
  type CreateMatrizPreguntaInput,
  type MatrizPregunta,
  type MatrizPreguntaEntity,
  type PreguntaOrdenChange,
  type UpdateMatrizPreguntaInput,
} from '../../types/matrizPregunta'

const TABLE = 'dpl_matrizpregunta'

export const MATRIZ_PREGUNTA_EXPAND_COLUMNS = [
  'dpl_matrizpreguntaid',
  'dpl_ejetematico',
  'dpl_orden',
  'dpl_taxonomia',
  'dpl_tipoitem',
  'dpl_plataforma',
  'dpl_cantidaditems',
  'dpl_puntajeia',
] as const

const toEntity = (row: Record<string, unknown>): MatrizPreguntaEntity =>
  withLookupValue(row, 'dpl_matrizid') as MatrizPreguntaEntity

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildPreguntasByMatrizFilter = (matrizId: string): string =>
  encodeFilter({ field: 'dpl_matrizid', op: 'eq', value: matrizId })

export const buildEjeTematicoContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_ejetematico', op: 'contains', value: search })

export const buildTaxonomiaFilter = (taxonomia: string): string =>
  encodeFilter({ field: 'dpl_taxonomia', op: 'eq', value: taxonomia })

export const buildTipoItemFilter = (tipoItem: string): string =>
  encodeFilter({ field: 'dpl_tipoitem', op: 'eq', value: tipoItem })

export const combinePreguntaFilters = combineFilterConditions

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListPreguntasParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
}

export const listPreguntas = async (
  params?: ListPreguntasParams,
): Promise<PaginatedResult<MatrizPregunta>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select('*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_orden asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las preguntas.')

  const items = (data ?? []).map(toEntity).map(mapMatrizPreguntaEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listPreguntasByMatriz = async (
  matrizId: string,
  options?: { pageSize?: number },
): Promise<MatrizPregunta[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    const query: any = supabase
      .from(TABLE)
      .select('*')
      .eq('dpl_matrizid', matrizId)
      .order('dpl_orden', { ascending: true })
    return query.range(from, to)
  }, options?.pageSize ?? 50)
  return sortPreguntasByOrden(rows.map(toEntity).map(mapMatrizPreguntaEntity))
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getPreguntaById = async (id: string): Promise<MatrizPregunta | null> => {
  const { data, error } = await supabase
    .from(TABLE)
    .select('*')
    .eq('dpl_matrizpreguntaid', id)
    .maybeSingle()
  assertNoError(error, 'No se pudo cargar la pregunta.')
  return data ? mapMatrizPreguntaEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildPreguntaRow = (
  payload: CreateMatrizPreguntaInput | UpdateMatrizPreguntaInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_ejetematico', payload.ejeTematico)
  set('dpl_orden', payload.orden)
  set('dpl_taxonomia', payload.taxonomia)
  set('dpl_tipoitem', payload.tipoItem)
  set('dpl_plataforma', payload.plataforma)
  set('dpl_cantidaditems', payload.cantidadItems)
  set('dpl_puntajeia', payload.puntajeIA)
  set('dpl_matrizid', payload.matrizId)
  return row
}

export const createPregunta = async (payload: CreateMatrizPreguntaInput): Promise<MatrizPregunta> => {
  if (!payload.matrizId) {
    throw new Error('Se requiere el identificador de la matriz para crear una pregunta.')
  }
  const row = buildPreguntaRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la pregunta.')
  return mapMatrizPreguntaEntity(toEntity(data))
}

export const updatePregunta = async (
  id: string,
  payload: UpdateMatrizPreguntaInput,
): Promise<MatrizPregunta> => {
  const row = buildPreguntaRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_matrizpreguntaid', id)
  assertNoError(error, 'No se pudo actualizar la pregunta.')
  const updated = await getPreguntaById(id)
  if (!updated) throw new Error('No se pudo recuperar la pregunta actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deletePregunta = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_matrizpreguntaid', id)
  assertNoError(error, 'No se pudo eliminar la pregunta.')
}

// ── Reorder ───────────────────────────────────────────────────────────────────

export const reorderPreguntas = async (changes: PreguntaOrdenChange[]): Promise<MatrizPregunta[]> => {
  const updated: MatrizPregunta[] = []
  for (const change of changes) {
    updated.push(await updatePregunta(change.id, { orden: change.orden }))
  }
  return sortPreguntasByOrden(updated)
}

export const normalizePreguntaOrden = async (
  preguntas: MatrizPregunta[],
): Promise<MatrizPregunta[]> => {
  const changes = preguntas
    .map((pregunta, index) => ({ id: pregunta.id, orden: index + 1 }))
    .filter((change, index) => preguntas[index].orden !== change.orden)

  if (changes.length === 0) return sortPreguntasByOrden(preguntas)

  await reorderPreguntas(changes)
  return sortPreguntasByOrden(preguntas.map((pregunta, index) => ({ ...pregunta, orden: index + 1 })))
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getPreguntaCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_matrizpreguntaid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de preguntas.')
  return count ?? 0
}

export const getPreguntaCountByTaxonomia = async (): Promise<Array<{ taxonomia: string; count: number }>> => {
  const rows = await fetchAllRows<Record<string, unknown>>(
    (from, to) => supabase.from(TABLE).select('*').range(from, to),
    100,
  )
  const preguntas = rows.map(toEntity).map(mapMatrizPreguntaEntity)
  const groups = new Map<string, number>()
  for (const p of preguntas) {
    const key = p.taxonomia || 'Sin taxonomía'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([taxonomia, count]) => ({ taxonomia, count }))
}

export const getPreguntaTotalsByMatriz = async (
  matrizId: string,
): Promise<{ totalItems: number; promedioPuntajeIA: number }> => {
  const preguntas = await listPreguntasByMatriz(matrizId)
  const totalItems = preguntas.reduce((sum, p) => sum + p.cantidadItems, 0)
  const promedioPuntajeIA =
    preguntas.length > 0 ? preguntas.reduce((sum, p) => sum + p.puntajeIA, 0) / preguntas.length : 0
  return { totalItems, promedioPuntajeIA }
}
