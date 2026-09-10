// src/shared/services/rubricaCriterioService.ts
// Standalone CRUD service for "Criterio de Rúbrica" (dpl_rubricacriterio) via the
// Power Pages Web API — the individual rows of a rubric's editable grid.
//
// A rubric detail screen normally loads its criteria through
// `getRubricaById(id, { includeCriterios: true })` ($expand, one round trip).
// This module covers the row-level operations that screen also needs: adding,
// editing, reordering and removing single rows, plus a standalone paginated read
// for the rare rubric with more rows than the expand cap.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, entity set and navigation properties were verified against live
// Dataverse metadata and a live data query.

import {
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
  CRITERIO_ENTITY_SET,
  CRITERIO_RUBRICA_NAV,
  CRITERIO_RUBRICA_VALUE,
  mapRubricaCriterioEntity,
  sortCriteriosByOrden,
  type CreateRubricaCriterioInput,
  type RubricaCriterio,
  type RubricaCriterioEntity,
  type UpdateRubricaCriterioInput,
} from '../../types/rubricaCriterio'
import { RUBRICA_ENTITY_SET } from '../../types/rubrica'

// ── Select clause ─────────────────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

export const CRITERIO_SELECT = [
  'dpl_rubricacriterioid',
  'dpl_criterio',
  'dpl_orden',
  'dpl_definicioncriterio',
  'dpl_estandaresperado',
  'dpl_puntajeestandar',
  'dpl_enproceso2',
  'dpl_puntajeenproceso2',
  'dpl_enproceso1',
  'dpl_puntajeenproceso1',
  'dpl_inicial',
  'dpl_puntajeinicial',
  '_dpl_rubricaid_value',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
].join(',')

/**
 * Lighter column list used inside the parent's $expand — the four rich text
 * descriptors are large, so a rubric *list* view should not pull them.
 * The detail view uses the full CRITERIO_SELECT above.
 */
export const CRITERIO_RESUMEN_SELECT = [
  'dpl_rubricacriterioid',
  'dpl_criterio',
  'dpl_orden',
  'dpl_puntajeestandar',
  'dpl_puntajeenproceso2',
  'dpl_puntajeenproceso1',
  'dpl_puntajeinicial',
]

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Restrict to the criterion rows of one rubric. */
export const buildCriteriosDeRubricaFilter = (rubricaId: string): string =>
  `${CRITERIO_RUBRICA_VALUE} eq ${escapeODataString(rubricaId)}`

/** Case-insensitive "criterion title contains" filter. */
export const buildCriterioContainsFilter = (search: string): string =>
  `contains(dpl_criterio,'${escapeODataString(search)}')`

/** Restrict to active rows only. */
export const buildCriteriosActivosFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineFilters = (
  ...filters: Array<string | undefined>
): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── List ──────────────────────────────────────────────────────────────────────

export interface ListCriteriosParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 25. */
  pageSize?: number
  /** @odata.nextLink cursor from a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers above to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_orden asc. */
  orderBy?: string
}

/**
 * List criterion rows one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors —
 * Power Pages does not support $skip, and $top would suppress the nextLink.
 */
