// src/shared/services/unidadService.ts
// CRUD service for the Dataverse table "Unidad" (dpl_unidad) via the Power Pages Web API.
//
// All URLs go through the /_api/ prefix — never the Dataverse environment URL.
// Column names, the entity set name (dpl_unidads) and both navigation property
// names were verified against live Dataverse metadata.

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
  CURSO_ENTITY_SET,
  UNIDAD_CURSO_NAV,
  UNIDAD_ENTITY_SET,
  UNIDAD_SESIONES_NAV,
  mapUnidadEntity,
  type CreateUnidadInput,
  type Unidad,
  type UnidadEntity,
  type UpdateUnidadInput,
} from '../../types/unidad'

// ── Select / expand clauses ───────────────────────────────────────────────────
// Explicit column list — never use a wildcard $select.
// The lookup is read as its `_value` GUID projection; the navigation property is
// only ever used in $expand (reads) and @odata.bind (writes).

const UNIDAD_SELECT = [
  'dpl_unidadid',
  'dpl_nombreunidad',
  'dpl_idunidadtext',
  'dpl_numerounidad',
  'dpl_logroespecifico',
  '_dpl_cursoid_value',
  'statecode',
  'statuscode',
  'createdon',
  'modifiedon',
].join(',')

/**
 * Optional expand of the parent Curso lookup.
 * Requires dpl_curso to have its own Web API site settings AND a table permission
 * with read access — omit the expand if those are not set up.
 */
const UNIDAD_CURSO_EXPAND = buildExpandClause([
  {
    property: UNIDAD_CURSO_NAV,
    select: [
      'dpl_cursoid',
      'dpl_nombrecurso',
      'dpl_idcursotext',
      'dpl_codigocatalogo',
      'dpl_carrera',
      'dpl_ciclo',
    ],
  },
])

/**
 * Optional expand of the child Sesión collection.
 * `top` caps the response size (collection-valued expands otherwise return up to
 * 5,000 related rows). Requires dpl_sesion to have its own Web API site settings
 * AND a table permission with read access.
 *
 * Note: $orderby and $top on a collection-valued expand are NOT honoured when the
 * query contains any nested $expand — this expand is deliberately kept flat.
 */
const UNIDAD_SESIONES_EXPAND = buildExpandClause([
  {
    property: UNIDAD_SESIONES_NAV,
    select: ['dpl_sesionid', 'dpl_elemento', 'dpl_idsesiontext', 'dpl_abreviatura', 'dpl_tema'],
    orderBy: 'dpl_elemento asc',
    top: 100,
  },
])

/** Combine the requested expands into a single $expand clause, or undefined when none. */
const buildUnidadExpand = (options?: {
  includeCurso?: boolean
  includeSesiones?: boolean
}): string | undefined => {
  const parts = [
    options?.includeCurso ? UNIDAD_CURSO_EXPAND : undefined,
    options?.includeSesiones ? UNIDAD_SESIONES_EXPAND : undefined,
  ].filter((part): part is string => !!part)

  return parts.length > 0 ? parts.join(',') : undefined
}

const LIST_PREFER = (pageSize: number) =>
  `odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=${pageSize}`

// ── Query params ──────────────────────────────────────────────────────────────

export interface ListUnidadesParams {
  /** Page size, applied via the Prefer: odata.maxpagesize header. Default 20. */
  pageSize?: number
  /** @odata.nextLink cursor returned by a previous page. Power Pages does not support $skip. */
  nextLink?: string
  /** Raw OData $filter expression. Use the helpers below to build one safely. */
  filter?: string
  /** OData $orderby expression. Default: dpl_numerounidad asc. */
  orderBy?: string
  /** Include the parent Curso via $expand. Off by default. */
  includeCurso?: boolean
  /** Include the child Sesión collection via $expand. Off by default. */
  includeSesiones?: boolean
}

// ── Filter helpers ────────────────────────────────────────────────────────────
// Always route user-supplied text through escapeODataString to avoid filter injection.

/** Case-insensitive "name contains" filter. */
export const buildNombreContainsFilter = (search: string): string =>
  `contains(dpl_nombreunidad,'${escapeODataString(search)}')`

/**
 * Restrict to the Unidad records belonging to one Curso.
 * Filters on the lookup's `_value` GUID projection — GUIDs are not quoted in OData.
 */
export const buildCursoFilter = (cursoId: string): string =>
  `_dpl_cursoid_value eq ${escapeODataString(cursoId)}`

/** Exact-match filter on the Número de Unidad column (numeric — no quoting). */
export const buildNumeroFilter = (numero: number): string =>
  `dpl_numerounidad eq ${Math.trunc(numero)}`

