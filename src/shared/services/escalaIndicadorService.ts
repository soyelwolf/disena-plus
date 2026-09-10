// src/shared/services/escalaIndicadorService.ts
// CRUD service for the Dataverse table "Indicador de Escala" (dpl_escalaindicador)
// via the Power Pages Web API.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, the entity set name and the navigation property names were
// verified against live Dataverse metadata.

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
import {
  ESCALA_INDICADOR_ENTITY_SET,
  ESCALA_INDICADOR_PARENT_NAV,
  ESCALA_INDICADOR_PARENT_VALUE,
  mapEscalaIndicadorEntity,
  respuestaStoredValue,
  sortIndicadores,
  type CreateEscalaIndicadorInput,
  type EscalaIndicador,
  type EscalaIndicadorEntity,
  type EvaluacionIndicadorInput,
  type UpdateEscalaIndicadorInput,
} from '../../types/escalaIndicador'
import { ESCALA_VALORACION_ENTITY_SET } from '../../types/escalaValoracion'

// ── Select clause ─────────────────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

export const ESCALA_INDICADOR_SELECT_COLUMNS = [
  'dpl_escalaindicadorid',
  'dpl_indicador',
  'dpl_orden',
  'dpl_puntajeexcelente',
  'dpl_puntajebueno',
  'dpl_puntajeregular',
  'dpl_puntajeconerrores',
  'dpl_puntajenoevidenciado',
  'dpl_respuestaseleccionada',
  'dpl_observaciones',
  ESCALA_INDICADOR_PARENT_VALUE,
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
] as const

const ESCALA_INDICADOR_SELECT = ESCALA_INDICADOR_SELECT_COLUMNS.join(',')

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** All indicadores belonging to one Escala de Valoración. */
export const buildIndicadoresDeEscalaFilter = (escalaValoracionId: string): string =>
  `${ESCALA_INDICADOR_PARENT_VALUE} eq ${escapeODataString(escalaValoracionId)}`

/** Case-insensitive "indicator text contains" filter. */
export const buildIndicadorContainsFilter = (search: string): string =>
  `contains(dpl_indicador,'${escapeODataString(search)}')`

/** Rows that still have no tier selected. */
export const buildSinRespuestaFilter = (): string =>
  "(dpl_respuestaseleccionada eq null or dpl_respuestaseleccionada eq '')"

/** Restrict to active records only. */
export const buildIndicadoresActivosFilter = (): string => 'statecode eq 0'

/** Combine several filter fragments with `and`, dropping empty ones. */
export const combineIndicadorFilters = (
  ...filters: Array<string | undefined>
): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  return parts.map(f => `(${f})`).join(' and ')
}

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListEscalaIndicadoresParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers above to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_orden asc. */
  orderBy?: string
}

// ── List (cursor paginated) ───────────────────────────────────────────────────

/**
 * List Indicador de Escala records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listEscalaIndicadores = async (
  params?: ListEscalaIndicadoresParams,
): Promise<PaginatedResult<EscalaIndicador>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(ESCALA_INDICADOR_ENTITY_SET, {
      $select: ESCALA_INDICADOR_SELECT,
      $orderby: params?.orderBy ?? 'dpl_orden asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<EscalaIndicadorEntity>>(
    url,
    { headers: { Prefer: LIST_PREFER(pageSize) } },
  )

  return {
    items: (response?.value ?? []).map(mapEscalaIndicadorEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every indicador of one Escala de Valoración, ordered by dpl_orden.
 *
 * An escala normally has 1–10 rows, so following the cursor to completion is safe
 * here. Use this instead of $expand when the parent header is already loaded, or
 * when the child table has its own Web API/table permissions but the expand is
 * blocked.
 */
