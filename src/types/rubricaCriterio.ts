// src/types/rubricaCriterio.ts
// Types for the Dataverse table "Criterio de Rúbrica" (dpl_rubricacriterio) —
// the child rows of a Rúbrica (see ./rubrica.ts for the parent header).
//
// All identifiers below were verified against live Dataverse metadata AND a live
// data query on the Buddy UTP environment (org1f6d93cb) — do not rename without
// re-verifying.
//
//   Entity set name ......... dpl_rubricacriterios
//   Primary ID attribute .... dpl_rubricacriterioid
//   Primary name attribute .. dpl_criterio
//   Parent lookup ........... dpl_rubricaid  (OData: _dpl_rubricaid_value)
//   Parent navigation prop .. dpl_RubricaId  (CASE-SENSITIVE, for @odata.bind)
//   Relationship schema ..... dpl_Rubrica_RubricaCriterio
//
// RICH TEXT: dpl_definicioncriterio, dpl_estandaresperado, dpl_enproceso2,
// dpl_enproceso1 and dpl_inicial are Memo columns that store HTML authored by a
// rich text editor. The mappers below pass these strings through UNCHANGED — no
// stripping, no escaping, no sanitising. Any sanitisation belongs at the render
// site (e.g. right before dangerouslySetInnerHTML), not in the data layer.

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const CRITERIO_ENTITY_SET = 'dpl_rubricacriterios'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const CRITERIO_PRIMARY_ID = 'dpl_rubricacriterioid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const CRITERIO_PRIMARY_NAME = 'dpl_criterio'

/**
 * Single-valued navigation property from Criterio to its parent Rubrica.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName —
 * CASE-SENSITIVE. Use with `@odata.bind` on POST/PATCH; never write to
 * `_dpl_rubricaid_value` directly.
 */
export const CRITERIO_RUBRICA_NAV = 'dpl_RubricaId'

/** OData property holding the parent Rubrica GUID on GET / in $filter. */
export const CRITERIO_RUBRICA_VALUE = '_dpl_rubricaid_value'

/** Lowest / highest accepted value for dpl_orden (business rule: 1-10). */
export const CRITERIO_ORDEN_MIN = 1
export const CRITERIO_ORDEN_MAX = 10

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — 0 = Activo, 1 = Inactivo (Dataverse default for custom tables). */
export const CRITERIO_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type CriterioStateKey = keyof typeof CRITERIO_STATE

const CRITERIO_STATE_LABELS = Object.fromEntries(
  Object.entries(CRITERIO_STATE).map(([key, val]) => [val, key]),
) as Record<number, CriterioStateKey>

// ── Raw OData entity ──────────────────────────────────────────────────────────

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface RubricaCriterioEntity {
  dpl_rubricacriterioid: string
  dpl_criterio?: string
  dpl_orden?: number
  /** Memo / rich text (HTML). */
  dpl_definicioncriterio?: string
  /** Memo / rich text (HTML). */
  dpl_estandaresperado?: string
  dpl_puntajeestandar?: number
  /** Memo / rich text (HTML). */
  dpl_enproceso2?: string
  dpl_puntajeenproceso2?: number
  /** Memo / rich text (HTML). */
  dpl_enproceso1?: string
  dpl_puntajeenproceso1?: number
  /** Memo / rich text (HTML). */
  dpl_inicial?: string
  dpl_puntajeinicial?: number
  /** Parent Rubrica GUID — read-only, set via `dpl_RubricaId@odata.bind`. */
  _dpl_rubricaid_value?: string
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain type ───────────────────────────────────────────────────────────────

/**
 * Clean shape of one criterion row for UI consumption (editable grid row).
 * The four performance-level descriptors carry HTML exactly as stored.
 */
export interface RubricaCriterio {
  id: string
  /** Criterion title (primary name column). */
  criterio: string
  /** Display order within the rubric, 1-10. */
  orden: number
  /** Rich text (HTML) — what the criterion measures. */
  definicionCriterio: string
  /** Rich text (HTML) — "Estándar esperado" descriptor. */
  estandarEsperado: string
  puntajeEstandar: number
  /** Rich text (HTML) — "En proceso 2" descriptor. */
  enProceso2: string
  puntajeEnProceso2: number
  /** Rich text (HTML) — "En proceso 1" descriptor. */
  enProceso1: string
  puntajeEnProceso1: number
  /** Rich text (HTML) — "Inicial" descriptor. */
  inicial: string
  puntajeInicial: number
  /** Parent Rubrica GUID. */
  rubricaId?: string
  estado: CriterioStateKey
  estadoLabel: string
  createdAt: string
  updatedAt: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateRubricaCriterioInput {
  /** Parent rubric GUID — bound via `dpl_RubricaId@odata.bind`. */
  rubricaId: string
  criterio: string
  orden?: number
  /** Pass raw HTML from the rich text editor. */
  definicionCriterio?: string
  /** Pass raw HTML from the rich text editor. */
  estandarEsperado?: string
  puntajeEstandar?: number
  /** Pass raw HTML from the rich text editor. */
  enProceso2?: string
  puntajeEnProceso2?: number
  /** Pass raw HTML from the rich text editor. */
  enProceso1?: string
  puntajeEnProceso1?: number
  /** Pass raw HTML from the rich text editor. */
  inicial?: string
  puntajeInicial?: number
}

export interface UpdateRubricaCriterioInput {
  criterio?: string
  orden?: number
  definicionCriterio?: string
  estandarEsperado?: string
  puntajeEstandar?: number
  enProceso2?: string
  puntajeEnProceso2?: number
  enProceso1?: string
  puntajeEnProceso1?: number
  inicial?: string
  puntajeInicial?: number
  /** Re-parent the row to a different rubric. Rarely needed. */
  rubricaId?: string
}

// ── Mapper ────────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapRubricaCriterioEntity = (
  entity: RubricaCriterioEntity,
): RubricaCriterio => {
  const state = entity.statecode ?? CRITERIO_STATE.activo
  return {
    id: entity.dpl_rubricacriterioid,
    criterio: entity.dpl_criterio ?? '',
    orden: entity.dpl_orden ?? 0,
    // Rich text passes through verbatim — see the file header note.
    definicionCriterio: entity.dpl_definicioncriterio ?? '',
    estandarEsperado: entity.dpl_estandaresperado ?? '',
    puntajeEstandar: entity.dpl_puntajeestandar ?? 0,
    enProceso2: entity.dpl_enproceso2 ?? '',
    puntajeEnProceso2: entity.dpl_puntajeenproceso2 ?? 0,
    enProceso1: entity.dpl_enproceso1 ?? '',
    puntajeEnProceso1: entity.dpl_puntajeenproceso1 ?? 0,
    inicial: entity.dpl_inicial ?? '',
    puntajeInicial: entity.dpl_puntajeinicial ?? 0,
    rubricaId: entity._dpl_rubricaid_value,
    estado: CRITERIO_STATE_LABELS[state] ?? 'activo',
    estadoLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
  }
}

/** Sort criteria by `dpl_orden` ascending, falling back to the title. */
export const sortCriteriosByOrden = (
  criterios: RubricaCriterio[],
): RubricaCriterio[] =>
  [...criterios].sort(
    (a, b) => a.orden - b.orden || a.criterio.localeCompare(b.criterio, 'es'),
  )
