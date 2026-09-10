// src/shared/services/escalaValoracionService.ts
// CRUD service for the Dataverse table "Escala de Valoración" (dpl_escalavaloracion)
// via the Power Pages Web API, including the $expand that loads a scale together
// with its child "Indicador de Escala" rows (see ./escalaIndicadorService.ts for
// row-level CRUD).
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, entity set and navigation properties were verified against live
// Dataverse metadata (see src/types/escalaValoracion.ts header comment).

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
  ESCALA_VALORACION_ENTITY_SET,
  ESCALA_VALORACION_INDICADORES_NAV,
  ESCALA_VALORACION_SESION_NAV,
  ESCALA_VALORACION_SESION_VALUE,
  SESION_ENTITY_SET,
  mapEscalaValoracionEntity,
  type CreateEscalaValoracionInput,
  type EscalaValoracion,
  type EscalaValoracionEntity,
  type UpdateEscalaValoracionInput,
} from '../../types/escalaValoracion'
import { ESCALA_INDICADOR_SELECT_COLUMNS } from './escalaIndicadorService'
import { listIndicadoresByEscala } from './escalaIndicadorService'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

const ESCALA_VALORACION_SELECT = [
  'dpl_escalavaloracionid',
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
 * Full expand of the child Indicador collection. This is what the evaluation
 * screen needs: header plus the complete, ordered indicador grid in one round
 * trip.
 *
 * `top` caps the response (collection-valued expands otherwise return up to
 * 5,000 rows); a scale holds 1-10 indicadores, so 100 is generous headroom.
 * `orderBy` is safe here because the query contains no NESTED $expand — if one
 * is ever added, $orderby and $top stop being supported on expanded
 * collections and the indicadores must be fetched separately via
 * `listIndicadoresByEscala`.
 */
const INDICADORES_EXPAND = buildExpandClause([
  {
    property: ESCALA_VALORACION_INDICADORES_NAV,
    select: [...ESCALA_INDICADOR_SELECT_COLUMNS],
    orderBy: 'dpl_orden asc',
    top: 100,
  },
])

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Restrict to the escalas belonging to one Sesión. */
export const buildEscalasDeSesionFilter = (sesionId: string): string =>
  `${ESCALA_VALORACION_SESION_VALUE} eq ${escapeODataString(sesionId)}`

/** Case-insensitive "name contains" filter. */
export const buildEscalaNombreContainsFilter = (search: string): string =>
  `contains(dpl_nombre,'${escapeODataString(search)}')`

/** Exact-match filter on the free-text Estado column (e.g. 'PROCESADO'). */
export const buildEscalaEstadoFilter = (estado: string): string =>
  `dpl_estado eq '${escapeODataString(estado)}'`

/** Restrict to escalas flagged as activated. */
export const buildEscalasActivadasFilter = (): string => 'dpl_activado eq true'

/** Restrict to active (non-deactivated) records. */
export const buildEscalasActivasFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineFilters = (
  ...filters: Array<string | undefined>
): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List (cursor paginated) ───────────────────────────────────────────────────

export interface ListEscalaValoracionesParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor from a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers above to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_nombre asc. */
  orderBy?: string
  /** Include child indicadores via $expand. Off by default. */
  includeIndicadores?: boolean
}

const expandFor = (params?: { includeIndicadores?: boolean }): string | undefined =>
  params?.includeIndicadores ? INDICADORES_EXPAND : undefined

/**
 * List Escala de Valoración records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors —
 * Power Pages does not support $skip, and $top would suppress the nextLink.
 */