export const listIndicadoresByEscala = async (
  escalaValoracionId: string,
  options?: { pageSize?: number; extraFilter?: string },
): Promise<EscalaIndicador[]> => {
  const url = buildODataUrl(ESCALA_INDICADOR_ENTITY_SET, {
    $select: ESCALA_INDICADOR_SELECT,
    $orderby: 'dpl_orden asc',
    $filter: combineIndicadorFilters(
      buildIndicadoresDeEscalaFilter(escalaValoracionId),
      options?.extraFilter,
    ),
    $count: 'true',
  })

  const entities = await fetchAllPages<EscalaIndicadorEntity>(url, options?.pageSize ?? 50)
  return sortIndicadores(entities.map(mapEscalaIndicadorEntity))
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getEscalaIndicadorById = async (
  id: string,
): Promise<EscalaIndicador | null> => {
  const url = buildODataUrl(`${ESCALA_INDICADOR_ENTITY_SET}(${id})`, {
    $select: ESCALA_INDICADOR_SELECT,
  })

  const entity = await powerPagesFetch<EscalaIndicadorEntity>(url)
  return entity ? mapEscalaIndicadorEntity(entity) : null
}

// ── Body builder ──────────────────────────────────────────────────────────────

const buildEscalaIndicadorBody = (
  payload: CreateEscalaIndicadorInput | UpdateEscalaIndicadorInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_indicador', payload.indicador)
  set('dpl_orden', payload.orden)
  set('dpl_puntajeexcelente', payload.puntajeExcelente)
  set('dpl_puntajebueno', payload.puntajeBueno)
  set('dpl_puntajeregular', payload.puntajeRegular)
  set('dpl_puntajeconerrores', payload.puntajeConErrores)
  set('dpl_puntajenoevidenciado', payload.puntajeNoEvidenciado)
  set('dpl_observaciones', payload.observaciones)

  // respuesta is a tier key in the domain model; Dataverse stores the label text.
  if (!partial || payload.respuesta !== undefined) {
    body['dpl_respuestaseleccionada'] = respuestaStoredValue(payload.respuesta ?? null)
  }

  // Lookups are always written through @odata.bind on the navigation property —
  // never by assigning a GUID to the _..._value property.
  bindLookup(
    body,
    ESCALA_INDICADOR_PARENT_NAV,
    ESCALA_VALORACION_ENTITY_SET,
    payload.escalaValoracionId,
  )

  return body
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createEscalaIndicador = async (
  payload: CreateEscalaIndicadorInput,
): Promise<EscalaIndicador> => {
  const body = buildEscalaIndicadorBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${ESCALA_INDICADOR_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<EscalaIndicadorEntity>(response)
  if (entity?.dpl_escalaindicadorid) return mapEscalaIndicadorEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getEscalaIndicadorById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar el indicador creado: sin cuerpo de respuesta ni encabezado Location.',
  )
}

/**
 * Create several indicadores for one escala, in order.
 * Requests are sequential so a failure leaves a predictable partial state and the
 * caller can retry from the returned list length.
 */
export const createEscalaIndicadores = async (
  escalaValoracionId: string,
  rows: Array<Omit<CreateEscalaIndicadorInput, 'escalaValoracionId'>>,
): Promise<EscalaIndicador[]> => {
  const created: EscalaIndicador[] = []
  for (const row of rows) {
    created.push(await createEscalaIndicador({ ...row, escalaValoracionId }))
  }
  return sortIndicadores(created)
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateEscalaIndicador = async (
  id: string,
  payload: UpdateEscalaIndicadorInput,
): Promise<EscalaIndicador> => {
  const body = buildEscalaIndicadorBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${ESCALA_INDICADOR_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getEscalaIndicadorById(id)
  if (!updated) throw new Error('No se pudo recuperar el indicador actualizado.')
  return updated
}

/**
 * Save what the teacher edits in the grid for one row: the selected score tier
 * and the observaciones text. Observaciones is only sent when provided.
 */
export const saveEvaluacionIndicador = async (
  input: EvaluacionIndicadorInput,
): Promise<EscalaIndicador> =>
  updateEscalaIndicador(input.id, {
    respuesta: input.respuesta,
    ...(input.observaciones !== undefined ? { observaciones: input.observaciones } : {}),
  })

/**
 * Save the whole grid. Rows are saved sequentially; the returned array is ordered
 * by dpl_orden. Throws on the first failure — already-saved rows stay saved.
 */
export const saveEvaluacionIndicadores = async (
  inputs: EvaluacionIndicadorInput[],
): Promise<EscalaIndicador[]> => {
  const saved: EscalaIndicador[] = []
  for (const input of inputs) {
    saved.push(await saveEvaluacionIndicador(input))
  }
  return sortIndicadores(saved)
}

/** Move a row to a different position (dpl_orden is constrained to 1–10). */
export const reorderEscalaIndicador = async (
  id: string,
  orden: number,
): Promise<EscalaIndicador> => updateEscalaIndicador(id, { orden })

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteEscalaIndicador = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${ESCALA_INDICADOR_ENTITY_SET}(${id})`, {
    method: 'DELETE',
  })
}

/** Delete every indicador of one escala (used when clearing or rebuilding a scale). */
export const deleteIndicadoresByEscala = async (
  escalaValoracionId: string,
): Promise<number> => {
  const rows = await listIndicadoresByEscala(escalaValoracionId)
  for (const row of rows) {
    await deleteEscalaIndicador(row.id)
  }
  return rows.length
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getEscalaIndicadorCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(ESCALA_INDICADOR_ENTITY_SET, {
    $select: 'dpl_escalaindicadorid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response =
    await powerPagesFetch<ODataCollectionResponse<EscalaIndicadorEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/**
 * Grouped counts per selected tier, for progress tiles
 * ("3 Excelente / 2 Bueno / 1 sin evaluar").
 */
export const getIndicadorCountByRespuesta = async (
  escalaValoracionId?: string,
): Promise<Array<{ respuesta: string; count: number }>> => {
  const filter = escalaValoracionId
    ? buildIndicadoresDeEscalaFilter(escalaValoracionId)
    : undefined

  const url = buildODataUrl(ESCALA_INDICADOR_ENTITY_SET, {
    $apply: [
      filter ? `filter(${filter})` : undefined,
      'groupby((dpl_respuestaseleccionada),aggregate($count as count))',
    ]
      .filter(Boolean)
      .join('/'),
  })

  const response =
    await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    respuesta: (row['dpl_respuestaseleccionada'] as string | null) ?? 'Sin evaluar',
    count: (row['count'] as number) ?? 0,
  }))
}
