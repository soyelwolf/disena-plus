// src/types/escalaIndicador.ts
// Types for the Dataverse table "Indicador de Escala" (dpl_escalaindicador),
// the child table of "Escala de Valoración" (dpl_escalavaloracion).
//
// Every logical name below was verified against live Dataverse metadata on
// https://org1f6d93cb.crm2.dynamics.com
// (EntityDefinitions(LogicalName='dpl_escalaindicador')/Attributes and
//  .../ManyToOneRelationships) — do not rename without re-verifying.
//
//   Entity set name ....... dpl_escalaindicadors
//   Primary ID attribute .. dpl_escalaindicadorid
//   Primary name attribute  dpl_indicador   (String, max 500)
//   Parent lookup ......... dpl_escalavaloracionid → nav property dpl_EscalaValoracionId
//
// This file must NOT import from ./escalaValoracion — the parent type module
// imports from here, and a cycle would break the constant initialisation order.

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers ─────────────────────────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const ESCALA_INDICADOR_ENTITY_SET = 'dpl_escalaindicadors'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const ESCALA_INDICADOR_PRIMARY_ID = 'dpl_escalaindicadorid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const ESCALA_INDICADOR_PRIMARY_NAME = 'dpl_indicador'

/** Foreign-key column holding the parent Escala de Valoración id. */
export const ESCALA_INDICADOR_PARENT_ATTRIBUTE = 'dpl_escalavaloracionid'

/** `_value` property returned by $select for the parent lookup. */
export const ESCALA_INDICADOR_PARENT_VALUE = '_dpl_escalavaloracionid_value'

/**
 * Single-valued navigation property from Indicador → Escala de Valoración.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship dpl_EscalaValoracion_EscalaIndicador) — CASE-SENSITIVE.
 * Use it for `$expand` and for `@odata.bind` on POST/PATCH.
 */
export const ESCALA_INDICADOR_PARENT_NAV = 'dpl_EscalaValoracionId'

// ── Column constraints (from live metadata) ───────────────────────────────────

/** dpl_orden is an Integer column constrained to 1–10 in Dataverse. */
export const ORDEN_MIN = 1
export const ORDEN_MAX = 10

/** Every dpl_puntaje* column is Decimal(precision 2) with range 0–100. */
export const PUNTAJE_MIN = 0
export const PUNTAJE_MAX = 100
export const PUNTAJE_PRECISION = 2

/** dpl_indicador max length (String, 500). */
export const INDICADOR_MAX_LENGTH = 500

/** dpl_respuestaseleccionada max length (String, 50). */
export const RESPUESTA_MAX_LENGTH = 50

// ── Option sets ───────────────────────────────────────────────────────────────

/** statecode — verified option values: 0 = Activo, 1 = Inactivo */
export const ESCALA_INDICADOR_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type EscalaIndicadorStateKey = keyof typeof ESCALA_INDICADOR_STATE

const ESCALA_INDICADOR_STATE_LABELS = Object.fromEntries(
  Object.entries(ESCALA_INDICADOR_STATE).map(([key, val]) => [val, key]),
) as Record<number, EscalaIndicadorStateKey>

// ── Score tiers ───────────────────────────────────────────────────────────────
// dpl_respuestaseleccionada is a free String column (not a choice), so the tier
// catalogue lives here in code. `storedValue` is what gets written to Dataverse —
// keep it stable, existing rows depend on it.

export type RespuestaTier =
  | 'excelente'
  | 'bueno'
  | 'regular'
  | 'conErrores'
  | 'noEvidenciado'

export interface RespuestaTierDefinition {
  /** Stable key used in the UI. */
  key: RespuestaTier
  /** Value written to dpl_respuestaseleccionada (max 50 chars). */
  storedValue: string
  /** Label shown to the teacher — matches the Dataverse column display names. */
  label: string
  /** The dpl_puntaje* column that holds this tier's score. */
  puntajeColumn:
    | 'dpl_puntajeexcelente'
    | 'dpl_puntajebueno'
    | 'dpl_puntajeregular'
    | 'dpl_puntajeconerrores'
    | 'dpl_puntajenoevidenciado'
}

