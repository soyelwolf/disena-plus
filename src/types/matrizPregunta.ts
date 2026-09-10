// src/types/matrizPregunta.ts
// Types for the Dataverse table "Pregunta de Matriz" (dpl_matrizpregunta) —
// the child rows of a Matriz, rendered as an editable grid in the UI.
//
// All identifiers below were verified against live Dataverse metadata on
// https://org1f6d93cb.crm2.dynamics.com — do not rename them without re-verifying:
//   EntityDefinitions(LogicalName='dpl_matrizpregunta')
//   EntityDefinitions(LogicalName='dpl_matrizpregunta')/Attributes
//   EntityDefinitions(LogicalName='dpl_matrizpregunta')/ManyToOneRelationships
//
//   Entity set name ........ dpl_matrizpreguntas
//   Primary ID attribute ... dpl_matrizpreguntaid
//   Primary name attribute . dpl_ejetematico   ("Eje Temático")

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const MATRIZ_PREGUNTA_ENTITY_SET = 'dpl_matrizpreguntas'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const MATRIZ_PREGUNTA_PRIMARY_ID = 'dpl_matrizpreguntaid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const MATRIZ_PREGUNTA_PRIMARY_NAME = 'dpl_ejetematico'

/**
 * Single-valued navigation property from Pregunta de Matriz to its parent Matriz.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName on
 * relationship `dpl_Matriz_MatrizPregunta` — CASE-SENSITIVE, do not lowercase.
 *
 * Use this name with `@odata.bind` on POST/PATCH. On GET, read the raw GUID from
 * `_dpl_matrizid_value` instead (see MATRIZ_PREGUNTA_PARENT_VALUE).
 */
export const MATRIZ_PREGUNTA_PARENT_NAV = 'dpl_MatrizId'

/** Foreign-key column on the child table — verified via ReferencingAttribute. */
export const MATRIZ_PREGUNTA_PARENT_ATTRIBUTE = 'dpl_matrizid'

/** Lookup GUID property returned on GET for the parent Matriz. */
export const MATRIZ_PREGUNTA_PARENT_VALUE = '_dpl_matrizid_value'

// ── Domain constraints ────────────────────────────────────────────────────────

/** dpl_orden is constrained to 1–10 by the business rules for a Matriz. */
export const MATRIZ_PREGUNTA_ORDEN_MIN = 1
export const MATRIZ_PREGUNTA_ORDEN_MAX = 10

/**
 * Suggested Bloom's taxonomy levels for `dpl_taxonomia`.
 *
 * NOTE: `dpl_taxonomia` is a free-text String column in Dataverse, not a choice
 * column — these values are offered for UI dropdowns only and are NOT enforced
 * server-side. Any string round-trips successfully.
 */
export const TAXONOMIA_BLOOM_OPTIONS = [
  'Recordar',
  'Comprender',
  'Aplicar',
  'Analizar',
  'Evaluar',
  'Crear',
] as const

export type TaxonomiaBloom = (typeof TAXONOMIA_BLOOM_OPTIONS)[number]

/** Narrow an arbitrary taxonomy string to a known Bloom level, when it matches one. */
export const isTaxonomiaBloom = (value: string): value is TaxonomiaBloom =>
  (TAXONOMIA_BLOOM_OPTIONS as readonly string[]).includes(value)

// ── Raw OData entity ──────────────────────────────────────────────────────────

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface MatrizPreguntaEntity {
  dpl_matrizpreguntaid: string
  dpl_ejetematico?: string
  dpl_orden?: number
  dpl_taxonomia?: string
  dpl_tipoitem?: string
  dpl_plataforma?: string
  dpl_cantidaditems?: number
  dpl_puntajeia?: number
  /** Parent Matriz GUID — populated when `_dpl_matrizid_value` is in $select. */
  _dpl_matrizid_value?: string
  createdon?: string
  modifiedon?: string
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain type ───────────────────────────────────────────────────────────────

/** Clean domain type the UI consumes for one row of the editable grid. */
export interface MatrizPregunta {
  id: string
  /** Eje Temático — the primary name column. */
  ejeTematico: string
  /** Row order within the parent Matriz (1–10). */
  orden: number
  /** Bloom's taxonomy level (free text; see TAXONOMIA_BLOOM_OPTIONS). */
  taxonomia: string
  tipoItem: string
  plataforma: string
  cantidadItems: number
  puntajeIA: number
  /** Parent Matriz GUID, when selected. */
  matrizId: string
  /** Parent Matriz display name, from the lookup's formatted value. */
  matrizNombre: string
  createdAt: string
  updatedAt: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateMatrizPreguntaInput {
  /** Parent Matriz GUID — bound via `dpl_MatrizId@odata.bind`. */
  matrizId: string
  ejeTematico: string
  orden?: number
  taxonomia?: string
  tipoItem?: string
  plataforma?: string
  cantidadItems?: number
  puntajeIA?: number
}

export interface UpdateMatrizPreguntaInput {
  /** Re-parent the row to a different Matriz. Rarely needed. */
  matrizId?: string
  ejeTematico?: string
  orden?: number
  taxonomia?: string
  tipoItem?: string
  plataforma?: string
  cantidadItems?: number
  puntajeIA?: number
}

/** A single row of a reorder operation: the row id and its new position. */
export interface PreguntaOrdenChange {
  id: string
  orden: number
}

// ── Mapper ────────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapMatrizPreguntaEntity = (entity: MatrizPreguntaEntity): MatrizPregunta => ({
  id: entity.dpl_matrizpreguntaid,
  ejeTematico: entity.dpl_ejetematico ?? '',
  orden: entity.dpl_orden ?? 0,
  taxonomia: entity.dpl_taxonomia ?? '',
  tipoItem: entity.dpl_tipoitem ?? '',
  plataforma: entity.dpl_plataforma ?? '',
  cantidadItems: entity.dpl_cantidaditems ?? 0,
  puntajeIA: entity.dpl_puntajeia ?? 0,
  matrizId: entity._dpl_matrizid_value ?? '',
  matrizNombre:
    (entity['_dpl_matrizid_value@OData.Community.Display.V1.FormattedValue'] as
      | string
      | undefined) ?? '',
  createdAt: entity.createdon ?? '',
  updatedAt: entity.modifiedon ?? entity.createdon ?? '',
})

/**
 * Sort preguntas by their `orden` column ascending, with a stable tie-break on
 * Eje Temático. Rows missing an order (0) sort last rather than first.
 */
export const sortPreguntasByOrden = (preguntas: MatrizPregunta[]): MatrizPregunta[] =>
  [...preguntas].sort((a, b) => {
    const ordenA = a.orden > 0 ? a.orden : Number.MAX_SAFE_INTEGER
    const ordenB = b.orden > 0 ? b.orden : Number.MAX_SAFE_INTEGER
    if (ordenA !== ordenB) return ordenA - ordenB
    return a.ejeTematico.localeCompare(b.ejeTematico)
  })

/** Next free `orden` value for a new row appended to an existing set. */
export const nextOrden = (preguntas: MatrizPregunta[]): number => {
  const max = preguntas.reduce((acc, p) => Math.max(acc, p.orden), 0)
  return Math.min(max + 1, MATRIZ_PREGUNTA_ORDEN_MAX)
}
