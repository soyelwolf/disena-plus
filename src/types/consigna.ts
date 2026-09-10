// src/types/consigna.ts
// Types for the Dataverse table "Consigna" (dpl_consigna).
//
// All column logical names below were verified against live Dataverse metadata
// (EntityDefinitions(LogicalName='dpl_consigna')/Attributes) on the Buddy UTP
// environment — do not rename them without re-verifying.
//
//   Entity set name ....... dpl_consignas
//   Primary ID attribute .. dpl_consignaid
//   Primary name attribute  dpl_idconsignatext
//
// NOTE — the manifest listed the "Qué se Evaluará" column as `dpl_quesedeevaluara`.
// The real logical name in Dataverse is `dpl_queseevaluara` (single "de"). The
// verified name is the one used here.
//
// RICH TEXT: dpl_queseevaluara, dpl_indicaciongeneral, dpl_indicacionesespecificas,
// dpl_recomendaciones and dpl_anexo are Memo columns (Format=TextArea, MaxLength=10000)
// that carry HTML produced by the site's rich text editor. They are typed as plain
// `string` and passed through the mapper untouched — no escaping, no stripping, no
// sanitizing here. Sanitization and rendering are the editor/viewer component's job.

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const CONSIGNA_ENTITY_SET = 'dpl_consignas'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const CONSIGNA_PRIMARY_ID = 'dpl_consignaid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const CONSIGNA_PRIMARY_NAME = 'dpl_idconsignatext'

/**
 * Single-valued navigation property from Consigna to its parent Sesion.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship schema `dpl_Sesion_Consigna`) — CASE-SENSITIVE, do not lowercase.
 * Use for $expand on GET and for `@odata.bind` on POST/PATCH.
 */
export const CONSIGNA_SESION_NAV = 'dpl_SesionId'

/**
 * Raw lookup GUID property for the parent Sesion.
 * Use in $select and $filter — never write to it on POST/PATCH.
 */
export const CONSIGNA_SESION_VALUE = '_dpl_sesionid_value'

/** Lookup attribute logical name — verified via ManyToOneRelationships.ReferencingAttribute */
export const CONSIGNA_SESION_ATTRIBUTE = 'dpl_sesionid'

/** Entity set of the parent Sesion table (verified via EntityDefinitions.EntitySetName). */
export const SESION_ENTITY_SET = 'dpl_sesions'

/** Max length of every rich text (Memo) column on this table — verified via metadata. */
export const CONSIGNA_RICH_TEXT_MAX_LENGTH = 10000

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — verified option values: 0 = Activo, 1 = Inactivo */
export const CONSIGNA_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type ConsignaStateKey = keyof typeof CONSIGNA_STATE

const CONSIGNA_STATE_LABELS = Object.fromEntries(
  Object.entries(CONSIGNA_STATE).map(([key, val]) => [val, key]),
) as Record<number, ConsignaStateKey>

// ── Raw OData entities ────────────────────────────────────────────────────────

/**
 * Related Sesion record as returned by an $expand of `dpl_SesionId`.
 * Only the columns requested in the expand's $select are present.
 */