/** Ordered best → worst; drives the column order of the editable grid. */
export const RESPUESTA_TIERS: readonly RespuestaTierDefinition[] = [
  {
    key: 'excelente',
    storedValue: 'Excelente',
    label: 'Excelente',
    puntajeColumn: 'dpl_puntajeexcelente',
  },
  {
    key: 'bueno',
    storedValue: 'Bueno',
    label: 'Bueno',
    puntajeColumn: 'dpl_puntajebueno',
  },
  {
    key: 'regular',
    storedValue: 'Regular',
    label: 'Regular',
    puntajeColumn: 'dpl_puntajeregular',
  },
  {
    key: 'conErrores',
    storedValue: 'Con Varios Errores',
    label: 'Con Varios Errores',
    puntajeColumn: 'dpl_puntajeconerrores',
  },
  {
    key: 'noEvidenciado',
    storedValue: 'No Evidenciado',
    label: 'No Evidenciado',
    puntajeColumn: 'dpl_puntajenoevidenciado',
  },
] as const

const TIER_BY_STORED_VALUE = new Map<string, RespuestaTierDefinition>(
  RESPUESTA_TIERS.map(tier => [tier.storedValue.trim().toLowerCase(), tier]),
)

const TIER_BY_KEY = new Map<RespuestaTier, RespuestaTierDefinition>(
  RESPUESTA_TIERS.map(tier => [tier.key, tier]),
)

/** Resolve a tier definition from its stable key. */
export const getTierByKey = (key: RespuestaTier): RespuestaTierDefinition =>
  TIER_BY_KEY.get(key) ?? RESPUESTA_TIERS[0]

/**
 * Resolve a tier from the raw dpl_respuestaseleccionada string.
 * Matching is trimmed + case-insensitive; returns null when nothing is selected
 * or the stored text does not match a known tier.
 */
export const parseRespuestaTier = (stored?: string | null): RespuestaTier | null => {
  if (!stored) return null
  return TIER_BY_STORED_VALUE.get(stored.trim().toLowerCase())?.key ?? null
}

/** Value to persist to dpl_respuestaseleccionada for a tier (null clears it). */
export const respuestaStoredValue = (tier: RespuestaTier | null): string | null =>
  tier ? getTierByKey(tier).storedValue : null

// ── Raw OData entity ──────────────────────────────────────────────────────────

