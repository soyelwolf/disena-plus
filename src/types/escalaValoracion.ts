// src/types/escalaValoracion.ts
// Types for the Dataverse table "Escala de Valoración" (dpl_escalavaloracion),
// the header record of the Escala de Valoración / Indicador de Escala pair.
//
// Every logical name below was verified against live Dataverse metadata on
// https://org1f6d93cb.crm2.dynamics.com
// (EntityDefinitions(LogicalName='dpl_escalavaloracion')/Attributes,
//  .../ManyToOneRelationships and .../OneToManyRelationships) —
// do not rename without re-verifying.
//
//   Entity set name ....... dpl_escalavaloracions
//   Primary ID attribute .. dpl_escalavaloracionid
//   Primary name attribute  dpl_nombre   (String, max 300)
//   Parent lookup ......... dpl_sesionid → nav property dpl_SesionId (→ dpl_sesion)
//   Child collection ...... dpl_EscalaValoracion_EscalaIndicador (→ dpl_escalaindicador)

import { getFormattedValue } from '../shared/powerPagesApi'
import {
  mapEscalaIndicadorEntity,
  sortIndicadores,
  sumPuntajeMaximo,
  sumPuntajeObtenido,
  type EscalaIndicador,
  type EscalaIndicadorEntity,
} from './escalaIndicador'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const ESCALA_VALORACION_ENTITY_SET = 'dpl_escalavaloracions'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const ESCALA_VALORACION_PRIMARY_ID = 'dpl_escalavaloracionid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const ESCALA_VALORACION_PRIMARY_NAME = 'dpl_nombre'

/** Foreign-key column holding the parent Sesión id. */
export const ESCALA_VALORACION_SESION_ATTRIBUTE = 'dpl_sesionid'

/** `_value` property returned by $select for the Sesión lookup. */
export const ESCALA_VALORACION_SESION_VALUE = '_dpl_sesionid_value'

/**
 * Single-valued navigation property from Escala de Valoración → Sesión.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship dpl_Sesion_EscalaValoracion) — CASE-SENSITIVE.
 * Use it for `$expand` and for `@odata.bind` on POST/PATCH.
 */
export const ESCALA_VALORACION_SESION_NAV = 'dpl_SesionId'

/** Entity set of the Sesión table — verified via EntityDefinitions.EntitySetName. */
export const SESION_ENTITY_SET = 'dpl_sesions'

/** Primary name column of the Sesión table. */
export const SESION_PRIMARY_NAME = 'dpl_elemento'

/**
 * Collection-valued navigation property from Escala de Valoración → its
 * Indicador de Escala rows. Verified via
 * OneToManyRelationships.ReferencedEntityNavigationPropertyName
 * (relationship dpl_EscalaValoracion_EscalaIndicador) — CASE-SENSITIVE.
 */
export const ESCALA_VALORACION_INDICADORES_NAV = 'dpl_EscalaValoracion_EscalaIndicador'

// ── Column constraints (from live metadata) ───────────────────────────────────

export const NOMBRE_MAX_LENGTH = 300
export const ESTADO_MAX_LENGTH = 50
export const USUARIO_REGISTRO_MAX_LENGTH = 200

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — verified option values: 0 = Activo, 1 = Inactivo */
export const ESCALA_VALORACION_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type EscalaValoracionStateKey = keyof typeof ESCALA_VALORACION_STATE

const ESCALA_VALORACION_STATE_LABELS = Object.fromEntries(
  Object.entries(ESCALA_VALORACION_STATE).map(([key, val]) => [val, key]),
) as Record<number, EscalaValoracionStateKey>

// ── Raw OData entities ────────────────────────────────────────────────────────

/**
 * Related Sesión record as returned by an $expand of `dpl_SesionId`.
 * Only the columns requested in the expand's $select are present.
 */