export const listEscalaValoraciones = async (
  params?: ListEscalaValoracionesParams,
): Promise<PaginatedResult<EscalaValoracion>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(ESCALA_VALORACION_ENTITY_SET, {
      $select: ESCALA_VALORACION_SELECT,
      $expand: expandFor(params),
      $orderby: params?.orderBy ?? 'dpl_nombre asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<
    ODataCollectionResponse<EscalaValoracionEntity>
  >(url, { headers: { Prefer: LIST_PREFER(pageSize) } })

  return {
    items: (response?.value ?? []).map(mapEscalaValoracionEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Escala de Valoración by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, an export).
 */
export const listAllEscalaValoraciones = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<EscalaValoracion[]> => {
  const url = buildODataUrl(ESCALA_VALORACION_ENTITY_SET, {
    $select: ESCALA_VALORACION_SELECT,
    $orderby: params?.orderBy ?? 'dpl_nombre asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<EscalaValoracionEntity>(
    url,
    params?.pageSize ?? 100,
  )
  return entities.map(mapEscalaValoracionEntity)
}

/** The escalas attached to one Sesión, newest first. */
export const listEscalaValoracionesBySesion = async (
  sesionId: string,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion[]> => {
  const url = buildODataUrl(ESCALA_VALORACION_ENTITY_SET, {
    $select: ESCALA_VALORACION_SELECT,
    $expand: expandFor(options),
    $filter: buildEscalasDeSesionFilter(sesionId),
    $orderby: 'createdon desc',
    $count: 'true',
  })

  const entities = await fetchAllPages<EscalaValoracionEntity>(url, 50)
  return entities.map(mapEscalaValoracionEntity)
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

/**
 * Load one scale. With `includeIndicadores` the child rows come back in the
 * same request via $expand of `dpl_EscalaValoracion_EscalaIndicador`, already
 * ordered by `dpl_orden` — this is the call the evaluation screen should make.
 *
 * In the unlikely event the expanded collection is truncated (the mapper
 * surfaces this as `indicadoresNextLink`), the remaining rows are fetched with
 * a follow-up query so the caller always receives the complete, ordered list.
 */
export const getEscalaValoracionById = async (
  id: string,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion | null> => {
  const includeIndicadores = options?.includeIndicadores ?? false

  const url = buildODataUrl(`${ESCALA_VALORACION_ENTITY_SET}(${id})`, {
    $select: ESCALA_VALORACION_SELECT,
    $expand: includeIndicadores ? INDICADORES_EXPAND : undefined,
  })

  const entity = await powerPagesFetch<EscalaValoracionEntity>(url)
  if (!entity) return null

  const escala = mapEscalaValoracionEntity(entity)

  if (includeIndicadores && escala.indicadoresNextLink) {
    // Truncated expand — re-read the rows on their own to get the full set.
    return {
      ...escala,
      indicadores: await listIndicadoresByEscala(id),
      indicadoresNextLink: undefined,
    }
  }

  return escala
}

/** The most recent escala attached to a Sesión, with its indicadores loaded. */
export const getEscalaValoracionBySesionId = async (
  sesionId: string,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion | null> => {
  const url = buildODataUrl(ESCALA_VALORACION_ENTITY_SET, {
    $select: ESCALA_VALORACION_SELECT,
    $expand: options?.includeIndicadores ? INDICADORES_EXPAND : undefined,
    $filter: buildEscalasDeSesionFilter(sesionId),
    $orderby: 'createdon desc',
    $top: '1',
    $count: 'true',
  })

  const response =
    await powerPagesFetch<ODataCollectionResponse<EscalaValoracionEntity>>(url)
  const entity = response?.value?.[0]
  if (!entity) return null

  const escala = mapEscalaValoracionEntity(entity)

  if (options?.includeIndicadores && escala.indicadoresNextLink) {
    return {
      ...escala,
      indicadores: await listIndicadoresByEscala(escala.id),
      indicadoresNextLink: undefined,
    }
  }

  return escala
}

// ── Create ────────────────────────────────────────────────────────────────────

const buildEscalaValoracionBody = (
  payload: CreateEscalaValoracionInput | UpdateEscalaValoracionInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_nombre', payload.nombre)
  set('dpl_estado', payload.estadoTexto)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)

  // Parent Sesión lookup — always via NavigationProperty@odata.bind
  // (case-sensitive), never by writing to _dpl_sesionid_value.
  bindLookup(body, ESCALA_VALORACION_SESION_NAV, SESION_ENTITY_SET, payload.sesionId)

  return body
}

export const createEscalaValoracion = async (
  payload: CreateEscalaValoracionInput,
): Promise<EscalaValoracion> => {
  const body = buildEscalaValoracionBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(
    `/_api/${ESCALA_VALORACION_ENTITY_SET}`,
    {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(body),
    },
  )

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<EscalaValoracionEntity>(response)
  if (entity?.dpl_escalavaloracionid) return mapEscalaValoracionEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getEscalaValoracionById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la escala de valoración creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateEscalaValoracion = async (
  id: string,
  payload: UpdateEscalaValoracionInput,
  options?: { includeIndicadores?: boolean },
): Promise<EscalaValoracion> => {
  const body = buildEscalaValoracionBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${ESCALA_VALORACION_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getEscalaValoracionById(id, options)
  if (!updated) throw new Error('No se pudo recuperar la escala de valoración actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

/**
 * Delete a scale header.
 *
 * Whether the child indicador rows are removed with it depends on the cascade
 * configuration of the `dpl_EscalaValoracion_EscalaIndicador` relationship in
 * Dataverse. If that relationship does not cascade delete, remove the rows
 * first with `deleteIndicadoresByEscala`.
 */
export const deleteEscalaValoracion = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${ESCALA_VALORACION_ENTITY_SET}(${id})`, {
    method: 'DELETE',
  })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getEscalaValoracionCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(ESCALA_VALORACION_ENTITY_SET, {
    $select: 'dpl_escalavaloracionid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response =
    await powerPagesFetch<ODataCollectionResponse<EscalaValoracionEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per Estado, for summary tiles or filter facets. */
export const getEscalaValoracionCountByEstado = async (): Promise<
  Array<{ estado: string; count: number }>
> => {
  const url = buildODataUrl(ESCALA_VALORACION_ENTITY_SET, {
    $apply: 'groupby((dpl_estado),aggregate($count as count))',
  })

  const response =
    await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    estado: (row['dpl_estado'] as string | null) ?? 'Sin estado',
    count: (row['count'] as number) ?? 0,
  }))
}