/** Raw OData entity — property names are exact Dataverse column logical names. */
export interface EscalaIndicadorEntity {
  dpl_escalaindicadorid: string
  dpl_indicador?: string
  dpl_orden?: number
  dpl_puntajeexcelente?: number
  dpl_puntajebueno?: number
  dpl_puntajeregular?: number
  dpl_puntajeconerrores?: number
  dpl_puntajenoevidenciado?: number
  dpl_respuestaseleccionada?: string | null
  dpl_observaciones?: string | null
  /** Parent lookup GUID — returned when _dpl_escalavaloracionid_value is $select-ed. */
  _dpl_escalavaloracionid_value?: string | null
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

// ── Domain type ───────────────────────────────────────────────────────────────

/** Puntaje for each tier, keyed by the stable tier key. */
export type PuntajesPorTier = Record<RespuestaTier, number>

/** Clean domain type the editable grid consumes. */
export interface EscalaIndicador {
  id: string
  /** dpl_indicador — the indicator text shown in the first grid column. */
  indicador: string
  /** dpl_orden — 1..10, drives row order. */
  orden: number
  /** Score available for each tier. */
  puntajes: PuntajesPorTier
  /** Tier the teacher picked, or null when the row is not graded yet. */
  respuesta: RespuestaTier | null
  /** Raw dpl_respuestaseleccionada text (kept so unknown values are not lost). */
  respuestaRaw: string
  /** Score earned by the selected tier — 0 when nothing is selected. */
  puntajeObtenido: number
  /** dpl_observaciones — free text / rich text notes. */
  observaciones: string
  /** Parent Escala de Valoración id (from the lookup `_value` property). */
  escalaValoracionId: string
  /** Parent display name from the lookup formatted-value annotation. */
  escalaValoracionNombre: string
  estado: EscalaIndicadorStateKey
  estadoLabel: string
  createdAt: string
  updatedAt: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateEscalaIndicadorInput {
  indicador: string
  orden: number
  /** Parent Escala de Valoración id — bound via dpl_EscalaValoracionId@odata.bind. */
  escalaValoracionId: string
  puntajeExcelente?: number
  puntajeBueno?: number
  puntajeRegular?: number
  puntajeConErrores?: number
  puntajeNoEvidenciado?: number
  /** Pass null to leave the row ungraded. */
  respuesta?: RespuestaTier | null
  observaciones?: string
}

export interface UpdateEscalaIndicadorInput {
  indicador?: string
  orden?: number
  /** Re-parent the row. Pass null to clear the lookup. */
  escalaValoracionId?: string | null
  puntajeExcelente?: number
  puntajeBueno?: number
  puntajeRegular?: number
  puntajeConErrores?: number
  puntajeNoEvidenciado?: number
  /** Pass null to clear the selection. */
  respuesta?: RespuestaTier | null
  observaciones?: string
}

/** Narrow payload for the editable grid: only what a teacher edits per row. */
export interface EvaluacionIndicadorInput {
  id: string
  respuesta: RespuestaTier | null
  observaciones?: string
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field has a default: Power Pages column permissions can silently omit a
// column from the response even when it appears in $select.

export const mapEscalaIndicadorEntity = (
  entity: EscalaIndicadorEntity,
): EscalaIndicador => {
  const state = entity.statecode ?? ESCALA_INDICADOR_STATE.activo
  const puntajes: PuntajesPorTier = {
    excelente: entity.dpl_puntajeexcelente ?? 0,
    bueno: entity.dpl_puntajebueno ?? 0,
    regular: entity.dpl_puntajeregular ?? 0,
    conErrores: entity.dpl_puntajeconerrores ?? 0,
    noEvidenciado: entity.dpl_puntajenoevidenciado ?? 0,
  }
  const respuestaRaw = entity.dpl_respuestaseleccionada ?? ''
  const respuesta = parseRespuestaTier(respuestaRaw)

  return {
    id: entity.dpl_escalaindicadorid,
    indicador: entity.dpl_indicador ?? '',
    orden: entity.dpl_orden ?? 0,
    puntajes,
    respuesta,
    respuestaRaw,
    puntajeObtenido: respuesta ? puntajes[respuesta] : 0,
    observaciones: entity.dpl_observaciones ?? '',
    escalaValoracionId: entity._dpl_escalavaloracionid_value ?? '',
    escalaValoracionNombre:
      getFormattedValue(entity, ESCALA_INDICADOR_PARENT_VALUE) ?? '',
    estado: ESCALA_INDICADOR_STATE_LABELS[state] ?? 'activo',
    estadoLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
  }
}

// ── Derived helpers for the grid ──────────────────────────────────────────────

/** Sort indicadores by dpl_orden ascending (ties broken by indicator text). */
export const sortIndicadores = (items: EscalaIndicador[]): EscalaIndicador[] =>
  [...items].sort(
    (a, b) => a.orden - b.orden || a.indicador.localeCompare(b.indicador, 'es'),
  )

/** Sum of the selected tier's score across every indicador. */
export const sumPuntajeObtenido = (items: EscalaIndicador[]): number =>
  round2(items.reduce((total, item) => total + item.puntajeObtenido, 0))

/** Maximum achievable score (best tier per row, i.e. Excelente). */
export const sumPuntajeMaximo = (items: EscalaIndicador[]): number =>
  round2(
    items.reduce(
      (total, item) => total + Math.max(...Object.values(item.puntajes)),
      0,
    ),
  )

/** True when every indicador has a tier selected. */
export const isEvaluacionCompleta = (items: EscalaIndicador[]): boolean =>
  items.length > 0 && items.every(item => item.respuesta !== null)

/** Round to the Dataverse decimal precision (2). */
export const round2 = (value: number): number =>
  Math.round(value * 10 ** PUNTAJE_PRECISION) / 10 ** PUNTAJE_PRECISION
