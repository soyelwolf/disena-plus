// src/shared/services/escalaValoracionService.ts
// CRUD service for the "Escala de Valoración" table (dpl_escalavaloracion) via
// Supabase, including the embedded read that loads a scale together with its
// child "Indicador de Escala" rows (see ./escalaIndicadorService.ts for
// row-level CRUD).
//
// Column names match the original Dataverse logical names so the existing
// mapEscalaValoracionEntity() mapper (src/types/escalaValoracion.ts) keeps
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
  mapEscalaValoracionEntity,
  type CreateEscalaValoracionInput,
  type EscalaValoracion,
  type EscalaValoracionEntity,
  type UpdateEscalaValoracionInput,
} from '../../types/escalaValoracion'
import { listIndicadoresByEscala } from './escalaIndicadorService'

const TABLE = 'dpl_escalavaloracion'
const INDICADORES_EMBED = 'dpl_EscalaValoracion_EscalaIndicador:dpl_escalaindicador(*)'

const toEntity = (row: Record<string, unknown>): EscalaValoracionEntity => {
  const withParent = withStateLabel(withLookupValue(row, 'dpl_sesionid'))
  const indicadores = withParent['dpl_EscalaValoracion_EscalaIndicador']
  if (Array.isArray(indicadores)) {
    withParent['dpl_EscalaValoracion_EscalaIndicador'] = indicadores.map(i =>
      withStateLabel(withLookupValue(i as Record<string, unknown>, 'dpl_escalavaloracionid')),
    )
  }
  return withParent as EscalaValoracionEntity
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildEscalasDeSesionFilter = (sesionId: string): string =>
  encodeFilter({ field: 'dpl_sesionid', op: 'eq', value: sesionId })

export const buildEscalaNombreContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_nombre', op: 'contains', value: search })

export const buildEscalaEstadoFilter = (estado: string): string =>
  encodeFilter({ field: 'dpl_estado', op: 'eq', value: estado })

export const buildEscalasActivadasFilter = (): string => encodeFilter({ field: 'dpl_activado', op: 'eq', value: true })

export const buildEscalasActivasFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export interface ListEscalaValoracionesParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeIndicadores?: boolean
}

const buildSelect = (params?: { includeIndicadores?: boolean }): string =>
  params?.includeIndicadores ? `*, ${INDICADORES_EMBED}` : '*'

export const listEscalaValoraciones = async (
  params?: ListEscalaValoracionesParams,
): Promise<PaginatedResult<EscalaValoracion>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select(buildSelect(params), { count: 'exact' })
  query = applyFilter(query, params?.filter)
  const [column, direction] = (params?.orderBy ?? 'dpl_nombre asc').trim().split(/\s+/)
  query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' })
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las escalas de valoración.')

  const items = (data ?? []).map(toEntity).map(mapEscalaValoracionEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllEscalaValoraciones = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<EscalaValoracion[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select('*')
    query = applyFilter(query, params?.filter)
    const [column, direction] = (params?.orderBy ?? 'dpl_nombre asc').trim().split(/\s+/)
    query = query.order(column, { ascending: direction?.toLowerCase() !== 'desc' })
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapEscalaValoracionEntity)
}

export const listEscalaValoracionesBySesion = async (
  sesionId: string,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion[]> => {
  const result = await listEscalaValoraciones({
    filter: buildEscalasDeSesionFilter(sesionId),
    orderBy: 'createdon desc',
    includeIndicadores: options?.includeIndicadores,
    pageSize: 50,
  })
  return result.items
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getEscalaValoracionById = async (
  id: string,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(buildSelect(options))
    .eq('dpl_escalavaloracionid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la escala de valoración.')
  if (!data) return null

  const escala = mapEscalaValoracionEntity(toEntity(data))
  if (options?.includeIndicadores && escala.indicadoresNextLink) {
    return { ...escala, indicadores: await listIndicadoresByEscala(id), indicadoresNextLink: undefined }
  }
  return escala
}

export const getEscalaValoracionBySesionId = async (
  sesionId: string,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion | null> => {
  const query: any = supabase
    .from(TABLE)
    .select(buildSelect(options))
    .eq('dpl_sesionid', sesionId)
    .order('createdon', { ascending: false })
    .limit(1)

  const { data, error } = await query
  assertNoError(error, 'No se pudo cargar la escala de valoración.')
  const row = data?.[0]
  if (!row) return null

  const escala = mapEscalaValoracionEntity(toEntity(row))
  if (options?.includeIndicadores && escala.indicadoresNextLink) {
    return { ...escala, indicadores: await listIndicadoresByEscala(escala.id), indicadoresNextLink: undefined }
  }
  return escala
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildEscalaValoracionRow = (
  payload: CreateEscalaValoracionInput | UpdateEscalaValoracionInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_nombre', payload.nombre)
  set('dpl_estado', payload.estadoTexto)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)
  set('dpl_sesionid', payload.sesionId)
  return row
}

export const createEscalaValoracion = async (
  payload: CreateEscalaValoracionInput,
): Promise<EscalaValoracion> => {
  const row = buildEscalaValoracionRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la escala de valoración.')
  return mapEscalaValoracionEntity(toEntity(data))
}

export const updateEscalaValoracion = async (
  id: string,
  payload: UpdateEscalaValoracionInput,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion> => {
  const row = buildEscalaValoracionRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_escalavaloracionid', id)
  assertNoError(error, 'No se pudo actualizar la escala de valoración.')
  const updated = await getEscalaValoracionById(id, options)
  if (!updated) throw new Error('No se pudo recuperar la escala de valoración actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteEscalaValoracion = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_escalavaloracionid', id)
  assertNoError(error, 'No se pudo eliminar la escala de valoración.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getEscalaValoracionCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_escalavaloracionid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de escalas de valoración.')
  return count ?? 0
}

export const getEscalaValoracionCountByEstado = async (): Promise<Array<{ estado: string; count: number }>> => {
  const escalas = await listAllEscalaValoraciones()
  const groups = new Map<string, number>()
  for (const e of escalas) {
    const key = e.estadoTexto || 'Sin estado'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([estado, count]) => ({ estado, count }))
}