/** Exact-match filter on the ID Unidad text column. */
export const buildIdUnidadTextFilter = (idUnidadText: string): string =>
  `dpl_idunidadtext eq '${escapeODataString(idUnidadText)}'`

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
 * List Unidad records, one page at a time.
 * Pagination uses `Prefer: odata.maxpagesize` + `@odata.nextLink` cursors — Power Pages
 * does not support $skip, and $top would suppress the nextLink.
 */
export const listUnidades = async (
  params?: ListUnidadesParams,
): Promise<PaginatedResult<Unidad>> => {
  const pageSize = params?.pageSize ?? 20

  const url =
    params?.nextLink ??
    buildODataUrl(UNIDAD_ENTITY_SET, {
      $select: UNIDAD_SELECT,
      $expand: buildUnidadExpand(params),
      $orderby: params?.orderBy ?? 'dpl_numerounidad asc',
      $filter: params?.filter,
      $count: 'true',
    })

  const response = await powerPagesFetch<ODataCollectionResponse<UnidadEntity>>(url, {
    headers: { Prefer: LIST_PREFER(pageSize) },
  })

  return {
    items: (response?.value ?? []).map(mapUnidadEntity),
    totalCount: response?.['@odata.count'] ?? response?.value?.length ?? 0,
    nextLink: response?.['@odata.nextLink'],
  }
}

/**
 * Fetch every Unidad record by following @odata.nextLink cursors.
 * Use only where all records are genuinely needed (a dropdown, a lookup map, an export).
 */
export const listAllUnidades = async (params?: {
  filter?: string
  orderBy?: string
  pageSize?: number
  /** Include the parent Curso via $expand. Off by default. */
  includeCurso?: boolean
}): Promise<Unidad[]> => {
  const url = buildODataUrl(UNIDAD_ENTITY_SET, {
    $select: UNIDAD_SELECT,
    $expand: params?.includeCurso ? UNIDAD_CURSO_EXPAND : undefined,
    $orderby: params?.orderBy ?? 'dpl_numerounidad asc',
    $filter: params?.filter,
    $count: 'true',
  })

  const entities = await fetchAllPages<UnidadEntity>(url, params?.pageSize ?? 100)
  return entities.map(mapUnidadEntity)
}

/**
 * List the Unidad records of a single Curso, ordered by unit number.
 * Convenience wrapper over listUnidades with the lookup filter pre-applied.
 */
export const listUnidadesByCurso = async (
  cursoId: string,
  params?: Omit<ListUnidadesParams, 'filter'>,
): Promise<PaginatedResult<Unidad>> =>
  listUnidades({ ...params, filter: buildCursoFilter(cursoId) })

// ── Get by ID ─────────────────────────────────────────────────────────────────

export const getUnidadById = async (
  id: string,
  options?: { includeCurso?: boolean; includeSesiones?: boolean },
): Promise<Unidad | null> => {
  const url = buildODataUrl(`${UNIDAD_ENTITY_SET}(${id})`, {
    $select: UNIDAD_SELECT,
    $expand: buildUnidadExpand(options),
  })

  // A page size is required so the expanded Sesión collection returns an
  // @odata.nextLink when it has more rows than the cap.
  const entity = await powerPagesFetch<UnidadEntity>(url, {
    headers: {
      Prefer:
        'odata.include-annotations="OData.Community.Display.V1.FormattedValue",odata.maxpagesize=100',
    },
  })

  return entity ? mapUnidadEntity(entity) : null
}

// ── Create / Update body ──────────────────────────────────────────────────────

const buildUnidadBody = (
  payload: CreateUnidadInput | UpdateUnidadInput,
  { partial }: { partial: boolean },
): Record<string, unknown> => {
  const body: Record<string, unknown> = {}
  const set = (column: string, value: unknown) => {
    if (!partial || value !== undefined) body[column] = value
  }

  set('dpl_nombreunidad', payload.nombre)
  set('dpl_idunidadtext', payload.idUnidadText)
  set('dpl_numerounidad', payload.numero)
  set('dpl_logroespecifico', payload.logroEspecifico)

  // Lookup writes must go through the CASE-SENSITIVE navigation property with
  // @odata.bind — writing to _dpl_cursoid_value raises "Undeclared Property".
  // Passing null clears the lookup; passing undefined leaves it untouched.
  bindLookup(body, UNIDAD_CURSO_NAV, CURSO_ENTITY_SET, payload.cursoId)

  return body
}

// ── Create ────────────────────────────────────────────────────────────────────

