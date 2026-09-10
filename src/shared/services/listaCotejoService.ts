// src/shared/services/listaCotejoService.ts
// CRUD service for the tightly-coupled pair "Lista de Cotejo" (dpl_listacotejo)
// and "Indicador de Lista de Cotejo" (dpl_listacotejoindicador) via Supabase.
//
// Column names match the original Dataverse logical names so the existing
// mapListaCotejoEntity()/mapIndicadorEntity() mappers (src/types/listaCotejo.ts)
// keep working unchanged against Supabase rows.

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
  mapIndicadorEntity,
  mapListaCotejoEntity,
  sortIndicadores,
  type CreateIndicadorInput,
  type CreateListaCotejoInput,
  type IndicadorListaCotejo,
  type IndicadorListaCotejoEntity,
  type ListaCotejo,
  type ListaCotejoEntity,
  type RespuestaValue,
  type UpdateIndicadorInput,
  type UpdateListaCotejoInput,
} from '../../types/listaCotejo'

const LISTA_TABLE = 'dpl_listacotejo'
const INDICADOR_TABLE = 'dpl_listacotejoindicador'
const INDICADORES_EMBED = 'dpl_ListaCotejo_ListaCotejoIndicador:dpl_listacotejoindicador(*)'
const SESION_EMBED = 'dpl_SesionId:dpl_sesion(dpl_sesionid,dpl_elemento,dpl_idsesiontext,dpl_tema)'

export const MAX_INDICADORES_EXPAND = 50

const buildSelect = (options?: { includeIndicadores?: boolean; includeSesion?: boolean }): string => {
  const parts = ['*']
  if (options?.includeIndicadores) parts.push(INDICADORES_EMBED)
  if (options?.includeSesion) parts.push(SESION_EMBED)
  return parts.join(', ')
}

const toListaEntity = (row: Record<string, unknown>): ListaCotejoEntity => {
  const withParent = withStateLabel(withLookupValue(row, 'dpl_sesionid'))
  const indicadores = withParent['dpl_ListaCotejo_ListaCotejoIndicador']
  if (Array.isArray(indicadores)) {
    withParent['dpl_ListaCotejo_ListaCotejoIndicador'] = indicadores.map(i =>
      withStateLabel(withLookupValue(i as Record<string, unknown>, 'dpl_listacotejoid')),
    )
  }
  return withParent as ListaCotejoEntity
}

const toIndicadorEntity = (row: Record<string, unknown>): IndicadorListaCotejoEntity =>
  withStateLabel(withLookupValue(row, 'dpl_listacotejoid')) as IndicadorListaCotejoEntity

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildListaCotejoNombreFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_nombre', op: 'contains', value: search })

export const buildListaCotejoPorSesionFilter = (sesionId: string): string =>
  encodeFilter({ field: 'dpl_sesionid', op: 'eq', value: sesionId })

export const buildListaCotejoEstadoFilter = (estado: string): string =>
  encodeFilter({ field: 'dpl_estado', op: 'eq', value: estado })

export const buildListaCotejoActivadoFilter = (activado = true): string =>
  encodeFilter({ field: 'dpl_activado', op: 'eq', value: activado })

export const buildIndicadoresPorListaFilter = (listaCotejoId: string): string =>
  encodeFilter({ field: 'dpl_listacotejoid', op: 'eq', value: listaCotejoId })

export const buildIndicadorRespuestaFilter = (respuesta: RespuestaValue): string =>
  encodeFilter({ field: 'dpl_respuesta', op: 'eq', value: respuesta })

export const buildActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ═══════════════════════════════════════════════════════════════════════════════
// Lista de Cotejo (parent / header)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ListListasCotejoParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeIndicadores?: boolean
  includeSesion?: boolean
  indicadoresTop?: number
}

export const listListasCotejo = async (
  params?: ListListasCotejoParams,
): Promise<PaginatedResult<ListaCotejo>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(LISTA_TABLE).select(buildSelect(params), { count: 'exact' })
  query = applyFilter(query, params?.filter)
  const [column, direction] = (params?.orderBy ?? 'dpl_nombre asc').trim().split(/\s+/)
  query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' })
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las listas de cotejo.')

  const items = (data ?? []).map(toListaEntity).map(mapListaCotejoEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllListasCotejo = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<ListaCotejo[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(LISTA_TABLE).select('*')
    query = applyFilter(query, params?.filter)
    const [column, direction] = (params?.orderBy ?? 'dpl_nombre asc').trim().split(/\s+/)
    query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' })
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toListaEntity).map(mapListaCotejoEntity)
}

