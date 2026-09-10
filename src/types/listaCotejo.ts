// src/types/listaCotejo.ts
// Types for the tightly-coupled Dataverse pair:
//   • "Lista de Cotejo"               → dpl_listacotejo            (header)
//   • "Indicador de Lista de Cotejo"  → dpl_listacotejoindicador   (checklist rows)
//
// Every logical name, entity set name, navigation property and option-set value
// below was verified against live Dataverse metadata on the Buddy UTP environment
// (https://org1f6d93cb.crm2.dynamics.com) — do not rename without re-verifying.
//
//   dpl_listacotejo
//     Entity set ............ dpl_listacotejos
//     Primary ID ............ dpl_listacotejoid
//     Primary name .......... dpl_nombre
//     Lookup → dpl_sesion ... column dpl_sesionid, nav property `dpl_SesionId`
//     Children .............. nav property `dpl_ListaCotejo_ListaCotejoIndicador`
//
//   dpl_listacotejoindicador
//     Entity set ............ dpl_listacotejoindicadors
//     Primary ID ............ dpl_listacotejoindicadorid
//     Primary name .......... dpl_indicador
//     Lookup → dpl_listacotejo  column dpl_listacotejoid, nav property `dpl_ListaCotejoId`

import { getFormattedValue } from '../shared/powerPagesApi'

// ── Dataverse identifiers: Lista de Cotejo (parent) ───────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const LISTA_COTEJO_ENTITY_SET = 'dpl_listacotejos'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const LISTA_COTEJO_PRIMARY_ID = 'dpl_listacotejoid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const LISTA_COTEJO_PRIMARY_NAME = 'dpl_nombre'

/**
 * Single-valued navigation property from Lista de Cotejo to its parent Sesión.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship `dpl_Sesion_ListaCotejo`) — CASE-SENSITIVE, do not lowercase.
 */
export const LISTA_COTEJO_SESION_NAV = 'dpl_SesionId'

/**
 * Collection-valued navigation property from Lista de Cotejo to its child
 * Indicador records. Verified via
 * OneToManyRelationships.ReferencedEntityNavigationPropertyName
 * (relationship `dpl_ListaCotejo_ListaCotejoIndicador`) — CASE-SENSITIVE.
 */
export const LISTA_COTEJO_INDICADORES_NAV = 'dpl_ListaCotejo_ListaCotejoIndicador'

/** Entity set of the parent Sesión table (verified via EntityDefinitions.EntitySetName). */
export const SESION_ENTITY_SET = 'dpl_sesions'

// ── Dataverse identifiers: Indicador (child) ──────────────────────────────────

/** OData entity set name — verified via EntityDefinitions.EntitySetName */
export const INDICADOR_ENTITY_SET = 'dpl_listacotejoindicadors'

/** Primary key column — verified via EntityDefinitions.PrimaryIdAttribute */
export const INDICADOR_PRIMARY_ID = 'dpl_listacotejoindicadorid'

/** Primary name column — verified via EntityDefinitions.PrimaryNameAttribute */
export const INDICADOR_PRIMARY_NAME = 'dpl_indicador'

/**
 * Single-valued navigation property from Indicador up to its Lista de Cotejo.
 * Verified via ManyToOneRelationships.ReferencingEntityNavigationPropertyName
 * (relationship `dpl_ListaCotejo_ListaCotejoIndicador`) — CASE-SENSITIVE.
 * Use it with @odata.bind on POST/PATCH; never write to _dpl_listacotejoid_value.
 */
export const INDICADOR_LISTA_COTEJO_NAV = 'dpl_ListaCotejoId'

// ── Option sets ───────────────────────────────────────────────────────────────

/**
 * dpl_respuesta (Picklist) — verified option values from live metadata:
 *   100000000 = "Sí"
 *   100000001 = "No"
 */
export const RESPUESTA = {
  si: 100000000,
  no: 100000001,
} as const

export type RespuestaKey = keyof typeof RESPUESTA
export type RespuestaValue = (typeof RESPUESTA)[RespuestaKey]

/** Display labels exactly as configured in Dataverse. */
export const RESPUESTA_LABELS: Record<RespuestaValue, string> = {
  [RESPUESTA.si]: 'Sí',
  [RESPUESTA.no]: 'No',
}

/** Options in UI order — bind directly to a select/radio group. */
export const RESPUESTA_OPTIONS: Array<{ value: RespuestaValue; key: RespuestaKey; label: string }> =
  [
    { value: RESPUESTA.si, key: 'si', label: RESPUESTA_LABELS[RESPUESTA.si] },
    { value: RESPUESTA.no, key: 'no', label: RESPUESTA_LABELS[RESPUESTA.no] },
  ]

const RESPUESTA_KEY_BY_VALUE = {
  [RESPUESTA.si]: 'si',
  [RESPUESTA.no]: 'no',
} as Record<number, RespuestaKey>