export const createUnidad = async (payload: CreateUnidadInput): Promise<Unidad> => {
  const body = buildUnidadBody(payload, { partial: false })

  // Drop undefined optional values so the payload only carries real columns.
  for (const key of Object.keys(body)) {
    if (body[key] === undefined) delete body[key]
  }

  const response = await powerPagesFetchResponse(`/_api/${UNIDAD_ENTITY_SET}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })

  // The API may return the created entity, or just a status plus a Location header.
  const entity = await parseResponseBody<UnidadEntity>(response)
  if (entity?.dpl_unidadid) return mapUnidadEntity(entity)

  const createdId = extractRecordId(response)
  if (createdId) {
    const created = await getUnidadById(createdId)
    if (created) return created
  }

  throw new Error(
    'No se pudo recuperar la unidad creada: sin cuerpo de respuesta ni encabezado Location.',
  )
}

// ── Update ────────────────────────────────────────────────────────────────────

export const updateUnidad = async (
  id: string,
  payload: UpdateUnidadInput,
): Promise<Unidad> => {
  const body = buildUnidadBody(payload, { partial: true })

  await powerPagesFetch(`/_api/${UNIDAD_ENTITY_SET}(${id})`, {
    method: 'PATCH',
    headers: { 'If-Match': '*' },
    body: JSON.stringify(body),
  })

  // PATCH returns 204 with no body — refetch to return the current record.
  const updated = await getUnidadById(id)
  if (!updated) throw new Error('No se pudo recuperar la unidad actualizada.')
  return updated
}

/** Re-parent a Unidad to another Curso (or clear the lookup with null). */
export const setUnidadCurso = async (
  id: string,
  cursoId: string | null,
): Promise<Unidad> => updateUnidad(id, { cursoId })

// ── Delete ────────────────────────────────────────────────────────────────────

export const deleteUnidad = async (id: string): Promise<void> => {
  await powerPagesFetch(`/_api/${UNIDAD_ENTITY_SET}(${id})`, { method: 'DELETE' })
}

// ── Count & aggregation ───────────────────────────────────────────────────────

/** Total record count without fetching rows ($top=0 + $count=true). */
export const getUnidadCount = async (filter?: string): Promise<number> => {
  const url = buildODataUrl(UNIDAD_ENTITY_SET, {
    $select: 'dpl_unidadid',
    $filter: filter,
    $count: 'true',
    $top: '0',
  })

  const response = await powerPagesFetch<ODataCollectionResponse<UnidadEntity>>(url)
  return response?.['@odata.count'] ?? 0
}

/** Number of Unidad records that belong to a given Curso. */
export const getUnidadCountByCurso = async (cursoId: string): Promise<number> =>
  getUnidadCount(buildCursoFilter(cursoId))

/**
 * Grouped Unidad counts per parent Curso, for summary tiles or filter facets.
 *
 * NOTE: this deliberately does NOT use `$apply=groupby(...)`. Dataverse rejects
 * grouping on this lookup in every accepted spelling — verified against the live
 * environment: `_dpl_cursoid_value` and `dpl_CursoId` both fail with 0x80041103
 * ("entity doesn't contain attribute with Name = ..."), and `dpl_cursoid` fails
 * with 0x80060888 ("Could not find a property named ..."). Grouping is therefore
 * done client-side over a bounded, cursor-paginated fetch. Pass a `filter` to keep
 * the scanned set small on large tables.
 */
export const getUnidadCountGroupedByCurso = async (params?: {
  filter?: string
  pageSize?: number
}): Promise<Array<{ cursoId: string; cursoNombre: string; count: number }>> => {
  const unidades = await listAllUnidades({
    filter: params?.filter,
    pageSize: params?.pageSize ?? 100,
    includeCurso: true,
  })

  const groups = new Map<string, { cursoId: string; cursoNombre: string; count: number }>()

  for (const unidad of unidades) {
    const cursoId = unidad.curso?.id ?? unidad.cursoId ?? ''
    const existing = groups.get(cursoId)
    if (existing) {
      existing.count += 1
      // Backfill the label if an earlier row lacked one.
      if (existing.cursoNombre === 'Sin curso') {
        existing.cursoNombre = unidad.curso?.nombre || unidad.cursoNombre || 'Sin curso'
      }
      continue
    }
    groups.set(cursoId, {
      cursoId,
      cursoNombre: unidad.curso?.nombre || unidad.cursoNombre || 'Sin curso',
      count: 1,
    })
  }

  return [...groups.values()].sort((a, b) => b.count - a.count)
}