export const listRubricaCriterios = async (
  params?: ListCriteriosParams,
): Promise<PaginatedResult<RubricaCriterio>> => {
  const pageSize = params?.pageSize ?? 25

  const url =
    params?.nextLink ??
    buildODataUrl(CRITERIO_ENTITY_SET, {
      $select: CRITERIO_SELECT,
      $orderby: params?.orderBy ?? 'dpl_orden asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<
    ODataCollectionResponse<RubricaCriterioEntity>
  >(url, { headers: { Prefer: LIST_PREFER(pageSize) } })

  return {
    items: (response?.value ?? []).map(mapRubricaCriterioEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every criterion row of one rubric, ordered by `dpl_orden`.
 *
 * Prefer `getRubricaById(id, { includeCriterios: true })` for the detail screen —
 * it returns the header and its rows in a single request. Use this when the rows
 * are needed on their own (a refresh after an inline edit, or a rubric whose
 * expanded collection came back truncated).
 */
export const listCriteriosByRubrica = async (
  rubricaId: string,
): Promise<RubricaCriterio[]> => {
  const url = buildODataUrl(CRITERIO_ENTITY_SET, {
    $select: CRITERIO_SELECT,
    $filter: buildCriteriosDeRubricaFilter(rubricaId),
    $orderby: 'dpl_orden asc',
    $count: 'true',
  })

  const entities = await fetchAllPages<RubricaCriterioEntity>(url, 50)
  return sortCriteriosByOrden(entities.map(mapRubricaCriterioEntity))
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getRubricaCriterioById = async (
  id: string,
): Promise<RubricaCriterio | null> => {
  const url = buildODataUrl(`${CRITERIO_ENTITY_SET}(${id})`, {
    $select: CRITERIO_SELECT,
  })

  const entity = await powerPagesFetch<RubricaCriterioEntity>(url)
  return entity ? mapRubricaCriterioEntity(entity) : null
}

// ── Body builder ──────────────────────────────────────────────────────────────

/**
 * Map a domain input onto Dataverse column names.
 *
 * Rich text (HTML) values are assigned VERBATIM — no stripping or escaping. The
 * Web API accepts the HTML string as the Memo column value; sanitising belongs at
 * the render site, not here.
 */
const buildCriterioBody = (
  payload: CreateRubricaCriterioInput | UpdateRubricaCriterioInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_criterio', payload.criterio)
  set('dpl_orden', payload.orden)
  set('dpl_definicioncriterio', payload.definicionCriterio)
  set('dpl_estandaresperado', payload.estandarEsperado)
  set('dpl_puntajeestandar', payload.puntajeEstandar)
  set('dpl_enproceso2', payload.enProceso2)
  set('dpl_puntajeenproceso2', payload.puntajeEnProceso2)
  set('dpl_enproceso1', payload.enProceso1)
  set('dpl_puntajeenproceso1', payload.puntajeEnProceso1)
  set('dpl_inicial', payload.inicial)
  set('dpl_puntajeinicial', payload.puntajeInicial)

  // Parent lookup — always via NavigationProperty@odata.bind (case-sensitive),
  // never by writing to _dpl_rubricaid_value.
  bindLookup(body, CRITERIO_RUBRICA_NAV, RUBRICA_ENTITY_SET, payload.rubricaId)

  return body
}

// ── Create ────────────────────────────────────────────────────────────────────

/** Add one criterion row to a rubric. */
export const createRubricaCriterio = async (
  payload: CreateRubricaCriterioInput,
): Promise<RubricaCriterio> => {
  const body = buildCriterioBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${CRITERIO_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<RubricaCriterioEntity>(response)
  if (entity?.dpl_rubricacriterioid) return mapRubricaCriterioEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getRubricaCriterioById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar el criterio creado: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

/** Edit one criterion row. Only the supplied fields are sent. */
export const updateRubricaCriterio = async (
  id: string,
  payload: UpdateRubricaCriterioInput,
): Promise<RubricaCriterio> => {
  const body = buildCriterioBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${CRITERIO_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getRubricaCriterioById(id)
  if (!updated) throw new Error('No se pudo recuperar el criterio actualizado.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

/** Remove one criterion row from the rubric. */
export const deleteRubricaCriterio = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${CRITERIO_ENTITY_SET}(${id})`, {
    method: 'DELETE',
  })
}

// ── Reorder ───────────────────────────────────────────────────────────────────

/**
 * Persist a new row order by writing `dpl_orden` on each affected row.
 *
 * Requests are issued sequentially so a partial failure leaves a predictable
 * state; a rubric holds 3-10 rows, so the cost is negligible.
 *
 * @param orderedIds Criterion IDs in their new display order. The row at index
 *                   `i` receives `dpl_orden = i + 1`.
 */
export const reorderRubricaCriterios = async (
  orderedIds: string[],
): Promise<void> => {
  for (let index = 0; index < orderedIds.length; index++) {
    await powerPagesFetch(`/_api/${CRITERIO_ENTITY_SET}(${orderedIds[index]})`, {
      method: 'PATCH',
      headers: { 'If-Match': '*' },
      body: JSON.stringify({ dpl_orden: index + 1 }),
    })
  }
}

// ── Count ─────────────────────────────────────────────────────────────────────

/** Number of criterion rows on a rubric, without fetching them. */
export const getCriterioCountByRubrica = async (
  rubricaId: string,
): Promise<number> => {
  const url = buildODataUrl(CRITERIO_ENTITY_SET, {
    $select: 'dpl_rubricacriterioid',
    $filter: buildCriteriosDeRubricaFilter(rubricaId),
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<
    ODataCollectionResponse<RubricaCriterioEntity>
  >(url)
  return response?.['@odata.count'] ?? 0
}