/** Map a raw picklist value to its key, or null when unanswered. */
export const toRespuestaKey = (value: number | null | undefined): RespuestaKey | null =>
  value === null || value === undefined ? null : (RESPUESTA_KEY_BY_VALUE[value] ?? null)

/** Map a key back to the raw picklist value, or null to clear the answer. */
export const toRespuestaValue = (key: RespuestaKey | null | undefined): RespuestaValue | null =>
  key ? RESPUESTA[key] : null

/** statecode — 0 = Activo, 1 = Inactivo (Dataverse default state option set). */
export const LISTA_COTEJO_STATE = {
  activo: 0,
  inactivo: 1,
} as const

export type ListaCotejoStateKey = keyof typeof LISTA_COTEJO_STATE

const LISTA_COTEJO_STATE_LABELS = Object.fromEntries(
  Object.entries(LISTA_COTEJO_STATE).map(([key, val]) => [val, key]),
) as Record<number, ListaCotejoStateKey>

// ── Raw OData entities ────────────────────────────────────────────────────────

/** Raw OData entity for dpl_listacotejoindicador — exact column logical names. */
export interface IndicadorListaCotejoEntity {
  dpl_listacotejoindicadorid: string
  dpl_indicador?: string
  dpl_orden?: number
  dpl_puntaje?: number
  dpl_respuesta?: number | null
  dpl_observaciones?: string
  /** Lookup GUID — read-only projection of the dpl_ListaCotejoId navigation property. */
  _dpl_listacotejoid_value?: string | null
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Index signature for OData formatted-value annotations. */
  [key: string]: unknown
}

/** Raw OData entity for the parent Sesión as returned by $expand of dpl_SesionId. */
export interface SesionResumenEntity {
  dpl_sesionid: string
  dpl_elemento?: string
  dpl_idsesiontext?: string
  dpl_tema?: string
  [key: string]: unknown
}

/** Raw OData entity for dpl_listacotejo — exact column logical names. */
export interface ListaCotejoEntity {
  dpl_listacotejoid: string
  dpl_nombre?: string
  dpl_estado?: string
  dpl_activado?: boolean
  dpl_usuarioregistro?: string
  dpl_fecharegistro?: string
  /** Lookup GUID — read-only projection of the dpl_SesionId navigation property. */
  _dpl_sesionid_value?: string | null
  statecode?: number
  statuscode?: number
  createdon?: string
  modifiedon?: string
  /** Single-valued expand of the parent Sesión — present only when $expand is used. */
  dpl_SesionId?: SesionResumenEntity | null
  /** Collection-valued expand of the child indicadores — present only when $expand is used. */
  dpl_ListaCotejo_ListaCotejoIndicador?: IndicadorListaCotejoEntity[]
  /** Index signature for OData formatted-value annotations and @odata.nextLink keys. */
  [key: string]: unknown
}

// ── Domain types ──────────────────────────────────────────────────────────────

/** Clean shape of the parent Sesión for UI consumption. */
export interface SesionResumen {
  id: string
  elemento: string
  idSesionText: string
  tema: string
}

/** One editable row of the checklist grid. */
export interface IndicadorListaCotejo {
  id: string
  /** The indicator statement shown to the teacher. */
  indicador: string
  /** 1–10 — used to order the grid. */
  orden: number
  puntaje: number
  /** Raw picklist value, or null when the teacher has not answered yet. */
  respuesta: RespuestaValue | null
  /** 'si' | 'no' | null — convenient for radio/checkbox binding. */
  respuestaKey: RespuestaKey | null
  /** Dataverse formatted label ("Sí" / "No"), '' when unanswered. */
  respuestaLabel: string
  observaciones: string
  /** GUID of the owning Lista de Cotejo. */
  listaCotejoId: string | null
  createdAt: string
  updatedAt: string
}

/** Clean domain type for the checklist header. */
export interface ListaCotejo {
  id: string
  nombre: string
  estado: string
  activado: boolean
  usuarioRegistro: string
  /** ISO date-time string, '' when unset. */
  fechaRegistro: string
  /** GUID of the parent Sesión, null when unset. */
  sesionId: string | null
  /** Display name of the parent Sesión from the lookup formatted value. */
  sesionNombre: string
  /** Populated only when the query expanded dpl_SesionId. */
  sesion: SesionResumen | null
  state: ListaCotejoStateKey
  stateLabel: string
  createdAt: string
  updatedAt: string
  /** Populated only when the query expanded the indicador collection; sorted by orden. */
  indicadores: IndicadorListaCotejo[]
  /** @odata.nextLink for the expanded indicador collection, when the page was truncated. */
  indicadoresNextLink?: string
}

// ── Input types ───────────────────────────────────────────────────────────────

export interface CreateListaCotejoInput {
  nombre: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  /** ISO date-time string. */
  fechaRegistro?: string
  /** GUID of the parent Sesión — bound via dpl_SesionId@odata.bind. */
  sesionId?: string | null
}

