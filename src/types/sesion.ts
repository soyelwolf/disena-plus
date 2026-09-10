// src/types/sesion.ts
// Types for the Dataverse table "Sesión / Elemento" (dpl_sesion).
//
// All column logical names below were verified against live Dataverse metadata
// (EntityDefinitions(LogicalName='dpl_sesion')/Attributes and /ManyToOneRelationships)
// on the Buddy UTP environment — do not rename them without re-verifying.
//
//   Entity set name ....... dpl_sesions
//   Primary ID attribute .. dpl_sesionid
//   Primary name attribute  dpl_elemento
//   Parent lookup ......... dpl_unidadid  →  nav property dpl_UnidadId  →  dpl_unidad

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const SESION_ENTITY_SET = 'dpl_sesions'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const SESION_PRIMARY_ID = 'dpl_sesionid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const SESION_PRIMARY_NAME = 'dpl_elemento'

/**
 * Single-valued navigation property from Sesión to its parent Unidad.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship dpl_Unidad_Sesion) — CASE-SENSITIVE, do not lowercase.
 * Use it in $expand and in `dpl_UnidadId@odata.bind` on POST/PATCH.
 */
export const SESION_UNIDAD_NAV = 'dpl_UnidadId'

/** Raw lookup GUID property returned on GET — use this one in $select. */
export const SESION_UNIDAD_VALUE = '_dpl_unidadid_value'

/** Entity set of the parent Unidad table (verified via EntityDefinitions.EntitySetName). */
export const UNIDAD_ENTITY_SET = 'dpl_unidads'

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — standard Dataverse state: 0 = Activo, 1 = Inactivo */
export const SESION_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type SesionStateKey = keyof typeof SESION_STATE

const SESION_STATE_LABELS = Object.fromEntries(
  Object.entries(SESION_STATE).map(([key, val]) => [val, key]),
) as Record<number, SesionStateKey>

// ── Raw OData entities ────────────────────────────────────────────────────────

/**
 * Related Unidad record as returned by an $expand of `dpl_UnidadId`.
 * Only the columns requested in the expand's $select are present.
 */
export interface UnidadResumenEntity {
  dpl_unidadid: string
  dpl_nombreunidad?: string
  dpl_idunidadtext?: string
  dpl_numerounidad?: number
  dpl_logroespecifico?: string
  [key: string]: unknown
}

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface SesionEntity {
  dpl_sesionid: string
  dpl_elemento?: string
  dpl_idsesiontext?: string
  dpl_abreviatura?: string
  dpl_tema?: string
  /** Lookup GUID — read-only projection of dpl_unidadid. Never write to it directly. */
  _dpl_unidadid_value?: string | null
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Single-valued navigation property — present only when $expand is used. */
  dpl_UnidadId?: UnidadResumenEntity | null
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean shape of the parent Unidad for UI consumption. */
export interface UnidadResumen {
  id: string
  nombre: string
  idUnidadText: string
  numero: number
  /** dpl_logroespecifico — the unit's learning outcome, shown read-only as "Logro a evaluar". */
  logroEspecifico: string
}

/** Clean domain type the UI consumes. */
export interface Sesion {
  id: string
  /** Primary name column (dpl_elemento) — "Elemento". */
  elemento: string
  idSesionText: string
  abreviatura: string
  tema: string
  /** GUID of the parent Unidad, or '' when unset. */
  unidadId: string
  /** Formatted display name of the parent Unidad, when annotations are requested. */
  unidadNombre: string
  estado: SesionStateKey
  estadoLabel: string
  createdAt: string
  updatedAt: string
  /** Populated only when the query expanded the parent Unidad. */
  unidad: UnidadResumen | null
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateSesionInput {
  /** Required — dpl_elemento is ApplicationRequired in Dataverse. */
  elemento: string
  /** Required — dpl_idsesiontext is ApplicationRequired in Dataverse. */
  idSesionText: string
  abreviatura?: string
  tema?: string
  /** Parent Unidad GUID — bound via dpl_UnidadId@odata.bind. */
  unidadId?: string
}

export interface UpdateSesionInput {
  elemento?: string
  idSesionText?: string
  abreviatura?: string
  tema?: string
  /** Parent Unidad GUID. Pass null to clear the lookup, undefined to leave it untouched. */
  unidadId?: string | null
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapUnidadResumenEntity = (entity: UnidadResumenEntity): UnidadResumen => ({
  id: entity.dpl_unidadid,
  nombre: entity.dpl_nombreunidad ?? '',
  idUnidadText: entity.dpl_idunidadtext ?? '',
  numero: entity.dpl_numerounidad ?? 0,
  logroEspecifico: entity.dpl_logroespecifico ?? '',
})

export const mapSesionEntity = (entity: SesionEntity): Sesion => {
  const state = entity.statecode ?? SESION_STATE.activo
  const expandedUnidad = entity.dpl_UnidadId ?? null
  return {
    id: entity.dpl_sesionid,
    elemento: entity.dpl_elemento ?? '',
    idSesionText: entity.dpl_idsesiontext ?? '',
    abreviatura: entity.dpl_abreviatura ?? '',
    tema: entity.dpl_tema ?? '',
    unidadId: entity._dpl_unidadid_value ?? expandedUnidad?.dpl_unidadid ?? '',
    unidadNombre:
      getFormattedValue(entity, '_dpl_unidadid_value') ?? expandedUnidad?.dpl_nombreunidad ?? '',
    estado: SESION_STATE_LABELS[state] ?? 'activo',
    estadoLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    unidad: expandedUnidad ? mapUnidadResumenEntity(expandedUnidad) : null,
  }
}
