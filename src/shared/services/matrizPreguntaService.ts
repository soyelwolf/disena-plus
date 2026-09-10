// src/shared/services/matrizPreguntaService.ts
// CRUD service for the Dataverse table "Pregunta de Matriz" (dpl_matrizpregunta)
// via the Power Pages Web API — the row-level operations behind the editable grid.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, the entity set name and the navigation property were verified
// against live Dataverse metadata.

import {
  bindLookup,
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
import { MATRIZ_ENTITY_SET } from '../../types/matriz'
import {
  MATRIZ_PREGUNTA_ENTITY_SET,
  MATRIZ_PREGUNTA_PARENT_NAV,
  mapMatrizPreguntaEntity,
  sortPreguntasByOrden,
  type CreateMatrizPreguntaInput,
  type MatrizPregunta,
  type MatrizPreguntaEntity,
  type PreguntaOrdenChange,
  type UpdateMatrizPreguntaInput,
} from '../../types/matrizPregunta'

// ── Select clause ─────────────────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

/**
 * Columns selected for a Pregunta row. Note `_dpl_matrizid_value`: on GET the
 * lookup GUID is read from the `_value` property, never from the navigation
 * property (which is only used for `@odata.bind` on writes).
 */
export const MATRIZ_PREGUNTA_SELECT_COLUMNS = [
  'dpl_matrizpreguntaid',
  'dpl_ejetematico',
  'dpl_orden',
  'dpl_taxonomia',
  'dpl_tipoitem',
  'dpl_plataforma',
  'dpl_cantidaditems',
  'dpl_puntajeia',
  '_dpl_matrizid_value',
  'createdon',
  'modifiedon',
] as const

const MATRIZ_PREGUNTA_SELECT = MATRIZ_PREGUNTA_SELECT_COLUMNS.join(',')

/**
 * Columns selected when the preguntas are pulled through the parent's `$expand`.
 * The parent GUID is omitted — it is already known from the parent record.
 */
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

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Restrict rows to a single parent Matriz. Filters on the lookup's `_value` column. */
export const buildPreguntasByMatrizFilter = (matrizId: string): string =>
  `_dpl_matrizid_value eq ${escapeODataString(matrizId)}`

/** Case-insensitive "Eje Temático contains" filter. */
export const buildEjeTematicoContainsFilter = (search: string): string =>
  `contains(dpl_ejetematico,'${escapeODataString(search)}')`

/** Exact-match filter on the Bloom taxonomy level. */
export const buildTaxonomiaFilter = (taxonomia: string): string =>
  `dpl_taxonomia eq '${escapeODataString(taxonomia)}'`

/** Exact-match filter on the item type. */
export const buildTipoItemFilter = (tipoItem: string): string =>
  `dpl_tipoitem eq '${escapeODataString(tipoItem)}'`

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combinePreguntaFilters = (
  ...filters: Array<string | undefined>
): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListPreguntasParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers above to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_orden asc. */
  orderBy?: string
}

/**
 * List Pregunta rows across all matrices, one cursor page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listPreguntas = async (
  params?: ListPreguntasParams,
): Promise<PaginatedResult<MatrizPregunta>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(MATRIZ_PREGUNTA_ENTITY_SET, {
      $select: MATRIZ_PREGUNTA_SELECT,
      $orderby: params?.orderBy ?? 'dpl_orden asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<MatrizPreguntaEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapMatrizPreguntaEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Pregunta row belonging to one Matriz, ordered by `dpl_orden`.
 *
 * A Matriz normally holds 1–10 rows, so all pages are followed here to give the
 * grid the complete, correctly ordered set in a single call. Use this instead of
 * the parent's `$expand` when the grid needs to refresh rows without refetching
 * the header.
 */
