// src/shared/services/listaCotejoService.ts
// CRUD service for the tightly-coupled pair "Lista de Cotejo" (dpl_listacotejo)
// and "Indicador de Lista de Cotejo" (dpl_listacotejoindicador), via the
// Power Pages Web API.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Entity set names, column logical names, navigation properties and option-set
// values were verified against live Dataverse metadata (see src/types/listaCotejo.ts).

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
  INDICADOR_ENTITY_SET,
  INDICADOR_LISTA_COTEJO_NAV,
  LISTA_COTEJO_ENTITY_SET,
  LISTA_COTEJO_INDICADORES_NAV,
  LISTA_COTEJO_SESION_NAV,
  SESION_ENTITY_SET,
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

// ── Select clauses ────────────────────────────────────────────────────────────
// Explicit column lists — never a wildcard $select.

const LISTA_COTEJO_SELECT = [
  'dpl_listacotejoid',
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

const INDICADOR_SELECT = [
  'dpl_listacotejoindicadorid',
  'dpl_indicador',
  'dpl_orden',
  'dpl_puntaje',
  'dpl_respuesta',
  'dpl_observaciones',
  '_dpl_listacotejoid_value',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
].join(',')

const INDICADOR_EXPAND_SELECT = [
  'dpl_listacotejoindicadorid',
  'dpl_indicador',
  'dpl_orden',
  'dpl_puntaje',
  'dpl_respuesta',
  'dpl_observaciones',
  '_dpl_listacotejoid_value',
  'createdon',
  'modifiedon',
]

const SESION_EXPAND_SELECT = ['dpl_sesionid', 'dpl_elemento', 'dpl_idsesiontext', 'dpl_tema']

/**
 * Default cap on the expanded indicador collection. A Lista de Cotejo normally
 * carries 1–10 indicadores; the cap only guards against runaway rows (a
 * collection-valued expand otherwise returns up to 5,000 related records).
 */
export const MAX_INDICADORES_EXPAND = 50

/**
 * Expand of the child indicador collection.
 *
 * `$orderby`/`$top` inside a collection expand are only honoured while the query
 * carries no *nested* expand — which is why `includeSesion` and `includeIndicadores`
 * are built as sibling expands, never nested. Rows are re-sorted client-side by
 * `sortIndicadores` regardless, so ordering is correct either way.
 *
 * Requires dpl_listacotejoindicador to have its own Web API site settings AND a
 * table permission with read access — otherwise the expanded property comes back
 * empty. Use `listIndicadores` instead when the expand is not permitted.
 */
const buildIndicadoresExpand = (top = MAX_INDICADORES_EXPAND): string =>
  buildExpandClause([
    {
      property: LISTA_COTEJO_INDICADORES_NAV,
      select: INDICADOR_EXPAND_SELECT,
      orderBy: 'dpl_orden asc',
      top,
    },
  ])

const SESION_EXPAND = buildExpandClause([
  { property: LISTA_COTEJO_SESION_NAV, select: SESION_EXPAND_SELECT },
])

const buildExpand = (options?: {
  includeIndicadores?: boolean
  includeSesion?: boolean
  indicadoresTop?: number
}): string | undefined => {
  const parts: string[] = []
  if (options?.includeIndicadores) parts.push(buildIndicadoresExpand(options.indicadoresTop))
  if (options?.includeSesion) parts.push(SESION_EXPAND)
  return parts.length > 0 ? parts.join(',') : undefined
}

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid injection.

/** Case-insensitive "nombre contains" filter on the checklist header. */
export const buildListaCotejoNombreFilter = (search: string): string =>
  `contains(dpl_nombre,'${escapeODataString(search)}')`

/** All checklists belonging to one Sesión (filters on the lookup GUID column). */
export const buildListaCotejoPorSesionFilter = (sesionId: string): string =>
  `_dpl_sesionid_value eq ${sesionId}`

/** Exact-match filter on the free-text Estado column. */
export const buildListaCotejoEstadoFilter = (estado: string): string =>
  `dpl_estado eq '${escapeODataString(estado)}'`

/** Only checklists flagged as activated. */
export const buildListaCotejoActivadoFilter = (activado = true): string =>
  `dpl_activado eq ${activado}`

/** All indicadores belonging to one Lista de Cotejo (filters on the lookup GUID). */
export const buildIndicadoresPorListaFilter = (listaCotejoId: string): string =>
  `_dpl_listacotejoid_value eq ${listaCotejoId}`

/** Filter indicadores by answer (RESPUESTA.si / RESPUESTA.no). */
export const buildIndicadorRespuestaFilter = (respuesta: RespuestaValue): string =>
  `dpl_respuesta eq ${respuesta}`

/** Restrict to active records only. */
export const buildActivosFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineFilters = (...filters: Array<string | undefined>): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ═══════════════════════════════════════════════════════════════════════════════
// Lista de Cotejo (parent / header)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ListListasCotejoParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor from a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression — build it with the helpers above. */
  filter?: string
  /** OData $orderby expression. Default: dpl_nombre asc. */
  orderBy?: string
  /** Expand the child indicador collection. Off by default (heavier query). */
  includeIndicadores?: boolean
  /** Expand the parent Sesión. Off by default. */
  includeSesion?: boolean
  /** Cap on expanded indicador rows. Default MAX_INDICADORES_EXPAND. */
  indicadoresTop?: number
}