export interface UpdateListaCotejoInput {
  nombre?: string
  estado?: string
  activado?: boolean
  usuarioRegistro?: string
  fechaRegistro?: string
  /** Pass a GUID to re-parent, null to unbind, omit to leave untouched. */
  sesionId?: string | null
}

export interface CreateIndicadorInput {
  indicador: string
  orden?: number
  puntaje?: number
  /** Raw picklist value (use RESPUESTA.si / RESPUESTA.no) or null for unanswered. */
  respuesta?: RespuestaValue | null
  observaciones?: string
  /** GUID of the owning Lista de Cotejo — bound via dpl_ListaCotejoId@odata.bind. */
  listaCotejoId?: string | null
}

export interface UpdateIndicadorInput {
  indicador?: string
  orden?: number
  puntaje?: number
  respuesta?: RespuestaValue | null
  observaciones?: string
  /** Pass a GUID to re-parent, null to unbind, omit to leave untouched. */
  listaCotejoId?: string | null
}

// ── Mappers ───────────────────────────────────────────────────────────────────
// Every field carries a default: Power Pages column permission profiles can
// silently omit a column from the response even when it appears in $select.

export const mapIndicadorEntity = (
  entity: IndicadorListaCotejoEntity,
): IndicadorListaCotejo => {
  const respuesta = (entity.dpl_respuesta ?? null) as RespuestaValue | null
  return {
    id: entity.dpl_listacotejoindicadorid,
    indicador: entity.dpl_indicador ?? '',
    orden: entity.dpl_orden ?? 0,
    puntaje: entity.dpl_puntaje ?? 0,
    respuesta,
    respuestaKey: toRespuestaKey(respuesta),
    respuestaLabel:
      getFormattedValue(entity, 'dpl_respuesta') ??
      (respuesta !== null ? (RESPUESTA_LABELS[respuesta] ?? '') : ''),
    observaciones: entity.dpl_observaciones ?? '',
    listaCotejoId: entity._dpl_listacotejoid_value ?? null,
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
  }
}

export const mapSesionResumenEntity = (entity: SesionResumenEntity): SesionResumen => ({
  id: entity.dpl_sesionid,
  elemento: entity.dpl_elemento ?? '',
  idSesionText: entity.dpl_idsesiontext ?? '',
  tema: entity.dpl_tema ?? '',
})

/** Sort indicadores by orden, falling back to the indicator text for ties. */
export const sortIndicadores = (
  indicadores: IndicadorListaCotejo[],
): IndicadorListaCotejo[] =>
  [...indicadores].sort(
    (a, b) => a.orden - b.orden || a.indicador.localeCompare(b.indicador, 'es'),
  )

export const mapListaCotejoEntity = (entity: ListaCotejoEntity): ListaCotejo => {
  const state = entity.statecode ?? LISTA_COTEJO_STATE.activo
  const rawIndicadores = entity[LISTA_COTEJO_INDICADORES_NAV]

  return {
    id: entity.dpl_listacotejoid,
    nombre: entity.dpl_nombre ?? '',
    estado: entity.dpl_estado ?? '',
    activado: entity.dpl_activado ?? false,
    usuarioRegistro: entity.dpl_usuarioregistro ?? '',
    fechaRegistro: entity.dpl_fecharegistro ?? '',
    sesionId: entity._dpl_sesionid_value ?? null,
    sesionNombre:
      getFormattedValue(entity, '_dpl_sesionid_value') ??
      entity.dpl_SesionId?.dpl_elemento ??
      '',
    sesion: entity.dpl_SesionId ? mapSesionResumenEntity(entity.dpl_SesionId) : null,
    state: LISTA_COTEJO_STATE_LABELS[state] ?? 'activo',
    stateLabel: getFormattedValue(entity, 'statecode') ?? 'Activo',
    createdAt: entity.createdon ?? '',
    updatedAt: entity.modifiedon ?? entity.createdon ?? '',
    indicadores: sortIndicadores(
      (Array.isArray(rawIndicadores) ? rawIndicadores : []).map(mapIndicadorEntity),
    ),
    indicadoresNextLink: entity[`${LISTA_COTEJO_INDICADORES_NAV}@odata.nextLink`] as
      | string
      | undefined,
  }
}

/** Sum of puntaje across indicadores answered "Sí" — the checklist score. */
export const calcularPuntajeObtenido = (indicadores: IndicadorListaCotejo[]): number =>
  indicadores.reduce((sum, i) => (i.respuesta === RESPUESTA.si ? sum + i.puntaje : sum), 0)

/** Sum of puntaje across every indicador — the maximum possible score. */
export const calcularPuntajeTotal = (indicadores: IndicadorListaCotejo[]): number =>
  indicadores.reduce((sum, i) => sum + i.puntaje, 0)
