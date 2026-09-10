// src/shared/services/consignaService.ts
// CRUD service for the "Consigna" table (dpl_consigna) via Supabase.
//
// Column names match the original Dataverse logical names so the existing
// mapConsignaEntity() mapper (src/types/consigna.ts) keeps working unchanged
// against Supabase rows — see src/shared/supabaseClient.ts for why.
//
// The five rich text columns (dpl_queseevaluara, dpl_indicaciongeneral,
// dpl_indicacionesespecificas, dpl_recomendaciones, dpl_anexo) carry HTML
// strings, sent and returned verbatim — never escaped, stripped or sanitized here.

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
  mapConsignaEntity,
  type Consigna,
  type ConsignaEntity,
  type CreateConsignaInput,
  type UpdateConsignaInput,
} from '../../types/consigna'

const TABLE = 'dpl_consigna'
const SESION_EMBED =
  'dpl_SesionId:dpl_sesion(dpl_sesionid,dpl_elemento,dpl_idsesiontext,dpl_tema,dpl_abreviatura)'

const RICH_TEXT_COLUMNS =
  'dpl_queseevaluara,dpl_indicaciongeneral,dpl_indicacionesespecificas,dpl_recomendaciones,dpl_anexo'

const buildSelect = (options?: { includeSesion?: boolean; includeRichText?: boolean }): string => {
  const base = options?.includeRichText === false ? `*` : `*`
  // Supabase has no cheap way to omit named columns from `*`, and the rich text
  // payload here is small enough (a few KB) that always selecting it is fine —
  // unlike the old 10,000-char-per-column Dataverse cap this was written for.
  void RICH_TEXT_COLUMNS
  // Always embed the parent Sesion's primary name: unlike Dataverse (which
  // auto-annotated every lookup with the related record's display name for
  // free), Postgres has no such annotation, and a Consigna has no name of its
  // own — sesionNombre is what every screen's heading falls back to.
  return [base, SESION_EMBED].join(', ')
}

const toEntity = (row: Record<string, unknown>): ConsignaEntity =>
  withStateLabel(withLookupValue(row, 'dpl_sesionid')) as ConsignaEntity

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListConsignasParams {
  pageSize?: number
  nextLink?: string
  filter?: string
  orderBy?: string
  includeSesion?: boolean
  includeRichText?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────

export const buildSesionFilter = (sesionId: string): string =>
  encodeFilter({ field: 'dpl_sesionid', op: 'eq', value: sesionId })

export const buildIdConsignaContainsFilter = (search: string): string =>
  encodeFilter({ field: 'dpl_idconsignatext', op: 'contains', value: search })

export const buildEstadoFilter = (estado: string): string =>
  encodeFilter({ field: 'dpl_estado', op: 'eq', value: estado })

export const buildActivadoFilter = (activado = true): string =>
  encodeFilter({ field: 'dpl_activado', op: 'eq', value: activado })

export const buildActivosFilter = (): string => encodeFilter({ field: 'statecode', op: 'eq', value: 0 })

export const combineFilters = combineFilterConditions

// ── List (paginated) ──────────────────────────────────────────────────────────

export const listConsignas = async (
  params?: ListConsignasParams,
): Promise<PaginatedResult<Consigna>> => {
  const pageSize = params?.pageSize ?? 20
  const offset = parseOffset(params?.nextLink)

  let query: any = supabase.from(TABLE).select(buildSelect(params), { count: 'exact' })
  query = applyFilter(query, params?.filter)
  query = applyOrderBy(query, params?.orderBy ?? 'dpl_idconsignatext asc')
  query = query.range(offset, offset + pageSize - 1)

  const { data, error, count } = await query
  assertNoError(error, 'No se pudieron cargar las consignas.')

  const items = (data ?? []).map(toEntity).map(mapConsignaEntity)
  return buildPaginatedResult(items, count ?? items.length, offset, pageSize)
}

export const listAllConsignas = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
  includeRichText?: boolean
}): Promise<Consigna[]> => {
  const rows = await fetchAllRows<Record<string, unknown>>((from, to) => {
    let query: any = supabase.from(TABLE).select(buildSelect(params))
    query = applyFilter(query, params?.filter)
    query = applyOrderBy(query, params?.orderBy ?? 'dpl_idconsignatext asc')
    return query.range(from, to)
  }, params?.pageSize ?? 100)
  return rows.map(toEntity).map(mapConsignaEntity)
}

