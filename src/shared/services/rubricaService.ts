// src/shared/services/rubricaService.ts
// CRUD service for the Dataverse table "Rúbrica" (dpl_rubrica) via the Power Pages
// Web API, including the $expand that loads a rubric together with its child
// "Criterio de Rúbrica" rows (see ./rubricaCriterioService.ts for row-level CRUD).
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, entity set and navigation properties were verified against live
// Dataverse metadata and a live data query.

import {
  buildExpandClause,
  buildODataUrl,
  escapeODataString,
  extractRecordId,
  fetchAllPages,
  parseResponseBody,
  powerPagesFetch,
  powerPagesFetchResponse,
  bindLookup,
  type ODataCollectionResponse,
  type PaginatedResult,
} from '../powerPagesApi'
import {
  RUBRICA_CRITERIOS_NAV,
  RUBRICA_ENTITY_SET,
  RUBRICA_SESION_NAV,
  RUBRICA_SESION_VALUE,
  SESION_ENTITY_SET,
  mapRubricaEntity,
  type CreateRubricaInput,
  type Rubrica,
  type RubricaEntity,
  type UpdateRubricaInput,
} from '../../types/rubrica'
import {
  CRITERIO_RESUMEN_SELECT,
  CRITERIO_SELECT,
  listCriteriosByRubrica,
} from './rubricaCriterioService'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

const RUBRICA_SELECT = [
  'dpl_rubricaid',
  'dpl_nombre',
  'dpl_estado',
  'dpl_activado',
  'dpl_usuarioregistro',
  'dpl_fecharegistro',
  '_dpl_sesionid_value',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
].join(',')

/**
 * Full expand of the child Criterio collection — every column including the four
 * rich text descriptors. This is what the rubric detail screen needs: header plus
 * the complete, ordered criteria grid in one round trip.
 *
 * `top` caps the response (collection-valued expands otherwise return up to 5,000
 * rows); a rubric holds 3-10 criteria, so 100 is generous headroom. `orderBy` is
 * safe here because the query contains no NESTED $expand — if one is ever added,
 * $orderby and $top stop being supported on expanded collections and the criteria
 * must be fetched separately via `listCriteriosByRubrica`.
 */
const CRITERIOS_EXPAND_COMPLETO = buildExpandClause([
  {
    property: RUBRICA_CRITERIOS_NAV,
    select: CRITERIO_SELECT.split(','),
    orderBy: 'dpl_orden asc',
    top: 100,
  },
])

/**
 * Lightweight expand for list views — criterion titles, order and scores only,
 * leaving out the large rich text descriptors.
 */
const CRITERIOS_EXPAND_RESUMEN = buildExpandClause([
  {
    property: RUBRICA_CRITERIOS_NAV,
    select: CRITERIO_RESUMEN_SELECT,
    orderBy: 'dpl_orden asc',
    top: 100,
  },
])

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Restrict to the rubrics belonging to one Sesión. */
export const buildRubricasDeSesionFilter = (sesionId: string): string =>
  `${RUBRICA_SESION_VALUE} eq ${escapeODataString(sesionId)}`

/** Case-insensitive "name contains" filter. */
export const buildRubricaNombreContainsFilter = (search: string): string =>
  `contains(dpl_nombre,'${escapeODataString(search)}')`

/** Exact-match filter on the free-text Estado column (e.g. 'PROCESADO'). */
export const buildRubricaEstadoFilter = (estado: string): string =>
  `dpl_estado eq '${escapeODataString(estado)}'`

/** Restrict to rubrics flagged as activated. */
export const buildRubricasActivadasFilter = (): string => 'dpl_activado eq true'

/** Restrict to active (non-deactivated) records. */
export const buildRubricasActivasFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineFilters = (
  ...filters: Array<string | undefined>
): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List (cursor paginated) ───────────────────────────────────────────────────

export interface ListRubricasParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor from a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers above to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_nombre asc. */
  orderBy?: string
  /** Include child criteria via $expand. Off by default. */
  includeCriterios?: boolean
  /**
   * When expanding, pull every criterion column including the rich text
   * descriptors. Off by default — list views only need titles and scores.
   */
  criteriosCompletos?: boolean
}

const expandFor = (params?: {
  includeCriterios?: boolean
  criteriosCompletos?: boolean
}): string | undefined => {
  if (!params?.includeCriterios) return undefined
  return params.criteriosCompletos
    ? CRITERIOS_EXPAND_COMPLETO
    : CRITERIOS_EXPAND_RESUMEN
}

/**
 * List Rúbrica records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors —
 * Power Pages does not support $skip, and $top would suppress the nextLink.
 */
