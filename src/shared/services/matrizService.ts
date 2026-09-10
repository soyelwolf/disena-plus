// src/shared/services/matrizService.ts
// CRUD service for the Dataverse table "Matriz" (dpl_matriz) via the Power Pages
// Web API, including the $expand of its child "Pregunta de Matriz" collection.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, the entity set name and both navigation properties were verified
// against live Dataverse metadata.

import {
  bindLookup,
  buildExpandClause,
  buildODataUrl,
  escapeODataString,
  extractRecordId,
  fetchAllPages,
  parseResponseBody,
  powerPagesFetch,
  powerPagesFetchResponse,
  type ODataCollectionResponse,
  type PaginatedResult,
} from '../powerPagesApi'
import {
  MATRIZ_ENTITY_SET,
  MATRIZ_PREGUNTAS_NAV,
  MATRIZ_SESION_NAV,
  SESION_ENTITY_SET,
  SESION_PRIMARY_NAME,
  mapMatrizEntity,
  type CreateMatrizInput,
  type Matriz,
  type MatrizEntity,
  type UpdateMatrizInput,
} from '../../types/matriz'
import { MATRIZ_PREGUNTA_EXPAND_COLUMNS } from './matrizPreguntaService'
import { MATRIZ_PREGUNTA_ORDEN_MAX } from '../../types/matrizPregunta'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

/**
 * Columns selected for a Matriz header. Note `_dpl_sesionid_value`: on GET the
 * lookup GUID is read from the `_value` property, never from the navigation
 * property (which is only used for `@odata.bind` on writes).
 */
export const MATRIZ_SELECT_COLUMNS = [
  'dpl_matrizid',
  'dpl_nombre',
  'dpl_estado',
  'dpl_activado',
  'dpl_usuarioregistro',
  'dpl_fecharegistro',
  '_dpl_sesionid_value',
  'createdon',
  'modifiedon',
] as const

const MATRIZ_SELECT = MATRIZ_SELECT_COLUMNS.join(',')

/**
 * $expand of the child Pregunta collection, ordered by `dpl_orden`.
 *
 * `top` caps the response size — a Matriz holds 1–10 rows in practice, and a
 * collection-valued expand would otherwise return up to 5,000 related records.
 * The cap is set slightly above the business maximum so an over-filled Matriz is
 * still visible rather than silently truncated at exactly the limit.
 *
 * `$orderby`/`$top` inside an expand are only valid while the query contains no
 * NESTED $expand — this expand has none. The mapper re-sorts client-side anyway,
 * so ordering survives even if a nested expand is added later.
 *
 * Requires dpl_matrizpregunta to have its own Web API site settings AND a table
 * permission granting read — otherwise the collection comes back empty.
 */
const MATRIZ_PREGUNTAS_EXPAND = buildExpandClause([
  {
    property: MATRIZ_PREGUNTAS_NAV,
    select: [...MATRIZ_PREGUNTA_EXPAND_COLUMNS],
    orderBy: 'dpl_orden asc',
    top: MATRIZ_PREGUNTA_ORDEN_MAX + 5,
  },
])

/**
 * $expand of the parent Sesion lookup, for showing the session name on a header.
 * Only needed when the formatted value of `_dpl_sesionid_value` is not enough.
 */
const MATRIZ_SESION_EXPAND = buildExpandClause([
  { property: MATRIZ_SESION_NAV, select: ['dpl_sesionid', SESION_PRIMARY_NAME] },
])

/** Combine the optional expands into a single $expand clause (max 15 options). */
const buildMatrizExpand = (options?: {
  includePreguntas?: boolean
  includeSesion?: boolean
}): string | undefined => {
  const clauses = [
    options?.includePreguntas ? MATRIZ_PREGUNTAS_EXPAND : undefined,
    options?.includeSesion ? MATRIZ_SESION_EXPAND : undefined,
  ].filter((c): c is string => !!c)

  return clauses.length > 0 ? clauses.join(',') : undefined
}

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Case-insensitive "name contains" filter. */
export const buildMatrizNombreContainsFilter = (search: string): string =>
  `contains(dpl_nombre,'${escapeODataString(search)}')`

/** Restrict matrices to a single parent Sesion. Filters on the lookup's `_value` column. */
export const buildMatrizBySesionFilter = (sesionId: string): string =>
  `_dpl_sesionid_value eq ${escapeODataString(sesionId)}`

/** Exact-match filter on the Estado column. */
export const buildMatrizEstadoFilter = (estado: string): string =>
  `dpl_estado eq '${escapeODataString(estado)}'`

