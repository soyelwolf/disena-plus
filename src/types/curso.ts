// src/types/curso.ts
// Types for the Dataverse table "Curso" (dpl_curso).
//
// All column logical names below were verified against live Dataverse metadata
// (EntityDefinitions(LogicalName='dpl_curso')/Attributes) on the Buddy UTP
// environment — do not rename them without re-verifying.
//
//   Entity set name ....... dpl_cursos
//   Primary ID attribute .. dpl_cursoid
//   Primary name attribute  dpl_nombrecurso

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const CURSO_ENTITY_SET = 'dpl_cursos'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const CURSO_PRIMARY_ID = 'dpl_cursoid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const CURSO_PRIMARY_NAME = 'dpl_nombrecurso'

/**
 * Collection-valued navigation property from Curso to its child Unidad records.
 * Verified via OneToManyRelationships.ReferencedEntityNavigationPropertyName —
 * CASE-SENSITIVE, do not lowercase.
 */
export const CURSO_UNIDADES_NAV = 'dpl_Curso_Unidad'

/** Entity set of the child Unidad table (verified via EntityDefinitions.EntitySetName). */
export const UNIDAD_ENTITY_SET = 'dpl_unidads'

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — verified option values: 0 = Activo, 1 = Inactivo */
export const CURSO_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type CursoStateKey = keyof typeof CURSO_STATE

const CURSO_STATE_LABELS = Object.fromEntries(
  Object.entries(CURSO_STATE).map(([key, val]) => [val, key]),
) as Record<number, CursoStateKey>

// ── Raw OData entities ────────────────────────────────────────────────────────

/**
 * Related Unidad record as returned by an $expand of `dpl_Curso_Unidad`.
 * Only the columns requested in the expand's $select are present.
 */
export interface UnidadResumenEntity {
  dpl_unidadid: string
  dpl_nombreunidad?: string
  dpl_idunidadtext?: string
  dpl_numerounidad?: number
  [key: string]: unknown
}

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface CursoEntity {
  dpl_cursoid: string
  dpl_nombrecurso?: string
  dpl_idcursotext?: string
  dpl_codigocatalogo?: string
  dpl_carrera?: string
  dpl_tipoensenanza?: string
  dpl_ciclo?: number
  dpl_logrocurso?: string
  dpl_permiteconsignas?: boolean
  dpl_permiterubricas?: boolean
  dpl_permitematrizsn?: boolean
  dpl_permitelistacotejo?: boolean
  dpl_permiteescala?: boolean
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Collection-valued navigation property — present only when $expand is used. */
  dpl_Curso_Unidad?: UnidadResumenEntity[]
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean shape of a related Unidad for UI consumption. */
export interface UnidadResumen {
  id: string
  nombre: string
  idUnidadText: string
  numero: number
}

/** Clean domain type the UI consumes. */
export interface Curso {
  id: string
  nombre: string
  idCursoText: string
  codigoCatalogo: string
  carrera: string
  tipoEnsenanza: string
  ciclo: number
  logroCurso: string
  permiteConsignas: boolean
  permiteRubricas: boolean
  permiteMatrizSN: boolean
  permiteListaCotejo: boolean
  permiteEscala: boolean
  estado: CursoStateKey
  estadoLabel: string
  createdAt: string
  updatedAt: string
  /** Populated only when the query expanded the Unidad collection. */
  unidades: UnidadResumen[]
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateCursoInput {
  nombre: string
  idCursoText?: string
  codigoCatalogo?: string
  carrera?: string
  tipoEnsenanza?: string
  ciclo?: number
  logroCurso?: string
  permiteConsignas?: boolean
  permiteRubricas?: boolean
  permiteMatrizSN?: boolean
  permiteListaCotejo?: boolean
  permiteEscala?: boolean
}

export interface UpdateCursoInput {
  nombre?: string
  idCursoText?: string
  codigoCatalogo?: string
  carrera?: string
  tipoEnsenanza?: string
  ciclo?: number
  logroCurso?: string
  permiteConsignas?: boolean
  permiteRubricas?: boolean
  permiteMatrizSN?: boolean
  permiteListaCotejo?: boolean
  permiteEscala?: boolean
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapUnidadResumenEntity = (entity: UnidadResumenEntity): UnidadResumen => ({
  id: entity.dpl_unidadid,
  nombre: entity.dpl_nombreunidad ?? '',
  idUnidadText: entity.dpl_idunidadtext ?? '',
  numero: entity.dpl_numerounidad ?? 0,
})

export const mapCursoEntity = (entity: CursoEntity): Curso => {
  const state = entity.statecode ?? CURSO_STATE.activo
  return {
    id: entity.dpl_cursoid,
    nombre: entity.dpl_nombrecurso ?? '',
    idCursoText: entity.dpl_idcursotext ?? '',
    codigoCatalogo: entity.dpl_codigocatalogo ?? '',
    carrera: entity.dpl_carrera ?? '',
    tipoEnsenanza: entity.dpl_tipoensenanza ?? '',
    ciclo: entity.dpl_ciclo ?? 0,
    logroCurso: entity.dpl_logrocurso ?? '',
    permiteConsignas: entity.dpl_permiteconsignas ?? false,
    permiteRubricas: entity.dpl_permiterubricas ?? false,
    permiteMatrizSN: entity.dpl_permitematrizsn ?? false,
    permiteListaCotejo: entity.dpl_permitelistacotejo ?? false,
    permiteEscala: entity.dpl_permiteescala ?? false,
    estado: CURSO_STATE_LABELS[state] ?? 'activo',
    estadoLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    unidades: (entity.dpl_Curso_Unidad ?? []).map(mapUnidadResumenEntity),
  }
}