export const listPreguntasByMatriz = async (
  matrizId: string,
  options?: { pageSize?: number },
): Promise<MatrizPregunta[]> => {
  const url = buildODataUrl(MATRIZ_PREGUNTA_ENTITY_SET, {
    $select: MATRIZ_PREGUNTA_SELECT,
    $filter: buildPreguntasByMatrizFilter(matrizId),
    $orderby: 'dpl_orden asc',
    $count: 'true',
  })

  const entities = await fetchAllPages<MatrizPreguntaEntity>(url, options?.pageSize ?? 50)
  return sortPreguntasByOrden(entities.map(mapMatrizPreguntaEntity))
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getPreguntaById = async (id: string): Promise<MatrizPregunta | null> => {
  const url = buildODataUrl(`${MATRIZ_PREGUNTA_ENTITY_SET}(${id})`, {
    $select: MATRIZ_PREGUNTA_SELECT,
  })

  const entity = await powerPagesFetch<MatrizPreguntaEntity>(url)
  return entity ? mapMatrizPreguntaEntity(entity) : null
}

// ── Body builder ──────────────────────────────────────────────────────────────

const buildPreguntaBody = (
  payload: CreateMatrizPreguntaInput | UpdateMatrizPreguntaInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (value !== undefined) body[column] = value
  }

  set('dpl_ejetematico', payload.ejeTematico)
  set('dpl_orden', payload.orden)
  set('dpl_taxonomia', payload.taxonomia)
  set('dpl_tipoitem', payload.tipoItem)
  set('dpl_plataforma', payload.plataforma)
  set('dpl_cantidaditems', payload.cantidadItems)
  set('dpl_puntajeia', payload.puntajeIA)

  // The parent lookup is written via `dpl_MatrizId@odata.bind` (case-sensitive
  // navigation property) — never by assigning to `_dpl_matrizid_value`.
  // On create the parent is required; on update it is only re-bound when supplied.
  const matrizId = payload.matrizId
  if (!partial) {
    bindLookup(body, MATRIZ_PREGUNTA_PARENT_NAV, MATRIZ_ENTITY_SET, matrizId)
  } else if (matrizId !== undefined) {
    bindLookup(body, MATRIZ_PREGUNTA_PARENT_NAV, MATRIZ_ENTITY_SET, matrizId)
  }

  return body
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createPregunta = async (
  payload: CreateMatrizPreguntaInput,
): Promise<MatrizPregunta> => {
  if (!payload.matrizId) {
    throw new Error('Se requiere el identificador de la matriz para crear una pregunta.')
  }

  const body = buildPreguntaBody(payload, { partial: false })

  const response = await powerPagesFetchResponse(`/_api/${MATRIZ_PREGUNTA_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<MatrizPreguntaEntity>(response)
  if (entity?.dpl_matrizpreguntaid) return mapMatrizPreguntaEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getPreguntaById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la pregunta creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updatePregunta = async (
  id: string,
  payload: UpdateMatrizPreguntaInput,
): Promise<MatrizPregunta> => {
  const body = buildPreguntaBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${MATRIZ_PREGUNTA_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getPreguntaById(id)
  if (!updated) throw new Error('No se pudo recuperar la pregunta actualizada.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deletePregunta = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${MATRIZ_PREGUNTA_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Reorder ───────────────────────────────────────────────────────────────────

/**
 * Persist new `dpl_orden` values for several rows after a drag-and-drop reorder.
 *
 * Requests are issued sequentially rather than in parallel so a partial failure
 * leaves a predictable prefix applied, and so the site does not burst past the
 * Web API request limits. Returns the rows that were updated.
 */
export const reorderPreguntas = async (
  changes: PreguntaOrdenChange[],
): Promise<MatrizPregunta[]> => {
  const updated: MatrizPregunta[] = []
  for (const change of changes) {
    updated.push(await updatePregunta(change.id, { orden: change.orden }))
  }
  return sortPreguntasByOrden(updated)
}

/**
 * Renumber a full set of rows to 1..n in the order given, and persist only the
 * rows whose `orden` actually changed. Use after an insert or removal in the grid.
 */
export const normalizePreguntaOrden = async (
  preguntas: MatrizPregunta[],
): Promise<MatrizPregunta[]> => {
  const changes = preguntas
    .map((pregunta, index) => ({ id: pregunta.id, orden: index + 1 }))
    .filter((change, index) => preguntas[index].orden !== change.orden)

  if (changes.length === 0) return sortPreguntasByOrden(preguntas)

  await reorderPreguntas(changes)
  return sortPreguntasByOrden(
    preguntas.map((pregunta, index) => ({ ...pregunta, orden: index + 1 })),
  )
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Number of Pregunta rows, optionally scoped by filter, without fetching them. */
export const getPreguntaCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(MATRIZ_PREGUNTA_ENTITY_SET, {
    $select: 'dpl_matrizpreguntaid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<MatrizPreguntaEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per Bloom taxonomy level, for coverage summary tiles. */
export const getPreguntaCountByTaxonomia = async (): Promise<
  Array<{ taxonomia: string; count: number }>
> => {
  const url = buildODataUrl(MATRIZ_PREGUNTA_ENTITY_SET, {
    $apply: 'groupby((dpl_taxonomia),aggregate($count as count))',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    taxonomia: (row['dpl_taxonomia'] as string | null) ?? 'Sin taxonomía',
    count: (row['count'] as number) ?? 0,
  }))
}

/** Total items and average IA score for one Matriz, for the grid footer. */
export const getPreguntaTotalsByMatriz = async (
  matrizId: string,
): Promise<{ totalItems: number; promedioPuntajeIA: number }> => {
  const url = buildODataUrl(MATRIZ_PREGUNTA_ENTITY_SET, {
    $apply: `filter(${buildPreguntasByMatrizFilter(
      matrizId,
    )})/aggregate(dpl_cantidaditems with sum as totalItems,dpl_puntajeia with average as promedioPuntajeIA)`,
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  const row = response?.value?.[0]
  return {
    totalItems: (row?.['totalItems'] as number) ?? 0,
    promedioPuntajeIA: (row?.['promedioPuntajeIA'] as number) ?? 0,
  }
}
