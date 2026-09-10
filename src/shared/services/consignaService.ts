// src/shared/services/consignaService.ts
// CRUD service for the Dataverse table "Consigna" (dpl_consigna) via the Power Pages Web API.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, the entity set name and the Sesion navigation property were verified
// against live Dataverse metadata.
//
// The five rich text columns (dpl_queseevaluara, dpl_indicaciongeneral,
// dpl_indicacionesespecificas, dpl_recomendaciones, dpl_anexo) carry HTML strings.
// This service sends and returns them verbatim — it never escapes, strips or
// sanitizes their markup.

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
  CONSIGNA_ENTITY_SET,
  CONSIGNA_SESION_NAV,
  SESION_ENTITY_SET,
  mapConsignaEntity,
  type Consigna,
  type ConsignaEntity,
  type CreateConsignaInput,
  type UpdateConsignaInput,
} from '../../types/consigna'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

/**
 * Full column list, including the five rich text (HTML) columns.
 * Use for detail views and edit forms.
 */
const CONSIGNA_SELECT = [
  'dpl_consignaid',
  'dpl_idconsignatext',
  'dpl_queseevaluara',
  'dpl_indicaciongeneral',
  'dpl_indicacionesespecificas',
  'dpl_recomendaciones',
  'dpl_anexo',
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
 * Lightweight column list that omits the rich text columns (up to 10,000 chars each).
 * Use for list/table views — pulling five HTML blobs per row is wasteful.
 * Records loaded this way have empty strings in the rich text domain fields.
 */
const CONSIGNA_SUMMARY_SELECT = [
  'dpl_consignaid',
  'dpl_idconsignatext',
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
 * Optional expand of the parent Sesion (single-valued lookup navigation property).
 * Requires dpl_sesion to have its own Web API site settings AND a table permission
 * with read access — omit the expand if those are not set up.
 */
const CONSIGNA_SESION_EXPAND = buildExpandClause([
  {
    property: CONSIGNA_SESION_NAV,
    select: ['dpl_sesionid', 'dpl_elemento', 'dpl_idsesiontext', 'dpl_tema', 'dpl_abreviatura'],
  },
])

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListConsignasParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers below to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_idconsignatext asc. */
  orderBy?: string
  /** Include the parent Sesion via $expand. Off by default. */
  includeSesion?: boolean
  /**
   * Include the five rich text (HTML) columns. Off by default — list views rarely
   * need them and each column can hold up to 10,000 characters.
   */
  includeRichText?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

const GUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/

/**
 * All Consignas belonging to one Sesion (filters on the raw lookup GUID).
 * GUIDs are unquoted in OData, so the value is validated rather than escaped.
 */
export const buildSesionFilter = (sesionId: string): string => {
  const id = sesionId.replace(/^\{|\}$/g, '')
  if (!GUID_PATTERN.test(id)) throw new Error(`Identificador de sesión inválido: ${sesionId}`)
  return `_dpl_sesionid_value eq ${id}`
}

/** Case-insensitive "ID Consigna contains" filter. */
export const buildIdConsignaContainsFilter = (search: string): string =>
  `contains(dpl_idconsignatext,'${escapeODataString(search)}')`

/** Exact-match filter on the Estado column. */
export const buildEstadoFilter = (estado: string): string =>
  `dpl_estado eq '${escapeODataString(estado)}'`

/** Restrict to records flagged as activated (dpl_activado). */
export const buildActivadoFilter = (activado = true): string =>
  `dpl_activado eq ${activado ? 'true' : 'false'}`

/** Restrict to active records only (statecode). */
export const buildActivosFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineFilters = (...filters: Array<string | undefined>): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List (cursor paginated) ───────────────────────────────────────────────────

/**
 * List Consigna records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listConsignas = async (
  params?: ListConsignasParams,
): Promise<PaginatedResult<Consigna>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(CONSIGNA_ENTITY_SET, {
      $select: params?.includeRichText ? CONSIGNA_SELECT : CONSIGNA_SUMMARY_SELECT,
      $expand: params?.includeSesion ? CONSIGNA_SESION_EXPAND : undefined,
      $orderby: params?.orderBy ?? 'dpl_idconsignatext asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<ConsignaEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapConsignaEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Consigna record by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, a lookup map, an export).
 */
export const listAllConsignas = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
  includeRichText?: boolean
}): Promise<Consigna[]> => {
  const url = buildODataUrl(CONSIGNA_ENTITY_SET, {
    $select: params?.includeRichText ? CONSIGNA_SELECT : CONSIGNA_SUMMARY_SELECT,
    $orderby: params?.orderBy ?? 'dpl_idconsignatext asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<ConsignaEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapConsignaEntity)
}

/**
 * List the Consignas of one Sesion — the primary access path for this table.
 * Rich text is included by default here because a Sesion holds few Consignas and
 * the caller normally renders their content.
 */
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
  const url = buildODataUrl(`${CONSIGNA_ENTITY_SET}(${id})`, {
    $select: CONSIGNA_SELECT,
    $expand: options?.includeSesion ? CONSIGNA_SESION_EXPAND : undefined,
  })

  const entity = await powerPagesFetch<ConsignaEntity>(url)
  return entity ? mapConsignaEntity(entity) : null
}

// ── Create / update body builder ──────────────────────────────────────────────

const buildConsignaBody = (
  payload: CreateConsignaInput | UpdateConsignaInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_idconsignatext', payload.idConsignaText)
  // Rich text (HTML) columns — written through exactly as received from the editor.
  set('dpl_queseevaluara', payload.queSeEvaluara)
  set('dpl_indicaciongeneral', payload.indicacionGeneral)
  set('dpl_indicacionesespecificas', payload.indicacionesEspecificas)
  set('dpl_recomendaciones', payload.recomendaciones)
  set('dpl_anexo', payload.anexo)
  set('dpl_estado', payload.estado)
  set('dpl_activado', payload.activado)
  set('dpl_usuarioregistro', payload.usuarioRegistro)
  set('dpl_fecharegistro', payload.fechaRegistro)

  // Parent Sesion lookup — must go through the case-sensitive navigation property
  // `dpl_SesionId` with @odata.bind. Writing to _dpl_sesionid_value does not work.
  // `null` unbinds, `undefined` leaves the lookup untouched.
  bindLookup(body, CONSIGNA_SESION_NAV, SESION_ENTITY_SET, payload.sesionId)

  return body
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createConsigna = async (payload: CreateConsignaInput): Promise<Consigna> => {
  const body = buildConsignaBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${CONSIGNA_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<ConsignaEntity>(response)
  if (entity?.dpl_consignaid) return mapConsignaEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getConsignaById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la consigna creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateConsigna = async (
  id: string,
  payload: UpdateConsignaInput,
): Promise<Consigna> => {
  const body = buildConsignaBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${CONSIGNA_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getConsignaById(id)
  if (!updated) throw new Error('No se pudo recuperar la consigna actualizada.')
  return updated
}

/**
 * Update a single rich text (HTML) column without touching the rest of the record.
 * Convenience wrapper for the per-field autosave the rich text editor performs.
 */
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
  await powerPagesFetch(`/_api/${CONSIGNA_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getConsignaCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(CONSIGNA_ENTITY_SET, {
    $select: 'dpl_consignaid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<ConsignaEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per Estado, for summary tiles or filter facets. */
export const getConsignaCountByEstado = async (): Promise<
  Array<{ estado: string; count: number }>
> => {
  const url = buildODataUrl(CONSIGNA_ENTITY_SET, {
    $apply: 'groupby((dpl_estado),aggregate($count as count))',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    estado:
      (row['dpl_estado'] as string | null) ??
      getFormattedValue(row, 'dpl_estado') ??
      'Sin estado',
    count: (row['count'] as number) ?? 0,
  }))
}

/** Grouped counts per parent Sesion, e.g. to badge each Sesion with its Consigna total. */
export const getConsignaCountBySesion = async (): Promise<
  Array<{ sesionId: string; count: number }>
> => {
  const url = buildODataUrl(CONSIGNA_ENTITY_SET, {
    $apply: 'groupby((_dpl_sesionid_value),aggregate($count as count))',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    sesionId: (row['_dpl_sesionid_value'] as string | null) ?? '',
    count: (row['count'] as number) ?? 0,
  }))
}
