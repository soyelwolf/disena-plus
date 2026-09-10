// src/shared/services/sesionService.ts
// CRUD service for the Dataverse table "Sesión / Elemento" (dpl_sesion) via the Power Pages Web API.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, the entity set name and the lookup navigation property were verified
// against live Dataverse metadata.

import {
  bindLookup,
  buildExpandClause,
  buildODataUrl,
  escapeODataString,
  extractRecordId,
  fetchAllPages,
  getFormattedValue,
  parseResponseBody,
  powerPagesFetch,
  powerPagesFetchResponse,
  type ODataCollectionResponse,
  type PaginatedResult,
} from '../powerPagesApi'
import {
  SESION_ENTITY_SET,
  SESION_UNIDAD_NAV,
  UNIDAD_ENTITY_SET,
  mapSesionEntity,
  type CreateSesionInput,
  type Sesion,
  type SesionEntity,
  type UpdateSesionInput,
} from '../../types/sesion'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.
// The lookup is selected as its raw GUID projection (_dpl_unidadid_value); the
// navigation property dpl_UnidadId only appears in $expand.

const SESION_SELECT = [
  'dpl_sesionid',
  'dpl_elemento',
  'dpl_idsesiontext',
  'dpl_abreviatura',
  'dpl_tema',
  '_dpl_unidadid_value',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
].join(',')

/**
 * Optional expand of the parent Unidad lookup (single-valued navigation property).
 * Requires dpl_unidad to have its own Web API site settings AND a table permission
 * with read access — omit the expand if those are not set up.
 */
const SESION_UNIDAD_EXPAND = buildExpandClause([
  {
    property: SESION_UNIDAD_NAV,
    select: ['dpl_unidadid', 'dpl_nombreunidad', 'dpl_idunidadtext', 'dpl_numerounidad'],
  },
])

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListSesionesParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers below to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_elemento asc. */
  orderBy?: string
  /** Include the parent Unidad record via $expand. Off by default. */
  includeUnidad?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Case-insensitive "elemento contains" filter (primary name column). */
export const buildElementoContainsFilter = (search: string): string =>
  `contains(dpl_elemento,'${escapeODataString(search)}')`

/** Case-insensitive "tema contains" filter. */
export const buildTemaContainsFilter = (search: string): string =>
  `contains(dpl_tema,'${escapeODataString(search)}')`

/** Exact-match filter on the ID Sesión text column. */
export const buildIdSesionTextFilter = (idSesionText: string): string =>
  `dpl_idsesiontext eq '${escapeODataString(idSesionText)}'`

/** Restrict to the sessions belonging to one parent Unidad. */
export const buildUnidadFilter = (unidadId: string): string =>
  `_dpl_unidadid_value eq ${escapeODataString(unidadId)}`

/** Restrict to records with no parent Unidad assigned. */
export const buildSinUnidadFilter = (): string => '_dpl_unidadid_value eq null'

/** Restrict to active records only. */
export const buildActivosFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineFilters = (...filters: Array<string | undefined>): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List (cursor paginated) ───────────────────────────────────────────────────

/**
 * List Sesión / Elemento records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listSesiones = async (
  params?: ListSesionesParams,
): Promise<PaginatedResult<Sesion>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(SESION_ENTITY_SET, {
      $select: SESION_SELECT,
      $expand: params?.includeUnidad ? SESION_UNIDAD_EXPAND : undefined,
      $orderby: params?.orderBy ?? 'dpl_elemento asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<SesionEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapSesionEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Sesión record by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, a lookup map, an export).
 */
export const listAllSesiones = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Sesion[]> => {
  const url = buildODataUrl(SESION_ENTITY_SET, {
    $select: SESION_SELECT,
    $orderby: params?.orderBy ?? 'dpl_elemento asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<SesionEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapSesionEntity)
}

/** Convenience: the sessions of a single parent Unidad, cursor paginated. */
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
  const url = buildODataUrl(`${SESION_ENTITY_SET}(${id})`, {
    $select: SESION_SELECT,
    $expand: options?.includeUnidad ? SESION_UNIDAD_EXPAND : undefined,
  })

  const entity = await powerPagesFetch<SesionEntity>(url)
  return entity ? mapSesionEntity(entity) : null
}

// ── Create ────────────────────────────────────────────────────────────────────

const buildSesionBody = (
  payload: CreateSesionInput | UpdateSesionInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_elemento', payload.elemento)
  set('dpl_idsesiontext', payload.idSesionText)
  set('dpl_abreviatura', payload.abreviatura)
  set('dpl_tema', payload.tema)

  // Lookups are written through NavigationProperty@odata.bind — never to
  // _dpl_unidadid_value. `null` clears the lookup, `undefined` leaves it alone.
  bindLookup(body, SESION_UNIDAD_NAV, UNIDAD_ENTITY_SET, payload.unidadId)

  return body
}

export const createSesion = async (payload: CreateSesionInput): Promise<Sesion> => {
  const body = buildSesionBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${SESION_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<SesionEntity>(response)
  if (entity?.dpl_sesionid) return mapSesionEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getSesionById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la sesión creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateSesion = async (id: string, payload: UpdateSesionInput): Promise<Sesion> => {
  const body = buildSesionBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${SESION_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getSesionById(id)
  if (!updated) throw new Error('No se pudo recuperar la sesión actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteSesion = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${SESION_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getSesionCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(SESION_ENTITY_SET, {
    $select: 'dpl_sesionid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<SesionEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per parent Unidad, for summary tiles or filter facets. */
export const getSesionCountByUnidad = async (): Promise<
  Array<{ unidadId: string; count: number }>
> => {
  const url = buildODataUrl(SESION_ENTITY_SET, {
    $apply: 'groupby((_dpl_unidadid_value),aggregate($count as count))',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    unidadId:
      (row['_dpl_unidadid_value'] as string | null) ??
      getFormattedValue(row, '_dpl_unidadid_value') ??
      '',
    count: (row['count'] as number) ?? 0,
  }))
}