export const listListasCotejoPorSesion = async (
  sesionId: string,
  options?: { includeIndicadores?: boolean; pageSize?: number },
): Promise<PaginatedResult<ListaCotejo>> =>
  listListasCotejo({
    filter: buildListaCotejoPorSesionFilter(sesionId),
    includeIndicadores: options?.includeIndicadores,
    pageSize: options?.pageSize,
  })

export const getListaCotejoById = async (
  id: string,
  options?: { includeIndicadores?: boolean; includeSesion?: boolean; indicadoresTop?: number },
): Promise<ListaCotejo | null> => {
  const { data, error } = (await supabase
    .from(LISTA_TABLE)
    .select(buildSelect(options))
    .eq('dpl_listacotejoid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la lista de cotejo.')
  return data ? mapListaCotejoEntity(toListaEntity(data)) : null
}

// ── Create / update / delete: Lista de Cotejo ─────────────────────────────────

const buildListaCotejoRow = (
  payload: CreateListaCotejoInput | UpdateListaCotejoInput,
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

export const createListaCotejo = async (payload: CreateListaCotejoInput): Promise<ListaCotejo> => {
  const row = buildListaCotejoRow(payload, { partial: false })
  const { data, error } = await supabase.from(LISTA_TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la lista de cotejo.')
  return mapListaCotejoEntity(toListaEntity(data))
}

export const updateListaCotejo = async (
  id: string,
  payload: UpdateListaCotejoInput,
): Promise<ListaCotejo> => {
  const row = buildListaCotejoRow(payload, { partial: true })
  const { error } = await supabase.from(LISTA_TABLE).update(row).eq('dpl_listacotejoid', id)
  assertNoError(error, 'No se pudo actualizar la lista de cotejo.')
  const updated = await getListaCotejoById(id)
  if (!updated) throw new Error('No se pudo recuperar la lista de cotejo actualizada.')
  return updated
}

export const deleteListaCotejo = async (id: string): Promise<void> => {
  const { error } = await supabase.from(LISTA_TABLE).delete().eq('dpl_listacotejoid', id)
  assertNoError(error, 'No se pudo eliminar la lista de cotejo.')
}

export const getListaCotejoCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(LISTA_TABLE).select('dpl_listacotejoid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de listas de cotejo.')
  return count ?? 0
}

// ═══════════════════════════════════════════════════════════════════════════════
// Indicador de Lista de Cotejo (child / checklist rows)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ListIndicadoresParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
}

export const listIndicadores = async (
  params?: ListIndicadoresParams,
): Promise<PaginatedResult<IndicadorListaCotejo>> => {
  const pageSize = params?.pageSize ?? 25
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(INDICADOR_TABLE).select('*', { count: 'exact' })
  query = applyFilter(query, params?.filter)
  const [column, direction] = (params?.orderBy ?? 'dpl_orden asc').trim().split(/\s+/)
  query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' })
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar los indicadores.')

  const items = (data ?? []).map(toIndicadorEntity).map(mapIndicadorEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllIndicadores = async (listaCotejoId: string): Promise<IndicadorListaCotejo[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    const query: any = supabase
      .from(INDICADOR_TABLE)
      .select('*')
      .eq('dpl_listacotejoid', listaCotejoId)
      .order('dpl_orden', { ascending: true })
    return query.range(from, to)
  }, 100)
  return sortIndicadores(rows.map(toIndicadorEntity).map(mapIndicadorEntity))
}

export const getIndicadorById = async (id: string): Promise<IndicadorListaCotejo | null> => {
  const { data, error } = await supabase
    .from(INDICADOR_TABLE)
    .select('*')
    .eq('dpl_listacotejoindicadorid', id)
    .maybeSingle()
  assertNoError(error, 'No se pudo cargar el indicador.')
  return data ? mapIndicadorEntity(toIndicadorEntity(data)) : null
}

// ── Create / update / delete: Indicador ───────────────────────────────────────

const buildIndicadorRow = (
  payload: CreateIndicadorInput | UpdateIndicadorInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_indicador', payload.indicador)
  set('dpl_orden', payload.orden)
  set('dpl_puntaje', payload.puntaje)
  set('dpl_respuesta', payload.respuesta)
  set('dpl_observaciones', payload.observaciones)
  set('dpl_listacotejoid', payload.listaCotejoId)
  return row
}

export const createIndicador = async (payload: CreateIndicadorInput): Promise<IndicadorListaCotejo> => {
  const row = buildIndicadorRow(payload, { partial: false })
  const { data, error } = await supabase.from(INDICADOR_TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear el indicador.')
  return mapIndicadorEntity(toIndicadorEntity(data))
}

export const updateIndicador = async (
  id: string,
  payload: UpdateIndicadorInput,
): Promise<IndicadorListaCotejo> => {
  const row = buildIndicadorRow(payload, { partial: true })
  const { error } = await supabase.from(INDICADOR_TABLE).update(row).eq('dpl_listacotejoindicadorid', id)
  assertNoError(error, 'No se pudo actualizar el indicador.')
  const updated = await getIndicadorById(id)
  if (!updated) throw new Error('No se pudo recuperar el indicador actualizado.')
  return updated
}

export const deleteIndicador = async (id: string): Promise<void> => {
  const { error } = await supabase.from(INDICADOR_TABLE).delete().eq('dpl_listacotejoindicadorid', id)
  assertNoError(error, 'No se pudo eliminar el indicador.')
}

// ── Checklist-grid helpers ────────────────────────────────────────────────────

export const saveRespuestaIndicador = async (
  id: string,
  respuesta: RespuestaValue | null,
  observaciones?: string,
): Promise<IndicadorListaCotejo> =>
  updateIndicador(id, { respuesta, ...(observaciones !== undefined ? { observaciones } : {}) })

export const saveIndicadoresBatch = async (
  edits: Array<{ id: string } & UpdateIndicadorInput>,
): Promise<IndicadorListaCotejo[]> => {
  const saved: IndicadorListaCotejo[] = []
  for (const { id, ...payload } of edits) {
    saved.push(await updateIndicador(id, payload))
  }
  return sortIndicadores(saved)
}

export const appendIndicador = async (
  listaCotejoId: string,
  payload: Omit<CreateIndicadorInput, 'listaCotejoId' | 'orden'> & { orden?: number },
  currentIndicadores?: IndicadorListaCotejo[],
): Promise<IndicadorListaCotejo> => {
  const existing = currentIndicadores ?? (await listAllIndicadores(listaCotejoId))
  const nextOrden = payload.orden ?? Math.min(10, Math.max(0, ...existing.map(i => i.orden), 0) + 1)
  return createIndicador({ ...payload, orden: nextOrden, listaCotejoId })
}

export const reordenarIndicadores = async (orderedIds: string[]): Promise<IndicadorListaCotejo[]> =>
  saveIndicadoresBatch(orderedIds.slice(0, 10).map((id, index) => ({ id, orden: index + 1 })))

export const deleteListaCotejoConIndicadores = async (id: string): Promise<void> => {
  const indicadores = await listAllIndicadores(id)
  for (const indicador of indicadores) {
    await deleteIndicador(indicador.id)
  }
  await deleteListaCotejo(id)
}

export const getIndicadorCount = async (listaCotejoId: string): Promise<number> => {
  const { count, error } = await supabase
    .from(INDICADOR_TABLE)
    .select('dpl_listacotejoindicadorid', { count: 'exact', head: true })
    .eq('dpl_listacotejoid', listaCotejoId)
  assertNoError(error, 'No se pudo obtener el total de indicadores.')
  return count ?? 0
}

export const getIndicadorCountByRespuesta = async (
  listaCotejoId: string,
): Promise<Array<{ respuesta: number | null; count: number }>> => {
  const indicadores = await listAllIndicadores(listaCotejoId)
  const groups = new Map<number | null, number>()
  for (const i of indicadores) groups.set(i.respuesta, (groups.get(i.respuesta) ?? 0) + 1)
  return [...groups.entries()].map(([respuesta, count]) => ({ respuesta, count }))
}