/**
 * List Lista de Cotejo records, one cursor page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listListasCotejo = async (
  params?: ListListasCotejoParams,
): Promise<PaginatedResult<ListaCotejo>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(LISTA_COTEJO_ENTITY_SET, {
      $select: LISTA_COTEJO_SELECT,
      $expand: buildExpand(params),
      $orderby: params?.orderBy ?? 'dpl_nombre asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<ListaCotejoEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapListaCotejoEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Lista de Cotejo by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, an export).
 */
export const listAllListasCotejo = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<ListaCotejo[]> => {
  const url = buildODataUrl(LISTA_COTEJO_ENTITY_SET, {
    $select: LISTA_COTEJO_SELECT,
    $orderby: params?.orderBy ?? 'dpl_nombre asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<ListaCotejoEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapListaCotejoEntity)
}

/** All checklists attached to one Sesión, ordered by name. */
export const listListasCotejoPorSesion = async (
  sesionId: string,
  options?: { includeIndicadores?: boolean; pageSize?: number },
): Promise<PaginatedResult<ListaCotejo>> =>
  listListasCotejo({
    filter: buildListaCotejoPorSesionFilter(sesionId),
    includeIndicadores: options?.includeIndicadores,
    pageSize: options?.pageSize,
  })

/**
 * Load one Lista de Cotejo header, optionally with its ordered indicadores in a
 * single round trip via $expand of `dpl_ListaCotejo_ListaCotejoIndicador`.
 *
 * When `includeIndicadores` is set and the expanded collection reports an
 * @odata.nextLink (more rows than `indicadoresTop`), the remaining rows are
 * fetched with a separate paginated query so the caller always receives the
 * complete, ordered checklist.
 */
export const getListaCotejoById = async (
  id: string,
  options?: {
    includeIndicadores?: boolean
    includeSesion?: boolean
    indicadoresTop?: number
  },
): Promise<ListaCotejo | null> => {
  const url = buildODataUrl(`${LISTA_COTEJO_ENTITY_SET}(${id})`, {
    $select: LISTA_COTEJO_SELECT,
    $expand: buildExpand(options),
  })

  const entity = await powerPagesFetch<ListaCotejoEntity>(url)
  if (!entity) return null

  const lista = mapListaCotejoEntity(entity)

  // The expanded collection was truncated — fall back to a dedicated query so
  // the caller is never handed a partial checklist.
  if (options?.includeIndicadores && lista.indicadoresNextLink) {
    const todos = await listAllIndicadores(id)
    return { ...lista, indicadores: todos, indicadoresNextLink: undefined }
  }

  return lista
}

// ── Create / update / delete: Lista de Cotejo ─────────────────────────────────

const buildListaCotejoBody = (
  payload: CreateListaCotejoInput | UpdateListaCotejoInput,
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

  // Lookup to Sesión — always via NavigationProperty@odata.bind (case-sensitive).
  // Never write to _dpl_sesionid_value. `undefined` leaves the lookup untouched.
  bindLookup(body, LISTA_COTEJO_SESION_NAV, SESION_ENTITY_SET, payload.sesionId)

  return body
}

export const createListaCotejo = async (
  payload: CreateListaCotejoInput,
): Promise<ListaCotejo> => {
  const body = buildListaCotejoBody(payload, { partial: false })
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${LISTA_COTEJO_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<ListaCotejoEntity>(response)
  if (entity?.dpl_listacotejoid) return mapListaCotejoEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getListaCotejoById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la lista de cotejo creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

export const updateListaCotejo = async (
  id: string,
  payload: UpdateListaCotejoInput,
): Promise<ListaCotejo> => {
  const body = buildListaCotejoBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${LISTA_COTEJO_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getListaCotejoById(id)
  if (!updated) throw new Error('No se pudo recuperar la lista de cotejo actualizada.')
  return updated
}

export const deleteListaCotejo = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${LISTA_COTEJO_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation: Lista de Cotejo ──────────────────────────────────────

/** Total header count without fetching rows ($top=0 + $count=true). */
export const getListaCotejoCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(LISTA_COTEJO_ENTITY_SET, {
    $select: 'dpl_listacotejoid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<ListaCotejoEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

// ═══════════════════════════════════════════════════════════════════════════════
// Indicador de Lista de Cotejo (child / checklist rows)
// ═══════════════════════════════════════════════════════════════════════════════

export interface ListIndicadoresParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 25. */
  pageSize?: number
  /** @odata.nextLink cursor from a previous page. */
  nextLink?: string
  /** Raw OData $filter expression. */
  filter?: string
  /** OData $orderby expression. Default: dpl_orden asc. */
  orderBy?: string
}

/** List indicador rows, one cursor page at a time. */
export const listIndicadores = async (
  params?: ListIndicadoresParams,
): Promise<PaginatedResult<IndicadorListaCotejo>> => {
  const pageSize = params?.pageSize ?? 25

  const url =
    params?.nextLink ??
    buildODataUrl(INDICADOR_ENTITY_SET, {
      $select: INDICADOR_SELECT,
      $orderby: params?.orderBy ?? 'dpl_orden asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<IndicadorListaCotejoEntity>>(
    url,
    { headers: { Prefer: LIST_PREFER(pageSize) } },
  )

  return {
    items: (response?.value ?? []).map(mapIndicadorEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Every indicador of one checklist, ordered by dpl_orden.
 * Follows @odata.nextLink internally — a checklist holds 1–10 rows, so this is
 * bounded in practice and is the natural way to load the editable grid.
 */
export const listAllIndicadores = async (
  listaCotejoId: string,
): Promise<IndicadorListaCotejo[]> => {
  const url = buildODataUrl(INDICADOR_ENTITY_SET, {
    $select: INDICADOR_SELECT,
    $orderby: 'dpl_orden asc',
    $filter: buildIndicadoresPorListaFilter(listaCotejoId),
    $count: 'true',
  })

  const entities = await fetchAllPages<IndicadorListaCotejoEntity>(url, 100)
  return sortIndicadores(entities.map(mapIndicadorEntity))
}

export const getIndicadorById = async (
  id: string,
): Promise<IndicadorListaCotejo | null> => {
  const url = buildODataUrl(`${INDICADOR_ENTITY_SET}(${id})`, { $select: INDICADOR_SELECT })
  const entity = await powerPagesFetch<IndicadorListaCotejoEntity>(url)
  return entity ? mapIndicadorEntity(entity) : null
}

// ── Create / update / delete: Indicador ───────────────────────────────────────

const buildIndicadorBody = (
  payload: CreateIndicadorInput | UpdateIndicadorInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_indicador', payload.indicador)
  set('dpl_orden', payload.orden)
  set('dpl_puntaje', payload.puntaje)
  // null clears the picklist (teacher un-answers the row).
  set('dpl_respuesta', payload.respuesta)
  set('dpl_observaciones', payload.observaciones)

  // Lookup to the owning Lista de Cotejo — always via @odata.bind (case-sensitive).
  bindLookup(
    body,
    INDICADOR_LISTA_COTEJO_NAV,
    LISTA_COTEJO_ENTITY_SET,
    payload.listaCotejoId,
  )

  return body
}

export const createIndicador = async (
  payload: CreateIndicadorInput,
): Promise<IndicadorListaCotejo> => {
  const body = buildIndicadorBody(payload, { partial: false })
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${INDICADOR_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  const entity = await parseResponseBody<IndicadorListaCotejoEntity>(response)
  if (entity?.dpl_listacotejoindicadorid) return mapIndicadorEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getIndicadorById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar el indicador creado: sin cuerpo de respuesta ni encabezado Location.',
  )
}

export const updateIndicador = async (
  id: string,
  payload: UpdateIndicadorInput,
): Promise<IndicadorListaCotejo> => {
  const body = buildIndicadorBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${INDICADOR_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  const updated = await getIndicadorById(id)
  if (!updated) throw new Error('No se pudo recuperar el indicador actualizado.')
  return updated
}

export const deleteIndicador = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${INDICADOR_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Checklist-grid helpers ────────────────────────────────────────────────────

/**
 * Save just the teacher's answer and observation for one grid row — the common
 * edit in the checklist UI. Pass `respuesta: null` to clear the answer.
 */
export const saveRespuestaIndicador = async (
  id: string,
  respuesta: RespuestaValue | null,
  observaciones?: string,
): Promise<IndicadorListaCotejo> =>
  updateIndicador(id, { respuesta, ...(observaciones !== undefined ? { observaciones } : {}) })

/**
 * Apply several row edits at once (the "Guardar" button of the grid).
 * Requests run sequentially so a Dataverse-side failure stops at a known point
 * rather than leaving a half-applied burst of parallel writes.
 */
export const saveIndicadoresBatch = async (
  edits: Array<{ id: string } & UpdateIndicadorInput>,
): Promise<IndicadorListaCotejo[]> => {
  const saved: IndicadorListaCotejo[] = []
  for (const { id, ...payload } of edits) {
    saved.push(await updateIndicador(id, payload))
  }
  return sortIndicadores(saved)
}

/**
 * Append a new blank row to a checklist, numbered after the current last row.
 * `dpl_orden` is constrained to 1–10 in Dataverse, so the order is clamped.
 */
export const appendIndicador = async (
  listaCotejoId: string,
  payload: Omit<CreateIndicadorInput, 'listaCotejoId' | 'orden'> & { orden?: number },
  currentIndicadores?: IndicadorListaCotejo[],
): Promise<IndicadorListaCotejo> => {
  const existing = currentIndicadores ?? (await listAllIndicadores(listaCotejoId))
  const nextOrden =
    payload.orden ?? Math.min(10, Math.max(0, ...existing.map(i => i.orden), 0) + 1)

  return createIndicador({ ...payload, orden: nextOrden, listaCotejoId })
}

/** Renumber rows 1..n after a drag-reorder or a deletion. */
export const reordenarIndicadores = async (
  orderedIds: string[],
): Promise<IndicadorListaCotejo[]> =>
  saveIndicadoresBatch(
    orderedIds.slice(0, 10).map((id, index) => ({ id, orden: index + 1 })),
  )

/**
 * Delete a checklist together with all of its indicador rows.
 * Dataverse cascade behaviour on this relationship is not guaranteed to be
 * "Cascade Delete", so children are removed explicitly first.
 */
export const deleteListaCotejoConIndicadores = async (id: string): Promise<void> => {
  const indicadores = await listAllIndicadores(id)
  for (const indicador of indicadores) {
    await deleteIndicador(indicador.id)
  }
  await deleteListaCotejo(id)
}

/** Count indicadores of one checklist without fetching the rows. */
export const getIndicadorCount = async (listaCotejoId: string): Promise<number> => {
  const url = buildODataUrl(INDICADOR_ENTITY_SET, {
    $select: 'dpl_listacotejoindicadorid',
    $filter: buildIndicadoresPorListaFilter(listaCotejoId),
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<IndicadorListaCotejoEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts of indicadores per answer, for a progress/summary tile. */
export const getIndicadorCountByRespuesta = async (
  listaCotejoId: string,
): Promise<Array<{ respuesta: number | null; count: number }>> => {
  const url = buildODataUrl(INDICADOR_ENTITY_SET, {
    $apply: `filter(${buildIndicadoresPorListaFilter(
      listaCotejoId,
    )})/groupby((dpl_respuesta),aggregate($count as count))`,
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    respuesta: (row['dpl_respuesta'] as number | null) ?? null,
    count: (row['count'] as number) ?? 0,
  }))
}