export interface SesionResumenEntity {
  dpl_sesionid: string
  dpl_elemento?: string
  dpl_idsesiontext?: string
  dpl_tema?: string
  dpl_abreviatura?: string
  [key: string]: unknown
}

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface ConsignaEntity {
  dpl_consignaid: string
  dpl_idconsignatext?: string
  /** HTML string from the rich text editor — stored/returned verbatim. */
  dpl_queseevaluara?: string
  /** HTML string from the rich text editor — stored/returned verbatim. */
  dpl_indicaciongeneral?: string
  /** HTML string from the rich text editor — stored/returned verbatim. */
  dpl_indicacionesespecificas?: string
  /** HTML string from the rich text editor — stored/returned verbatim. */
  dpl_recomendaciones?: string
  /** HTML string from the rich text editor — stored/returned verbatim. */
  dpl_anexo?: string
  dpl_estado?: string
  dpl_activado?: boolean
  dpl_usuarioregistro?: string
  dpl_fecharegistro?: string
  /** Raw lookup GUID of the parent Sesion (read-only projection of dpl_sesionid). */
  _dpl_sesionid_value?: string
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Single-valued navigation property — present only when $expand is used. */
  dpl_SesionId?: SesionResumenEntity | null
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean shape of the related parent Sesion for UI consumption. */
export interface SesionResumen {
  id: string
  elemento: string
  idSesionText: string
  tema: string
  abreviatura: string
}

/**
 * Clean domain type the UI consumes.
 *
 * The five rich text fields hold raw HTML strings exactly as the Web API returned
 * them. Render them through the site's sanitizing rich text viewer — never inject
 * them into the DOM unsanitized.
 */
export interface Consigna {
  id: string
  idConsignaText: string
  /** HTML — pass to the rich text editor/viewer as-is. */
  queSeEvaluara: string
  /** HTML — pass to the rich text editor/viewer as-is. */
  indicacionGeneral: string
  /** HTML — pass to the rich text editor/viewer as-is. */
  indicacionesEspecificas: string
  /** HTML — pass to the rich text editor/viewer as-is. */
  recomendaciones: string
  /** HTML — pass to the rich text editor/viewer as-is. */
  anexo: string
  estado: string
  activado: boolean
  usuarioRegistro: string
  fechaRegistro: string
  /** GUID of the parent Sesion, from `_dpl_sesionid_value`. */
  sesionId: string
  /** Display name of the parent Sesion (formatted value, available without $expand). */
  sesionNombre: string
  /** Populated only when the query expanded `dpl_SesionId`. */
  sesion: SesionResumen | null
  /** statecode mapped to a key. */
  estadoRegistro: ConsignaStateKey
  estadoRegistroLabel: string
  createdAt: string
  updatedAt: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateConsignaInput {
  idConsignaText?: string
  /** HTML from the rich text editor — sent verbatim. */
  queSeEvaluara?: string
  /** HTML from the rich text editor — sent verbatim. */
  indicacionGeneral?: string
  /** HTML from the rich text editor — sent verbatim. */
  indicacionesEspecificas?: string
  /** HTML from the rich text editor — sent verbatim. */
  recomendaciones?: string
  /** HTML from the rich text editor — sent verbatim. */
  anexo?: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  /** ISO 8601 timestamp. The column behaviour is UserLocal. */
  fechaRegistro?: string
  /** Parent Sesion GUID — bound via `dpl_SesionId@odata.bind`. */
  sesionId?: string
}

export interface UpdateConsignaInput {
  idConsignaText?: string
  /** HTML from the rich text editor — sent verbatim. */
  queSeEvaluara?: string
  /** HTML from the rich text editor — sent verbatim. */
  indicacionGeneral?: string
  /** HTML from the rich text editor — sent verbatim. */
  indicacionesEspecificas?: string
  /** HTML from the rich text editor — sent verbatim. */
  recomendaciones?: string
  /** HTML from the rich text editor — sent verbatim. */
  anexo?: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  fechaRegistro?: string
  /**
   * Parent Sesion GUID. Pass `null` to clear the lookup, omit to leave it unchanged.
   */
  sesionId?: string | null
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.
//
// The rich text fields default to '' and are otherwise copied through unchanged —
// no HTML escaping or tag stripping happens here by design.

export const mapSesionResumenEntity = (entity: SesionResumenEntity): SesionResumen => ({
  id: entity.dpl_sesionid,
  elemento: entity.dpl_elemento ?? '',
  idSesionText: entity.dpl_idsesiontext ?? '',
  tema: entity.dpl_tema ?? '',
  abreviatura: entity.dpl_abreviatura ?? '',
})

export const mapConsignaEntity = (entity: ConsignaEntity): Consigna => {
  const state = entity.statecode ?? CONSIGNA_STATE.activo
  const sesion = entity.dpl_SesionId ?? null
  return {
    id: entity.dpl_consignaid,
    idConsignaText: entity.dpl_idconsignatext ?? '',
    // ── Rich text (HTML) — verbatim pass-through ──
    queSeEvaluara: entity.dpl_queseevaluara ?? '',
    indicacionGeneral: entity.dpl_indicaciongeneral ?? '',
    indicacionesEspecificas: entity.dpl_indicacionesespecificas ?? '',
    recomendaciones: entity.dpl_recomendaciones ?? '',
    anexo: entity.dpl_anexo ?? '',
    // ── Scalars ──
    estado: entity.dpl_estado ?? '',
    activado: entity.dpl_activado ?? false,
    usuarioRegistro: entity.dpl_usuarioregistro ?? '',
    fechaRegistro: entity.dpl_fecharegistro ?? '',
    // ── Parent lookup ──
    sesionId: entity._dpl_sesionid_value ?? '',
    sesionNombre:
      sesion?.dpl_elemento ?? getFormattedValue(entity, '_dpl_sesionid_value') ?? '',
    sesion: sesion ? mapSesionResumenEntity(sesion) : null,
    // ── System state ──
    estadoRegistro: CONSIGNA_STATE_LABELS[state] ?? 'activo',
    estadoRegistroLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
  }
}
