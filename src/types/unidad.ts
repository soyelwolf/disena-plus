// src/types/unidad.ts
// Types for the Dataverse table "Unidad" (dpl_unidad).
//
// All column logical names, the entity set name and both navigation property
// names below were verified against live Dataverse metadata on the Buddy UTP
// environment (EntityDefinitions(LogicalName='dpl_unidad')) — do not rename
// them without re-verifying.
//
//   Entity set name ....... dpl_unidads   (irregular plural — verified, not guessed)
//   Primary ID attribute .. dpl_unidadid
//   Primary name attribute  dpl_nombreunidad
//   Parent lookup ......... dpl_cursoid  →  nav property dpl_CursoId  →  dpl_curso
//   Child collection ...... dpl_Unidad_Sesion  →  dpl_sesion

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const UNIDAD_ENTITY_SET = 'dpl_unidads'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const UNIDAD_PRIMARY_ID = 'dpl_unidadid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const UNIDAD_PRIMARY_NAME = 'dpl_nombreunidad'

/**
 * Single-valued navigation property from Unidad to its parent Curso.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship dpl_Curso_Unidad) — CASE-SENSITIVE, do not lowercase.
 * Use it in $expand and in `dpl_CursoId@odata.bind` on POST/PATCH.
 */
export const UNIDAD_CURSO_NAV = 'dpl_CursoId'

/** Read-only lookup GUID projection of dpl_cursoid — use this in $select, never in a write body. */
export const UNIDAD_CURSO_VALUE = '_dpl_cursoid_value'

/** Entity set of the parent Curso table (verified via EntityDefinitions.EntitySetName). */
export const CURSO_ENTITY_SET = 'dpl_cursos'

/**
 * Collection-valued navigation property from Unidad to its child Sesión records.
 * Verified via OneToManyRelationships.ReferencedEntityNavigationPropertyName
 * (relationship dpl_Unidad_Sesion) — CASE-SENSITIVE, do not lowercase.
 */
export const UNIDAD_SESIONES_NAV = 'dpl_Unidad_Sesion'

/** Entity set of the child Sesión table (verified via EntityDefinitions.EntitySetName). */
export const SESION_ENTITY_SET = 'dpl_sesions'

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — standard state column: 0 = Activo, 1 = Inactivo */
export const UNIDAD_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type UnidadStateKey = keyof typeof UNIDAD_STATE

const UNIDAD_STATE_LABELS = Object.fromEntries(
  Object.entries(UNIDAD_STATE).map(([key, val]) => [val, key]),
) as Record<number, UnidadStateKey>

// ── Raw OData entities ────────────────────────────────────────────────────────

/**
 * Related Curso record as returned by an $expand of `dpl_CursoId`.
 * Only the columns requested in the expand's $select are present.
 */
export interface CursoResumenEntity {
  dpl_cursoid: string
  dpl_nombrecurso?: string
  dpl_idcursotext?: string
  dpl_codigocatalogo?: string
  dpl_carrera?: string
  dpl_ciclo?: number
  [key: string]: unknown
}

/**
 * Related Sesión record as returned by an $expand of `dpl_Unidad_Sesion`.
 * Only the columns requested in the expand's $select are present.
 */
export interface SesionResumenEntity {
  dpl_sesionid: string
  dpl_elemento?: string
  dpl_idsesiontext?: string
  dpl_abreviatura?: string
  dpl_tema?: string
  [key: string]: unknown
}

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface UnidadEntity {
  dpl_unidadid: string
  dpl_nombreunidad?: string
  dpl_idunidadtext?: string
  dpl_numerounidad?: number
  dpl_logroespecifico?: string
  /** Lookup GUID — read-only projection of dpl_cursoid. Never write to it directly. */
  _dpl_cursoid_value?: string | null
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Single-valued navigation property — present only when $expand is used. */
  dpl_CursoId?: CursoResumenEntity | null
  /** Collection-valued navigation property — present only when $expand is used. */
  dpl_Unidad_Sesion?: SesionResumenEntity[]
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean shape of the parent Curso for UI consumption. */
export interface CursoResumen {
  id: string
  nombre: string
  idCursoText: string
  codigoCatalogo: string
  carrera: string
  ciclo: number
}

/** Clean shape of a child Sesión for UI consumption. */
export interface SesionResumen {
  id: string
  elemento: string
  idSesionText: string
  abreviatura: string
  tema: string
}

/** Clean domain type the UI consumes. */
export interface Unidad {
  id: string
  nombre: string
  idUnidadText: string
  numero: number
  logroEspecifico: string
  /** GUID of the parent Curso, or '' when unset. */
  cursoId: string
  /** Formatted display name of the parent Curso, when annotations are requested. */
  cursoNombre: string
  estado: UnidadStateKey
  estadoLabel: string
  createdAt: string
  updatedAt: string
  /** Populated only when the query expanded the parent Curso. */
  curso: CursoResumen | null
  /** Populated only when the query expanded the child Sesión collection. */
  sesiones: SesionResumen[]
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateUnidadInput {
  nombre: string
  idUnidadText?: string
  numero?: number
  logroEspecifico?: string
  /** Parent Curso GUID — bound via dpl_CursoId@odata.bind. */
  cursoId?: string
}

export interface UpdateUnidadInput {
  nombre?: string
  idUnidadText?: string
  numero?: number
  logroEspecifico?: string
  /** Parent Curso GUID. Pass null to clear the lookup, undefined to leave it untouched. */
  cursoId?: string | null
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapCursoResumenEntity = (entity: CursoResumenEntity): CursoResumen => ({
  id: entity.dpl_cursoid,
  nombre: entity.dpl_nombrecurso ?? '',
  idCursoText: entity.dpl_idcursotext ?? '',
  codigoCatalogo: entity.dpl_codigocatalogo ?? '',
  carrera: entity.dpl_carrera ?? '',
  ciclo: entity.dpl_ciclo ?? 0,
})

export const mapSesionResumenEntity = (entity: SesionResumenEntity): SesionResumen => ({
  id: entity.dpl_sesionid,
  elemento: entity.dpl_elemento ?? '',
  idSesionText: entity.dpl_idsesiontext ?? '',
  abreviatura: entity.dpl_abreviatura ?? '',
  tema: entity.dpl_tema ?? '',
})

export const mapUnidadEntity = (entity: UnidadEntity): Unidad => {
  const state = entity.statecode ?? UNIDAD_STATE.activo
  const expandedCurso = entity.dpl_CursoId ?? null

  return {
    id: entity.dpl_unidadid,
    nombre: entity.dpl_nombreunidad ?? '',
    idUnidadText: entity.dpl_idunidadtext ?? '',
    numero: entity.dpl_numerounidad ?? 0,
    logroEspecifico: entity.dpl_logroespecifico ?? '',
    cursoId: entity._dpl_cursoid_value ?? expandedCurso?.dpl_cursoid ?? '',
    cursoNombre:
      getFormattedValue(entity, '_dpl_cursoid_value') ?? expandedCurso?.dpl_nombrecurso ?? '',
    estado: UNIDAD_STATE_LABELS[state] ?? 'activo',
    estadoLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    curso: expandedCurso ? mapCursoResumenEntity(expandedCurso) : null,
    sesiones: (entity.dpl_Unidad_Sesion ?? []).map(mapSesionResumenEntity),
  }
}