/** Restrict to activated matrices only (dpl_activado is a Boolean column). */
export const buildMatrizActivadasFilter = (activado = true): string =>
  `dpl_activado eq ${activado}`

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineMatrizFilters = (...filters: Array<string | undefined>): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List (cursor paginated) ───────────────────────────────────────────────────

export interface ListMatrizsParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers above to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_nombre asc. */
  orderBy?: string
  /** Expand the child Pregunta collection on every row. Off by default. */
  includePreguntas?: boolean
  /** Expand the parent Sesion lookup. Off by default. */
  includeSesion?: boolean
}

/**
 * List Matriz records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors — Power
 * Pages does not support $skip, and $top would suppress the nextLink.
 */
export const listMatrizs = async (
  params?: ListMatrizsParams,
): Promise<PaginatedResult<Matriz>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(MATRIZ_ENTITY_SET, {
      $select: MATRIZ_SELECT,
      $expand: buildMatrizExpand(params),
      $orderby: params?.orderBy ?? 'dpl_nombre asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<MatrizEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapMatrizEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Matriz record by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, a lookup map, an export).
 */
export const listAllMatrizs = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Matriz[]> => {
  const url = buildODataUrl(MATRIZ_ENTITY_SET, {
    $select: MATRIZ_SELECT,
    $orderby: params?.orderBy ?? 'dpl_nombre asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<MatrizEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapMatrizEntity)
}

/** All matrices belonging to one Sesion, ordered by name. */
export const listMatrizsBySesion = async (
  sesionId: string,
  params?: Omit<ListMatrizsParams, 'filter'>,
): Promise<PaginatedResult<Matriz>> =>
  listMatrizs({ ...params, filter: buildMatrizBySesionFilter(sesionId) })

// ── Get by ID ─────────────────────────────────────────────────────────────────

/**
 * Load one Matriz header, optionally with its child preguntas in the same round
 * trip via `$expand=dpl_Matriz_MatrizPregunta`.
 *
 * The returned `preguntas` array is always sorted by `orden` ascending.
 */
export const getMatrizById = async (
  id: string,
  options?: { includePreguntas?: boolean; includeSesion?: boolean },
): Promise<Matriz | null> => {
  const url = buildODataUrl(`${MATRIZ_ENTITY_SET}(${id})`, {
    $select: MATRIZ_SELECT,
    $expand: buildMatrizExpand(options),
  })

  const entity = await powerPagesFetch<MatrizEntity>(url)
  return entity ? mapMatrizEntity(entity) : null
}

// ── Body builder ──────────────────────────────────────────────────────────────

const buildMatrizBody = (
  payload: CreateMatrizInput | UpdateMatrizInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (value !== undefined) body[column] = value
  }

  set('dpl_nombre', payload.nombre)
  set('dpl_estado', payload.estado)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)

  // The Sesion lookup is written via `dpl_SesionId@odata.bind` (case-sensitive
  // navigation property) — never by assigning to `_dpl_sesionid_value`.
  // `null` clears the lookup; `undefined` leaves it untouched on a partial update.
  const sesionId = (payload as UpdateMatrizInput).sesionId
  if (sesionId !== undefined || !partial) {
    bindLookup(body, MATRIZ_SESION_NAV, SESION_ENTITY_SET, sesionId)
  }

  return body
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createMatriz = async (payload: CreateMatrizInput): Promise<Matriz> => {
  const body = buildMatrizBody(payload, { partial: false })

  const response = await powerPagesFetchResponse(`/_api/${MATRIZ_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<MatrizEntity>(response)
  if (entity?.dpl_matrizid) return mapMatrizEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getMatrizById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la matriz creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateMatriz = async (id: string, payload: UpdateMatrizInput): Promise<Matriz> => {
  const body = buildMatrizBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${MATRIZ_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getMatrizById(id)
  if (!updated) throw new Error('No se pudo recuperar la matriz actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete a Matriz header.
 *
 * Whether the child Pregunta rows are removed with it depends on the cascade
 * configuration of the `dpl_Matriz_MatrizPregunta` relationship. If that
 * relationship is referential rather than parental, delete the rows first with
 * `deletePregunta` — orphaned rows are otherwise left behind.
 */
export const deleteMatriz = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${MATRIZ_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getMatrizCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(MATRIZ_ENTITY_SET, {
    $select: 'dpl_matrizid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<MatrizEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per Estado, for summary tiles or filter facets. */
export const getMatrizCountByEstado = async (): Promise<
  Array<{ estado: string; count: number }>
> => {
  const url = buildODataUrl(MATRIZ_ENTITY_SET, {
    $apply: 'groupby((dpl_estado),aggregate($count as count))',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    estado: (row['dpl_estado'] as string | null) ?? 'Sin estado',
    count: (row['count'] as number) ?? 0,
  }))
}