export const listConsignasBySesion = async (
  sesionId: string,
  params?: Omit<ListConsignasParams, 'filter'> & { extraFilter?: string },
): Promise<PaginatedResult<Consigna>> =>
  listConsignas({
    ...params,
    includeRichText: params?.includeRichText ?? true,
    filter: combineFilters(buildSesionFilter(sesionId), params?.extraFilter),
    orderBy: params?.orderBy ?? 'dpl_idconsignatext asc',
  })

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getConsignaById = async (
  id: string,
  options?: { includeSesion?: boolean },
): Promise<Consigna | null> => {
  const { data, error } = (await supabase
    .from(TABLE)
    .select(buildSelect({ ...options, includeRichText: true }))
    .eq('dpl_consignaid', id)
    .maybeSingle()) as any
  assertNoError(error, 'No se pudo cargar la consigna.')
  return data ? mapConsignaEntity(toEntity(data)) : null
}

// ── Create / Update ───────────────────────────────────────────────────────────

const buildConsignaRow = (
  payload: CreateConsignaInput | UpdateConsignaInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const row: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) row[column] = value
  }
  set('dpl_idconsignatext', payload.idConsignaText)
  set('dpl_queseevaluara', payload.queSeEvaluara)
  set('dpl_indicaciongeneral', payload.indicacionGeneral)
  set('dpl_indicacionesespecificas', payload.indicacionesEspecificas)
  set('dpl_recomendaciones', payload.recomendaciones)
  set('dpl_anexo', payload.anexo)
  set('dpl_instrumento', payload.instrumento)
  set('dpl_estado', payload.estado)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)
  set('dpl_sesionid', payload.sesionId)
  return row
}

export const createConsigna = async (payload: CreateConsignaInput): Promise<Consigna> => {
  const row = buildConsignaRow(payload, { partial: false })
  const { data, error } = await supabase.from(TABLE).insert(row).select('*').single()
  assertNoError(error, 'No se pudo crear la consigna.')
  return mapConsignaEntity(toEntity(data))
}

export const updateConsigna = async (id: string, payload: UpdateConsignaInput): Promise<Consigna> => {
  const row = buildConsignaRow(payload, { partial: true })
  const { error } = await supabase.from(TABLE).update(row).eq('dpl_consignaid', id)
  assertNoError(error, 'No se pudo actualizar la consigna.')
  const updated = await getConsignaById(id)
  if (!updated) throw new Error('No se pudo recuperar la consigna actualizada.')
  return updated
}

export type ConsignaRichTextField =
  | 'queSeEvaluara'
  | 'indicacionGeneral'
  | 'indicacionesEspecificas'
  | 'recomendaciones'
  | 'anexo'

export const updateConsignaRichText = async (
  id: string,
  field: ConsignaRichTextField,
  html: string,
): Promise<Consigna> => updateConsigna(id, { [field]: html } as UpdateConsignaInput)

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteConsigna = async (id: string): Promise<void> => {
  const { error } = await supabase.from(TABLE).delete().eq('dpl_consignaid', id)
  assertNoError(error, 'No se pudo eliminar la consigna.')
}

// ── Count & aggregation ───────────────────────────────────────────────────────

export const getConsignaCount = async (filter?: string): Promise<number> => {
  let query: any = supabase.from(TABLE).select('dpl_consignaid', { count: 'exact', head: true })
  query = applyFilter(query, filter)
  const { count, error } = await query
  assertNoError(error, 'No se pudo obtener el total de consignas.')
  return count ?? 0
}

export const getConsignaCountByEstado = async (): Promise<Array<{ estado: string; count: number }>> => {
  const consignas = await listAllConsignas()
  const groups = new Map<string, number>()
  for (const c of consignas) {
    const key = c.estado || 'Sin estado'
    groups.set(key, (groups.get(key) ?? 0) + 1)
  }
  return [...groups.entries()].map(([estado, count]) => ({ estado, count }))
}

export const getConsignaCountBySesion = async (): Promise<Array<{ sesionId: string; count: number }>> => {
  const consignas = await listAllConsignas()
  const groups = new Map<string, number>()
  for (const c of consignas) groups.set(c.sesionId, (groups.get(c.sesionId) ?? 0) + 1)
  return [...groups.entries()].map(([sesionId, count]) => ({ sesionId, count }))
}