export const listRubricas = async (
  params?: ListRubricasParams,
): Promise<PaginatedResult<Rubrica>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(RUBRICA_ENTITY_SET, {
      $select: RUBRICA_SELECT,
      $expand: expandFor(params),
      $orderby: params?.orderBy ?? 'dpl_nombre asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<RubricaEntity>>(
    url,
    { headers: { Prefer: LIST_PREFER(pageSize) } },
  )

  return {
    items: (response?.value ?? []).map(mapRubricaEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Rúbrica by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, an export).
 */
export const listAllRubricas = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Rubrica[]> => {
  const url = buildODataUrl(RUBRICA_ENTITY_SET, {
    $select: RUBRICA_SELECT,
    $orderby: params?.orderBy ?? 'dpl_nombre asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<RubricaEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapRubricaEntity)
}

/** The rubrics attached to one Sesión, newest first. */
export const listRubricasBySesion = async (
  sesionId: string,
  options?: { includeCriterios?: boolean; criteriosCompletos?: boolean },
): Promise<Rubrica[]> => {
  const url = buildODataUrl(RUBRICA_ENTITY_SET, {
    $select: RUBRICA_SELECT,
    $expand: expandFor(options),
    $filter: buildRubricasDeSesionFilter(sesionId),
    $orderby: 'createdon desc',
    $count: 'true',
  })

  const entities = await fetchAllPages<RubricaEntity>(url, 50)
  return entities.map(mapRubricaEntity)
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

/**
 * Load one rubric. With `includeCriterios` the child rows come back in the same
 * request via $expand of `dpl_Rubrica_RubricaCriterio`, already ordered by
 * `dpl_orden` — this is the call the rubric detail screen should make.
 *
 * In the unlikely event the expanded collection is truncated (the mapper surfaces
 * this as `criteriosNextLink`), the remaining rows are fetched with a follow-up
 * query so the caller always receives the complete, ordered list.
 */
export const getRubricaById = async (
  id: string,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica | null> => {
  const includeCriterios = options?.includeCriterios ?? false

  const url = buildODataUrl(`${RUBRICA_ENTITY_SET}(${id})`, {
    $select: RUBRICA_SELECT,
    $expand: includeCriterios ? CRITERIOS_EXPAND_COMPLETO : undefined,
  })

  const entity = await powerPagesFetch<RubricaEntity>(url)
  if (!entity) return null

  const rubrica = mapRubricaEntity(entity)

  if (includeCriterios && rubrica.criteriosNextLink) {
    // Truncated expand — re-read the rows on their own to get the full set.
    return {
      ...rubrica,
      criterios: await listCriteriosByRubrica(id),
      criteriosNextLink: undefined,
    }
  }

  return rubrica
}

/** The most recent rubric attached to a Sesión, with its criteria loaded. */
export const getRubricaBySesionId = async (
  sesionId: string,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica | null> => {
  const url = buildODataUrl(RUBRICA_ENTITY_SET, {
    $select: RUBRICA_SELECT,
    $expand: options?.includeCriterios ? CRITERIOS_EXPAND_COMPLETO : undefined,
    $filter: buildRubricasDeSesionFilter(sesionId),
    $orderby: 'createdon desc',
    $top: '1',
    $count: 'true',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<RubricaEntity>>(url)
  const entity = response?.value?.[0]
  if (!entity) return null

  const rubrica = mapRubricaEntity(entity)

  if (options?.includeCriterios && rubrica.criteriosNextLink) {
    return {
      ...rubrica,
      criterios: await listCriteriosByRubrica(rubrica.id),
      criteriosNextLink: undefined,
    }
  }

  return rubrica
}

// ── Create ────────────────────────────────────────────────────────────────────

const buildRubricaBody = (
  payload: CreateRubricaInput | UpdateRubricaInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_nombre', payload.nombre)
  set('dpl_estado', payload.estado)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)

  // Parent Sesión lookup — always via NavigationProperty@odata.bind
  // (case-sensitive), never by writing to _dpl_sesionid_value.
  bindLookup(body, RUBRICA_SESION_NAV, SESION_ENTITY_SET, payload.sesionId)

  return body
}

export const createRubrica = async (
  payload: CreateRubricaInput,
): Promise<Rubrica> => {
  const body = buildRubricaBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${RUBRICA_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<RubricaEntity>(response)
  if (entity?.dpl_rubricaid) return mapRubricaEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getRubricaById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la rúbrica creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateRubrica = async (
  id: string,
  payload: UpdateRubricaInput,
  options?: { includeCriterios?: boolean },
): Promise<Rubrica> => {
  const body = buildRubricaBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${RUBRICA_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getRubricaById(id, options)
  if (!updated) throw new Error('No se pudo recuperar la rúbrica actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete a rubric header.
 *
 * Whether the child criterion rows are removed with it depends on the cascade
 * configuration of the `dpl_Rubrica_RubricaCriterio` relationship in Dataverse.
 * If that relationship does not cascade delete, remove the rows first with
 * `deleteRubricaCriterio` (the `useRubrica` hook's `removeCriterio` helper).
 */
export const deleteRubrica = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${RUBRICA_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getRubricaCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(RUBRICA_ENTITY_SET, {
    $select: 'dpl_rubricaid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<RubricaEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per Estado, for summary tiles or filter facets. */
export const getRubricaCountByEstado = async (): Promise<
  Array<{ estado: string; count: number }>
> => {
  const url = buildODataUrl(RUBRICA_ENTITY_SET, {
    $apply: 'groupby((dpl_estado),aggregate($count as count))',
  })

  const response =
    await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    estado: (row['dpl_estado'] as string | null) ?? 'Sin estado',
    count: (row['count'] as number) ?? 0,
  }))
}
