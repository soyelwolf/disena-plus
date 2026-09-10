// src/types/rubrica.ts
// Types for the Dataverse table "Rúbrica" (dpl_rubrica) — the header record of a
// rubric. Its child criterion rows live in ./rubricaCriterio.ts; the two are used
// together on the rubric detail screen and are re-exported here for convenience.
//
// All identifiers below were verified against live Dataverse metadata AND a live
// data query on the Buddy UTP environment (org1f6d93cb) — do not rename without
// re-verifying.
//
//   Entity set name ......... dpl_rubricas
//   Primary ID attribute .... dpl_rubricaid
//   Primary name attribute .. dpl_nombre
//   Parent lookup (Sesión) .. dpl_sesionid   (OData: _dpl_sesionid_value)
//   Sesión navigation prop .. dpl_SesionId   (CASE-SENSITIVE, for @odata.bind)
//   Criterios collection .... dpl_Rubrica_RubricaCriterio (CASE-SENSITIVE, $expand)

import { getFormattedValue } from '../shared/powerPagesApi'
import {
  mapRubricaCriterioEntity,
  sortCriteriosByOrden,
  type RubricaCriterio,
  type RubricaCriterioEntity,
} from './rubricaCriterio'

// Re-exported so a rubric screen can import the whole parent/child pair from one place.
export * from './rubricaCriterio'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const RUBRICA_ENTITY_SET = 'dpl_rubricas'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const RUBRICA_PRIMARY_ID = 'dpl_rubricaid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const RUBRICA_PRIMARY_NAME = 'dpl_nombre'

/**
 * Collection-valued navigation property from Rubrica to its child Criterio rows.
 * Verified via OneToManyRelationships.ReferencedEntityNavigationPropertyName
 * (relationship schema `dpl_Rubrica_RubricaCriterio`) — CASE-SENSITIVE, do not
 * lowercase. Used in $expand.
 */
export const RUBRICA_CRITERIOS_NAV = 'dpl_Rubrica_RubricaCriterio'

/**
 * Single-valued navigation property from Rubrica to its parent Sesión.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship schema `dpl_Sesion_Rubrica`) — CASE-SENSITIVE. Use with
 * `@odata.bind`; never write to `_dpl_sesionid_value` directly.
 */
export const RUBRICA_SESION_NAV = 'dpl_SesionId'

/** OData property holding the parent Sesión GUID on GET / in $filter. */
export const RUBRICA_SESION_VALUE = '_dpl_sesionid_value'

/** Entity set of the parent Sesión table (verified via EntityDefinitions.EntitySetName). */
export const SESION_ENTITY_SET = 'dpl_sesions'

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — 0 = Activo, 1 = Inactivo (Dataverse default for custom tables). */
export const RUBRICA_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type RubricaStateKey = keyof typeof RUBRICA_STATE

const RUBRICA_STATE_LABELS = Object.fromEntries(
  Object.entries(RUBRICA_STATE).map(([key, val]) => [val, key]),
) as Record<number, RubricaStateKey>

// ── Raw OData entity ──────────────────────────────────────────────────────────

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface RubricaEntity {
  dpl_rubricaid: string
  dpl_nombre?: string
  /** Free-text workflow state (e.g. "PROCESADO"). Not an option set. */
  dpl_estado?: string
  dpl_activado?: boolean
  dpl_usuarioregistro?: string
  dpl_fecharegistro?: string
  /** Parent Sesión GUID — read-only, set via `dpl_SesionId@odata.bind`. */
  _dpl_sesionid_value?: string
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /**
   * Child criterion rows — present only when the query expands
   * `dpl_Rubrica_RubricaCriterio`. Collection-valued expands return an array
   * (empty when there are no children).
   */
  dpl_Rubrica_RubricaCriterio?: RubricaCriterioEntity[]
  /** Index signature for OData formatted-value and nextLink annotations. */
  [key: string]: unknown
}

// ── Domain type ───────────────────────────────────────────────────────────────

/** Clean domain type the UI consumes. */
export interface Rubrica {
  id: string
  nombre: string
  estado: string
  activado: boolean
  usuarioRegistro: string
  /** ISO timestamp, or '' when not set. */
  fechaRegistro: string
  /** Parent Sesión GUID. */
  sesionId?: string
  /** Parent Sesión display name, from the lookup's formatted value. */
  sesionNombre: string
  state: RubricaStateKey
  stateLabel: string
  createdAt: string
  updatedAt: string
  /**
   * Child criterion rows, always sorted by `orden` ascending.
   * Populated only when the query expanded the criterios collection.
   */
  criterios: RubricaCriterio[]
  /**
   * Cursor for additional criterion rows, when the expanded collection was
   * truncated by the server. Normally undefined — a rubric holds 3-10 rows.
   */
  criteriosNextLink?: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateRubricaInput {
  nombre: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  /** ISO timestamp. */
  fechaRegistro?: string
  /** Parent Sesión GUID — bound via `dpl_SesionId@odata.bind`. */
  sesionId?: string
}

export interface UpdateRubricaInput {
  nombre?: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  fechaRegistro?: string
  /** Pass a GUID to re-parent, or null to clear the Sesión lookup. */
  sesionId?: string | null
}

// ── Mapper ────────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapRubricaEntity = (entity: RubricaEntity): Rubrica => {
  const state = entity.statecode ?? RUBRICA_STATE.activo
  const criterios = (entity.dpl_Rubrica_RubricaCriterio ?? []).map(
    mapRubricaCriterioEntity,
  )

  return {
    id: entity.dpl_rubricaid,
    nombre: entity.dpl_nombre ?? '',
    estado: entity.dpl_estado ?? '',
    activado: entity.dpl_activado ?? false,
    usuarioRegistro: entity.dpl_usuarioregistro ?? '',
    fechaRegistro: entity.dpl_fecharegistro ?? '',
    sesionId: entity._dpl_sesionid_value,
    sesionNombre: getFormattedValue(entity, '_dpl_sesionid_value') ?? '',
    state: RUBRICA_STATE_LABELS[state] ?? 'activo',
    stateLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    criterios: sortCriteriosByOrden(criterios),
    criteriosNextLink: entity[`${RUBRICA_CRITERIOS_NAV}@odata.nextLink`] as
      | string
      | undefined,
  }
}

// ── Score helper ──────────────────────────────────────────────────────────────

/** Sum of the "Estándar esperado" scores — the rubric's maximum total. */
export const getPuntajeMaximo = (rubrica: Rubrica): number =>
  rubrica.criterios.reduce((total, c) => total + c.puntajeEstandar, 0)
