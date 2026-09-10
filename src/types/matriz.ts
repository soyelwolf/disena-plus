// src/types/matriz.ts
// Types for the Dataverse table "Matriz" (dpl_matriz) and its expanded child
// "Pregunta de Matriz" collection.
//
// All identifiers below were verified against live Dataverse metadata on
// https://org1f6d93cb.crm2.dynamics.com — do not rename them without re-verifying:
//   EntityDefinitions(LogicalName='dpl_matriz')
//   EntityDefinitions(LogicalName='dpl_matriz')/Attributes
//   EntityDefinitions(LogicalName='dpl_matriz')/ManyToOneRelationships
//   EntityDefinitions(LogicalName='dpl_matriz')/OneToManyRelationships
//
//   Entity set name ........ dpl_matrizs      (NOT "dpl_matrices")
//   Primary ID attribute ... dpl_matrizid
//   Primary name attribute . dpl_nombre

import { getFormattedValue } from '../shared/powerPagesApi'
import {
  mapMatrizPreguntaEntity,
  sortPreguntasByOrden,
  type MatrizPregunta,
  type MatrizPreguntaEntity,
} from './matrizPregunta'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/**
 * OData entity set name — verified via EntityDefinitions.EntitySetName.
 * Dataverse simply appended "s" to the logical name; it is NOT "dpl_matrices".
 */
export const MATRIZ_ENTITY_SET = 'dpl_matrizs'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const MATRIZ_PRIMARY_ID = 'dpl_matrizid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const MATRIZ_PRIMARY_NAME = 'dpl_nombre'

/**
 * Collection-valued navigation property from Matriz to its child Pregunta rows.
 * Verified via OneToManyRelationships.ReferencedEntityNavigationPropertyName on
 * relationship `dpl_Matriz_MatrizPregunta` — CASE-SENSITIVE, do not lowercase.
 *
 * Use this name in `$expand` to pull the preguntas alongside the header.
 */
export const MATRIZ_PREGUNTAS_NAV = 'dpl_Matriz_MatrizPregunta'

/**
 * Single-valued navigation property from Matriz to its parent Sesion.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName on
 * relationship `dpl_Sesion_Matriz` — CASE-SENSITIVE, do not lowercase.
 */
export const MATRIZ_SESION_NAV = 'dpl_SesionId'

/** Foreign-key column for the Sesion lookup — verified via ReferencingAttribute. */
export const MATRIZ_SESION_ATTRIBUTE = 'dpl_sesionid'

/** Lookup GUID property returned on GET for the parent Sesion. */
export const MATRIZ_SESION_VALUE = '_dpl_sesionid_value'

/** Entity set of the parent Sesion table — verified via EntityDefinitions.EntitySetName. */
export const SESION_ENTITY_SET = 'dpl_sesions'

/** Primary name column of the parent Sesion table. */
export const SESION_PRIMARY_NAME = 'dpl_elemento'

// ── Domain constants ──────────────────────────────────────────────────────────

/**
 * Suggested values for `dpl_estado`.
 *
 * NOTE: `dpl_estado` is a free-text String column in Dataverse, not a choice
 * column — these values are offered for UI dropdowns only and are NOT enforced
 * server-side.
 */
export const MATRIZ_ESTADO_OPTIONS = ['Borrador', 'En revisión', 'Aprobada', 'Archivada'] as const

export type MatrizEstado = (typeof MATRIZ_ESTADO_OPTIONS)[number]

// ── Raw OData entity ──────────────────────────────────────────────────────────

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface MatrizEntity {
  dpl_matrizid: string
  dpl_nombre?: string
  dpl_estado?: string
  dpl_activado?: boolean
  dpl_usuarioregistro?: string
  dpl_fecharegistro?: string
  /** Parent Sesion GUID — populated when `_dpl_sesionid_value` is in $select. */
  _dpl_sesionid_value?: string
  createdon?: string
  modifiedon?: string
  /**
   * Child Pregunta rows — present only when the query expands
   * `dpl_Matriz_MatrizPregunta`.
   */
  dpl_Matriz_MatrizPregunta?: MatrizPreguntaEntity[]
  /** Index signature for OData formatted-value and nextLink annotations. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean domain type the UI consumes — the Matriz header. */
export interface Matriz {
  id: string
  nombre: string
  /** Free-text state (see MATRIZ_ESTADO_OPTIONS). */
  estado: string
  activado: boolean
  usuarioRegistro: string
  /** ISO timestamp of the business registration date (dpl_fecharegistro). */
  fechaRegistro: string
  /** Parent Sesion GUID, when selected. */
  sesionId: string
  /** Parent Sesion display name, from the lookup's formatted value. */
  sesionNombre: string
  createdAt: string
  updatedAt: string
  /**
   * Child preguntas, always sorted by `orden` ascending.
   * Empty unless the query expanded `dpl_Matriz_MatrizPregunta`.
   */
  preguntas: MatrizPregunta[]
  /**
   * Paging cursor for the expanded preguntas collection, when Dataverse
   * truncated it. A Matriz normally holds 1–10 rows, so this is usually
   * undefined — fall back to listPreguntasByMatriz() if it ever appears.
   */
  preguntasNextLink?: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateMatrizInput {
  nombre: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  /** ISO timestamp; defaults to now server-side if omitted by the caller. */
  fechaRegistro?: string
  /** Parent Sesion GUID — bound via `dpl_SesionId@odata.bind`. */
  sesionId?: string
}

export interface UpdateMatrizInput {
  nombre?: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  fechaRegistro?: string
  /** Pass a GUID to re-parent, or `null` to clear the Sesion lookup. */
  sesionId?: string | null
}

// ── Mapper ────────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapMatrizEntity = (entity: MatrizEntity): Matriz => {
  const rawPreguntas = Array.isArray(entity.dpl_Matriz_MatrizPregunta)
    ? entity.dpl_Matriz_MatrizPregunta
    : []

  return {
    id: entity.dpl_matrizid,
    nombre: entity.dpl_nombre ?? '',
    estado: entity.dpl_estado ?? '',
    activado: entity.dpl_activado ?? false,
    usuarioRegistro: entity.dpl_usuarioregistro ?? '',
    fechaRegistro: entity.dpl_fecharegistro ?? '',
    sesionId: entity._dpl_sesionid_value ?? '',
    sesionNombre: getFormattedValue(entity, '_dpl_sesionid_value') ?? '',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    // Sort client-side as well as via $orderby in the expand: ordering drives the
    // grid, and $orderby inside an expand is unsupported if a nested $expand is
    // ever added to the query.
    preguntas: sortPreguntasByOrden(rawPreguntas.map(mapMatrizPreguntaEntity)),
    preguntasNextLink: entity[`${MATRIZ_PREGUNTAS_NAV}@odata.nextLink`] as string | undefined,
  }
}