export interface SesionResumenEntity {
  dpl_sesionid: string
  dpl_elemento?: string
  [key: string]: unknown
}

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface EscalaValoracionEntity {
  dpl_escalavaloracionid: string
  dpl_nombre?: string
  dpl_estado?: string | null
  dpl_activado?: boolean
  dpl_usuarioregistro?: string | null
  dpl_fecharegistro?: string | null
  /** Sesión lookup GUID — returned when _dpl_sesionid_value is $select-ed. */
  _dpl_sesionid_value?: string | null
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Single-valued navigation property — present only when $expand is used. */
  dpl_SesionId?: SesionResumenEntity | null
  /** Collection-valued navigation property — present only when $expand is used. */
  dpl_EscalaValoracion_EscalaIndicador?: EscalaIndicadorEntity[]
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean shape of the related Sesión for UI consumption. */
export interface SesionResumen {
  id: string
  elemento: string
}

/** Clean domain type the UI consumes. */
export interface EscalaValoracion {
  id: string
  nombre: string
  /** dpl_estado — free-text status column (max 50). */
  estadoTexto: string
  /** dpl_activado — boolean flag. */
  activado: boolean
  usuarioRegistro: string
  /** dpl_fecharegistro — ISO string, '' when unset. */
  fechaRegistro: string
  /** Sesión lookup id (from the `_value` property). */
  sesionId: string
  /** Sesión display name from the lookup formatted-value annotation or $expand. */
  sesionNombre: string
  /** Populated only when the Sesión lookup was expanded. */
  sesion: SesionResumen | null
  /** statecode as a stable key. */
  estado: EscalaValoracionStateKey
  estadoLabel: string
  createdAt: string
  updatedAt: string
  /** Ordered by dpl_orden. Populated only when the child collection was expanded. */
  indicadores: EscalaIndicador[]
  /** Sum of the selected tier's score across the loaded indicadores. */
  puntajeObtenido: number
  /** Maximum achievable score across the loaded indicadores. */
  puntajeMaximo: number
  /**
   * @odata.nextLink for the expanded indicador collection, when Power Pages
   * paged it. Present only for nested-$expand queries.
   */
  indicadoresNextLink?: string
}

/** Header + ordered indicadores, the shape the evaluation screen consumes. */
export interface EscalaValoracionDetalle {
  escala: EscalaValoracion
  indicadores: EscalaIndicador[]
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateEscalaValoracionInput {
  nombre: string
  estadoTexto?: string
  activado?: boolean
  usuarioRegistro?: string
  /** ISO date-time string written to dpl_fecharegistro. */
  fechaRegistro?: string
  /** Sesión id — bound via dpl_SesionId@odata.bind. */
  sesionId?: string
}

export interface UpdateEscalaValoracionInput {
  nombre?: string
  estadoTexto?: string
  activado?: boolean
  usuarioRegistro?: string
  fechaRegistro?: string
  /** Pass null to clear the Sesión lookup. */
  sesionId?: string | null
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapSesionResumenEntity = (entity: SesionResumenEntity): SesionResumen => ({
  id: entity.dpl_sesionid,
  elemento: entity.dpl_elemento ?? '',
})

export const mapEscalaValoracionEntity = (
  entity: EscalaValoracionEntity,
): EscalaValoracion => {
  const state = entity.statecode ?? ESCALA_VALORACION_STATE.activo

  const indicadores = sortIndicadores(
    (entity[ESCALA_VALORACION_INDICADORES_NAV] as EscalaIndicadorEntity[] | undefined ?? [])
      .map(mapEscalaIndicadorEntity),
  )

  const sesionEntity = entity[ESCALA_VALORACION_SESION_NAV] as
    | SesionResumenEntity
    | null
    | undefined
  const sesion = sesionEntity ? mapSesionResumenEntity(sesionEntity) : null

  return {
    id: entity.dpl_escalavaloracionid,
    nombre: entity.dpl_nombre ?? '',
    estadoTexto: entity.dpl_estado ?? '',
    activado: entity.dpl_activado ?? false,
    usuarioRegistro: entity.dpl_usuarioregistro ?? '',
    fechaRegistro: entity.dpl_fecharegistro ?? '',
    sesionId: entity._dpl_sesionid_value ?? sesion?.id ?? '',
    sesionNombre:
      getFormattedValue(entity, ESCALA_VALORACION_SESION_VALUE) ?? sesion?.elemento ?? '',
    sesion,
    estado: ESCALA_VALORACION_STATE_LABELS[state] ?? 'activo',
    estadoLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    indicadores,
    puntajeObtenido: sumPuntajeObtenido(indicadores),
    puntajeMaximo: sumPuntajeMaximo(indicadores),
    indicadoresNextLink: entity[`${ESCALA_VALORACION_INDICADORES_NAV}@odata.nextLink`] as
      | string
      | undefined,
  }
}
