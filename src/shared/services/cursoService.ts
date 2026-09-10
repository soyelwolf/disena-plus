// src/shared/services/cursoService.ts
// CRUD service for the Dataverse table "Curso" (dpl_curso) via the Power Pages Web API.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names and the entity set name were verified against live Dataverse metadata.

import {
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
  CURSO_ENTITY_SET,
  CURSO_UNIDADES_NAV,
  mapCursoEntity,
  type CreateCursoInput,
  type Curso,
  type CursoEntity,
  type UpdateCursoInput,
} from '../../types/curso'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.

const CURSO_SELECT = [
  'dpl_cursoid',
  'dpl_nombrecurso',
  'dpl_idcursotext',
  'dpl_codigocatalogo',
  'dpl_carrera',
  'dpl_tipoensenanza',
  'dpl_ciclo',
  'dpl_logrocurso',
  'dpl_permiteconsignas',
  'dpl_permiterubricas',
  'dpl_permitematrizsn',
  'dpl_permitelistacotejo',
  'dpl_permiteescala',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
].join(',')

/**
 * Optional expand of the child Unidad collection.
 * `top` caps the response size (collection-valued expands otherwise return up to
 * 5,000 related rows). Requires dpl_unidad to have its own Web API site settings
 * AND a table permission with read access — omit the expand if those are not set up.
 */
const CURSO_UNIDADES_EXPAND = buildExpandClause([
  {
    property: CURSO_UNIDADES_NAV,
    select: ['dpl_unidadid', 'dpl_nombreunidad', 'dpl_idunidadtext', 'dpl_numerounidad'],
    orderBy: 'dpl_numerounidad asc',
    top: 50,
  },
])

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListCursosParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers below to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_nombrecurso asc. */
  orderBy?: string
  /** Include the child Unidad collection via $expand. Off by default. */
  includeUnidades?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Case-insensitive "name contains" filter. */
export const buildNombreContainsFilter = (search: string): string =>
  `contains(dpl_nombrecurso,'${escapeODataString(search)}')`

/** Exact-match filter on the Carrera column. */
export const buildCarreraFilter = (carrera: string): string =>
  `dpl_carrera eq '${escapeODataString(carrera)}'`

/** Exact-match filter on the Ciclo column (numeric — no quoting). */
export const buildCicloFilter = (ciclo: number): string => `dpl_ciclo eq ${Math.trunc(ciclo)}`

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
 * List Curso records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listCursos = async (
  params?: ListCursosParams,
): Promise<PaginatedResult<Curso>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(CURSO_ENTITY_SET, {
      $select: CURSO_SELECT,
      $expand: params?.includeUnidades ? CURSO_UNIDADES_EXPAND : undefined,
      $orderby: params?.orderBy ?? 'dpl_nombrecurso asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<CursoEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapCursoEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Curso record by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, a lookup map, an export).
 */
export const listAllCursos = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
}): Promise<Curso[]> => {
  const url = buildODataUrl(CURSO_ENTITY_SET, {
    $select: CURSO_SELECT,
    $orderby: params?.orderBy ?? 'dpl_nombrecurso asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<CursoEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapCursoEntity)
}

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getCursoById = async (
  id: string,
  options?: { includeUnidades?: boolean },
): Promise<Curso | null> => {
  const url = buildODataUrl(`${CURSO_ENTITY_SET}(${id})`, {
    $select: CURSO_SELECT,
    $expand: options?.includeUnidades ? CURSO_UNIDADES_EXPAND : undefined,
  })

  const entity = await powerPagesFetch<CursoEntity>(url)
  return entity ? mapCursoEntity(entity) : null
}

// ── Create ────────────────────────────────────────────────────────────────────

const buildCursoBody = (
  payload: CreateCursoInput | UpdateCursoInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_nombrecurso', payload.nombre)
  set('dpl_idcursotext', payload.idCursoText)
  set('dpl_codigocatalogo', payload.codigoCatalogo)
  set('dpl_carrera', payload.carrera)
  set('dpl_tipoensenanza', payload.tipoEnsenanza)
  set('dpl_ciclo', payload.ciclo)
  set('dpl_logrocurso', payload.logroCurso)
  set('dpl_permiteconsignas', payload.permiteConsignas)
  set('dpl_permiterubricas', payload.permiteRubricas)
  set('dpl_permitematrizsn', payload.permiteMatrizSN)
  set('dpl_permitelistacotejo', payload.permiteListaCotejo)
  set('dpl_permiteescala', payload.permiteEscala)

  // dpl_curso has no custom lookup columns, so no NavigationProperty@odata.bind
  // annotations are needed here. If a lookup is added later, bind it with
  // bindLookup(body, 'dpl_SomeNav', 'dpl_targets', id) — never write to _..._value.

  return body
}

export const createCurso = async (payload: CreateCursoInput): Promise<Curso> => {
  const body = buildCursoBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${CURSO_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<CursoEntity>(response)
  if (entity?.dpl_cursoid) return mapCursoEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getCursoById(createdId)
    if (created) return created
  }

  throw new Error('No se pudo recuperar el curso creado: sin cuerpo de respuesta ni encabezado Location.')
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateCurso = async (id: string, payload: UpdateCursoInput): Promise<Curso> => {
  const body = buildCursoBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${CURSO_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getCursoById(id)
  if (!updated) throw new Error('No se pudo recuperar el curso actualizado.')
  return updated
}

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteCurso = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${CURSO_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getCursoCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(CURSO_ENTITY_SET, {
    $select: 'dpl_cursoid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<CursoEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Grouped counts per Carrera, for catalogue summary tiles or filter facets. */
export const getCursoCountByCarrera = async (): Promise<
  Array<{ carrera: string; count: number }>
> => {
  const url = buildODataUrl(CURSO_ENTITY_SET, {
    $apply: 'groupby((dpl_carrera),aggregate($count as count))',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<Record<string, unknown>>>(url)
  return (response?.value ?? []).map(row => ({
    carrera:
      (row['dpl_carrera'] as string | null) ??
      getFormattedValue(row, 'dpl_carrera') ??
      'Sin carrera',
    count: (row['count'] as number) ?? 0,
  }))
}
