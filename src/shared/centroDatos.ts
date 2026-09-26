// src/shared/centroDatos.ts
// Catalogue and generic data access for the admin "Centro de datos": every
// table the platform uses, viewable, editable and downloadable like the old
// SharePoint lists.

import { supabase } from './supabaseClient'

export interface TablaConfig {
  tabla: string
  pk: string
  /** SharePoint list name, so the Centro de datos reads like the old site. */
  titulo: string
  /** Plain-language description under the name. */
  descripcion: string
  grupo: string
  /** Column that names a row when another table points at it. */
  etiqueta?: string
  /** Columns shown first, in this order. */
  orden?: string[]
  /** Header overrides for this list only (the same column can mean different things). */
  etiquetas?: Record<string, string>
  /** Columns not shown in this list (still in the database / export source). */
  ocultas?: string[]
  /** Columns shown but not editable here (filled automatically). */
  soloLectura?: string[]
  /** Choice columns (SharePoint "Opción"): the value is picked from this list. */
  opciones?: Record<string, string[]>
  /** The whole list is read only (e.g. the IA BACKUP lists: they must stay as generated). */
  soloLecturaTabla?: boolean
  /** Course / unit / element columns repeated on every row (keys of CONTEXTO). */
  contexto?: string[]
  /** New rows can be added here ("Agregar fila" and pasting rows from Excel). */
  agregar?: boolean
  /** Lookups picked from a list in this table (e.g. the course of a unit). */
  referenciasEditables?: string[]
  /** Values of a new row (columns the database requires). */
  nuevaFila?: Record<string, unknown>
  /** SQL script that creates this list (shown when the table doesn't exist yet). */
  script?: string
  /** Lookups shown by their code (C017, P004…) instead of their name. */
  codigos?: string[]
}

/**
 * Course / unit / element data repeated on every row, like the SharePoint lists
 * (NOMBRE_CURSO, COD_CATALAGO…). Read from the related lists, so they are always
 * current and read only here. Keys start with "ctx_" and can be placed in "orden".
 */
export interface Contexto {
  curso: Record<string, unknown> | null
  unidad: Record<string, unknown> | null
  sesion: Record<string, unknown> | null
  carrera: string
  rubricaRealizada: boolean | null
  /** Consigna of the element (only loaded for lists that show its columns). */
  consigna: Record<string, unknown> | null
  /** Criteria of the rubric in order (only for CONSOLIDADO_RUBRICAS). */
  criterios: Array<Record<string, unknown>>
  /** Competences marked in the rubric's criteria (only for CONSOLIDADO_RUBRICAS). */
  competencias: Array<Record<string, unknown>>
  /** Indicators of the checklist in order (only for LISTA_DE_COTEJO). */
  indicadores: Array<Record<string, unknown>>
  /** Id of the instrument header of the row (matrix, checklist, scale). */
  cabeceraId: string | null
  /** Name of the row's programme (dpl_programaid). */
  programa: string
  programaId: string | null
  /** Rubric criterion and competence of a REL_RUBRICA_COMPETENCIAS row. */
  criterio: Record<string, unknown> | null
  competencia: Record<string, unknown> | null
}

/** Where a context value really lives: saving it there updates every row that shows it. */
export interface DestinoContexto {
  tabla: string
  pk: string
  /** '' with `crear`: the record doesn't exist yet and is created on save. */
  id: string
  col: string
  /** Values that identify the new record (e.g. matrix + question number). */
  crear?: Record<string, unknown>
}
export interface CampoContexto {
  etiqueta: string
  valor: (c: Contexto) => unknown
  /** Record and column the value comes from (null = derived, read only). */
  destino?: (c: Contexto) => DestinoContexto | null
}
const en = (tabla: string, pk: string, col: string, fila: (c: Contexto) => Record<string, unknown> | null | undefined) => (c: Contexto): DestinoContexto | null => {
  const f = fila(c)
  return f?.[pk] ? { tabla, pk, id: String(f[pk]), col } : null
}

const unir = (vals: unknown[]) => [...new Set(vals.map(v => (v === null || v === undefined ? '' : typeof v === 'boolean' ? (v ? 'Sí' : 'No') : String(v))).filter(Boolean))].join(' | ')

/** Criteria 1..10 as SharePoint columns, with the export's exact header names. */
const CAMPOS_CRITERIO: Array<{ campo: string; nombre: (n: number) => string }> = [
  { campo: 'dpl_criterio', nombre: n => `Criterios de evaluación${n > 1 ? n : ''}` },
  { campo: 'dpl_definicioncriterio', nombre: n => `Definición de Criterio${n > 1 ? n : ''}` },
  { campo: 'dpl_estandaresperado', nombre: n => `Estándar Esperado${n > 1 ? n : ''}` },
  { campo: 'dpl_enproceso2', nombre: n => `En Proceso 2${n > 1 ? '_' + n : ''}` },
  { campo: 'dpl_enproceso1', nombre: n => `En Proceso 1${n > 1 ? '_' + n : ''}` },
  { campo: 'dpl_inicial', nombre: n => `Inicial${n > 1 ? n : ''}` },
  { campo: 'dpl_puntajeestandar', nombre: n => `Puntaje_e${n > 1 ? '_' + n : ''}` },
  { campo: 'dpl_puntajeenproceso2', nombre: n => `Puntaje_P2${n > 1 ? '_' + n : ''}` },
  { campo: 'dpl_puntajeenproceso1', nombre: n => `Puntaje_P1${n > 1 ? '_' + n : ''}` },
  { campo: 'dpl_puntajeinicial', nombre: n => `Puntaje_I${n > 1 ? '_' + n : ''}` },
]
const CRITERIO_KEYS: string[] = []
const CONTEXTO_CRITERIOS: Record<string, CampoContexto> = {}
for (let n = 1; n <= 10; n++)
  for (const k of CAMPOS_CRITERIO) {
    const key = `ctx_c${n}_${k.campo}`
    CRITERIO_KEYS.push(key)
    CONTEXTO_CRITERIOS[key] = { etiqueta: k.nombre(n), valor: c => c.criterios[n - 1]?.[k.campo], destino: en('dpl_rubricacriterio', 'dpl_rubricacriterioid', k.campo, c => c.criterios[n - 1]) }
  }
/** Indicators 1..10 as the columns of the SharePoint LISTA_DE_COTEJO export (Sí / No are filled when grading). */
const SI = 100000000
const NO = 100000001
const CAMPOS_INDICADOR: Array<{ nombre: (n: number) => string; valor: (i: Record<string, unknown> | undefined) => unknown; campo?: string }> = [
  { nombre: n => `Indicadores_${n}`, valor: i => i?.dpl_indicador, campo: 'dpl_indicador' },
  { nombre: n => `Puntaje_${n}`, valor: i => i?.dpl_puntaje, campo: 'dpl_puntaje' },
  { nombre: n => `Sí _${n}`, valor: i => (i?.dpl_respuesta === SI ? 'Sí' : '') },
  { nombre: n => `No_${n}`, valor: i => (i?.dpl_respuesta === NO ? 'No' : '') },
  { nombre: n => `Observaciones_${n}`, valor: i => i?.dpl_observaciones, campo: 'dpl_observaciones' },
]
const INDICADOR_KEYS: string[] = []
const CONTEXTO_INDICADORES: Record<string, CampoContexto> = {}
for (let n = 1; n <= 10; n++)
  CAMPOS_INDICADOR.forEach((k, j) => {
    const key = `ctx_i${n}_${j}`
    INDICADOR_KEYS.push(key)
    CONTEXTO_INDICADORES[key] = {
      etiqueta: k.nombre(n),
      valor: c => k.valor(c.indicadores[n - 1]),
      destino: k.campo ? en('dpl_listacotejoindicador', 'dpl_listacotejoindicadorid', k.campo, c => c.indicadores[n - 1]) : undefined,
    }
  })
/** ESCALA_DE_VALORACION: indicators 1..10 as the export's columns (Errores_n = the old "con errores" level). */
const CAMPOS_ESCALA: Array<{ nombre: (n: number) => string; campo: string }> = [
  { nombre: n => `Indicadores_${n}`, campo: 'dpl_indicador' },
  { nombre: n => `Consolidado_${n}`, campo: 'dpl_puntajeconsolidado' },
  { nombre: n => `En desarrollo_${n}`, campo: 'dpl_puntajeendesarrollo' },
  { nombre: n => `En inicio_${n}`, campo: 'dpl_puntajeeninicio' },
  { nombre: n => `No evidenciado_${n}`, campo: 'dpl_puntajenoevidenciado' },
  { nombre: n => `Observaciones_${n}`, campo: 'dpl_observaciones' },
]
const ESCALA_KEYS: string[] = []
const ERRORES_KEYS: string[] = []
const CONTEXTO_ESCALA: Record<string, CampoContexto> = {}
for (let n = 1; n <= 10; n++) {
  CAMPOS_ESCALA.forEach((k, j) => {
    const key = `ctx_e${n}_${j}`
    ESCALA_KEYS.push(key)
    CONTEXTO_ESCALA[key] = { etiqueta: k.nombre(n), valor: c => c.indicadores[n - 1]?.[k.campo], destino: en('dpl_escalaindicador', 'dpl_escalaindicadorid', k.campo, c => c.indicadores[n - 1]) }
  })
  ERRORES_KEYS.push(`ctx_e${n}_err`)
  CONTEXTO_ESCALA[`ctx_e${n}_err`] = {
    etiqueta: `Errores_${n}`,
    valor: c => c.indicadores[n - 1]?.dpl_puntajeconerrores,
    destino: en('dpl_escalaindicador', 'dpl_escalaindicadorid', 'dpl_puntajeconerrores', c => c.indicadores[n - 1]),
  }
}
/** MATRIZ_SN_RUBRICA: questions 1..10 grouped by field (N°PREGUNTA1..10, NOMBRE_UNIDAD_1..10…). */
const GRUPOS_MATRIZ: Array<{ nombre: (n: number) => string; campo: string }> = [
  { nombre: n => `N°PREGUNTA${n}`, campo: 'dpl_orden' },
  { nombre: n => `NOMBRE_UNIDAD_${n}`, campo: 'dpl_nombreunidad' },
  { nombre: n => `EJE_TEMATICO_${n}`, campo: 'dpl_ejetematico' },
  { nombre: n => `TAXONOMIA_${n}`, campo: 'dpl_taxonomia' },
  { nombre: n => `TIPO_ITEMS_${n}`, campo: 'dpl_tipoitem' },
  { nombre: n => `PUNTAJE_${n}_IA`, campo: 'dpl_puntajeia' },
  { nombre: n => `PLATAFORMA_${n}`, campo: 'dpl_plataforma' },
  { nombre: n => `CANT_ITEMS_${n}`, campo: 'dpl_cantidaditems' },
]
/** After Usuario_Registro / Fecha_Hora_Registro in the export. */
const GRUPOS_MATRIZ_FINAL: typeof GRUPOS_MATRIZ = [
  { nombre: n => `INDICADOR_${n}`, campo: 'dpl_indicador' },
  { nombre: n => `P_estandar_${n}`, campo: 'dpl_puntajeestandar' },
  { nombre: n => `Criterio_${n}`, campo: 'dpl_criterio' },
]
const CONTEXTO_MATRIZ: Record<string, CampoContexto> = {}
const clavesMatriz = (grupos: typeof GRUPOS_MATRIZ) =>
  grupos.flatMap(g =>
    Array.from({ length: 10 }, (_, k) => {
      const key = `ctx_m${g.campo.replace('dpl_', '')}_${k + 1}`
      const existente = en('dpl_matrizpregunta', 'dpl_matrizpreguntaid', g.campo, c => c.indicadores[k])
      CONTEXTO_MATRIZ[key] = {
        etiqueta: g.nombre(k + 1),
        valor: c => c.indicadores[k]?.[g.campo],
        // The next free question (N°n+1) can be filled in here: it is created. N°PREGUNTA is the order itself.
        destino: c =>
          existente(c) ??
          (g.campo !== 'dpl_orden' && c.cabeceraId && k === c.indicadores.length
            ? { tabla: 'dpl_matrizpregunta', pk: 'dpl_matrizpreguntaid', id: '', col: g.campo, crear: { dpl_matrizid: c.cabeceraId, dpl_orden: k + 1 } }
            : null),
      }
      return key
    }),
  )
const MATRIZ_KEYS = clavesMatriz(GRUPOS_MATRIZ)
const MATRIZ_KEYS_FINAL = clavesMatriz(GRUPOS_MATRIZ_FINAL)

export const CONTEXTO: Record<string, CampoContexto> = {
  ctx_nombrecurso: { etiqueta: 'NOMBRE_CURSO', valor: c => c.curso?.dpl_nombrecurso },
  ctx_idcursotext: { etiqueta: 'ID_CURSO: ID_CURSO', valor: c => c.curso?.dpl_idcursotext },
  ctx_tipoensenanza: { etiqueta: 'ID_CURSO: Tipo_Enseñanza', valor: c => c.curso?.dpl_tipoensenanza },
  ctx_ciclo: { etiqueta: 'ID_CURSO: Ciclo', valor: c => c.curso?.dpl_ciclo },
  ctx_programa: { etiqueta: 'Programa', valor: c => c.programa },
  ctx_elementounidad: { etiqueta: 'ElementoAsignado', valor: c => c.unidad?.dpl_elementoasignado },
  ctx_codigocatalogo: { etiqueta: 'COD_CATALAGO', valor: c => c.curso?.dpl_codigocatalogo },
  ctx_logrocurso: { etiqueta: 'LOGRO_CURSO', valor: c => c.curso?.dpl_logrocurso },
  ctx_idsesion: { etiqueta: 'ID_SESION_TEXT', valor: c => c.sesion?.dpl_idsesiontext },
  ctx_idunidad: { etiqueta: 'ID_UNIDAD_TEXT', valor: c => c.unidad?.dpl_idunidadtext },
  ctx_nombreunidad: { etiqueta: 'NOMBRE_UNIDAD', valor: c => c.unidad?.dpl_nombreunidad },
  ctx_abreviatura: { etiqueta: 'ABREVIATURA', valor: c => c.sesion?.dpl_abreviatura ?? c.unidad?.dpl_elementocatalogoabreviatura },
  ctx_unidad: { etiqueta: 'UNIDAD', valor: c => c.unidad?.dpl_numerounidad },
  ctx_elemento: { etiqueta: 'ELEMENTO', valor: c => c.sesion?.dpl_elemento },
  ctx_logrounidad: { etiqueta: 'LOGRO_UNIDAD', valor: c => c.unidad?.dpl_logroespecifico },
  ctx_carrera: { etiqueta: 'CARRERA', valor: c => c.carrera },
  ctx_realizadorubrica: { etiqueta: 'RealizadoRúbrica', valor: c => c.rubricaRealizada },
  ctx_instrumentotexto: { etiqueta: 'INSTRUMENTO_TEXT', valor: () => undefined }, // filled from the row itself (see CentroDatos)
  ctx_idconsigna: { etiqueta: 'ID_CONSIGNA_TEXT', valor: c => c.consigna?.dpl_idconsignatext },
  ctx_instrumento: { etiqueta: 'INSTRUMENTO', valor: c => c.consigna?.dpl_instrumento },
  ctx_queseevaluara: { etiqueta: 'QUE_SE_EVALUARA', valor: c => c.consigna?.dpl_queseevaluara },
  ctx_indicaciongeneral: { etiqueta: 'INDICACIONES_GENERALES', valor: c => c.consigna?.dpl_indicaciongeneral },
  ctx_indicacionesespecificas: { etiqueta: 'INDICACIONES_ESPECIFICAS', valor: c => c.consigna?.dpl_indicacionesespecificas },
  ctx_competencia: { etiqueta: 'COMPETENCIA_MAPEO', valor: c => unir(c.competencias.map(x => x.nombre)) },
  ctx_competenciaevidencia: { etiqueta: 'COMPETENCIA_EVIDENCIA_MAPEO', valor: c => unir(c.competencias.map(x => x.competenciaEvidencia)) },
  ctx_descripcioncompetencia: { etiqueta: 'DESCRIPCION_COMPETENCIA', valor: c => unir(c.competencias.map(x => x.descripcion)) },
  ctx_tipocompetencia: { etiqueta: 'TIPO_COMPETENCIA', valor: c => unir(c.competencias.map(x => x.tipo)) },
  ctx_nivelcompetencia: { etiqueta: 'NIVEL_COMPETENCIA', valor: c => unir(c.competencias.map(x => x.nivel)) },
  ctx_cursoevidencia: { etiqueta: 'CURSO_EVIDENCIA', valor: c => unir(c.competencias.map(x => x.cursoEvidencia)) },
  ctx_instrumentoescogido: { etiqueta: 'INSTRUMENTO_ESCOGIDO', valor: c => c.consigna?.dpl_instrumento },
  ctx_instrumentotextolista: { etiqueta: 'INSTRUMENTO_TEXT', valor: c => c.consigna?.dpl_instrumento },
  ...CONTEXTO_CRITERIOS,
  ...CONTEXTO_INDICADORES,
  ...CONTEXTO_ESCALA,
  ...CONTEXTO_MATRIZ,
  // REL_RUBRICA_COMPETENCIAS
  ctx_criteriocodigo: { etiqueta: 'CriterioCodigo', valor: c => (c.criterio?.dpl_orden ? `Criterio N°${c.criterio.dpl_orden}` : '') },
  ctx_criterionombre: { etiqueta: 'CriterioNombre', valor: c => c.criterio?.dpl_criterio },
  ctx_rel_competencia: { etiqueta: 'Competencia', valor: c => c.competencia?.dpl_competencia },
  ctx_rel_tipo: { etiqueta: 'TipoCompetencia', valor: c => c.competencia?.dpl_tipocompetencia },
  ctx_rel_descripcion: { etiqueta: 'DescripcionCompetencia', valor: c => c.competencia?.dpl_descripcion },
  ctx_rel_catalogo: { etiqueta: 'CatalogoEvidencia', valor: c => c.competencia?.dpl_catalogoevidencia },
  ctx_rel_cursoevidencia: { etiqueta: 'CursoEvidencia', valor: c => c.competencia?.dpl_cursoevidencia },
}

/**
 * Context columns that can be written here. Course, unit, session and consigna data stay
 * read only (they are corrected in their own list); only the items shown as columns of this
 * list (criteria, indicators, questions) are editable, through their own `destino`.
 */
const DESTINOS: Record<string, (c: Contexto) => DestinoContexto | null> = {}
for (const [k, d] of Object.entries(DESTINOS)) if (CONTEXTO[k]) CONTEXTO[k].destino = d

/** CONSOLIDADO_RUBRICAS in the exact order of the SharePoint export: one row per element. */
const ORDEN_RUBRICAS = [
  'ctx_idunidad', 'ctx_idsesion', 'ctx_idconsigna', 'ctx_instrumento', 'ctx_queseevaluara', 'ctx_nombreunidad', 'ctx_logrounidad',
  'ctx_logrocurso', 'dpl_realizado', 'ctx_unidad', 'ctx_codigocatalogo', 'dpl_estado', 'dpl_json', 'ctx_nombrecurso',
  'dpl_resultadogpt', 'ctx_competencia', 'dpl_modeloia', 'ctx_carrera', 'dpl_herramientaia', 'ctx_abreviatura', 'ctx_elemento',
  ...CRITERIO_KEYS,
  'dpl_usuarioregistro', 'dpl_fecharegistro', 'ctx_indicaciongeneral', 'ctx_indicacionesespecificas',
  'ctx_competenciaevidencia', 'ctx_descripcioncompetencia', 'ctx_tipocompetencia', 'ctx_nivelcompetencia', 'ctx_cursoevidencia',
]
const CONTEXTO_RUBRICAS = ORDEN_RUBRICAS.filter(k => k.startsWith('ctx_'))

/** LISTA_DE_COTEJO in the exact order of the SharePoint export: one row per element (review columns not copied). */
const ORDEN_LISTA_SP = [
  'ctx_nombrecurso', 'dpl_idlistatext', 'ctx_codigocatalogo', 'ctx_logrocurso', 'ctx_idsesion', 'ctx_idunidad', 'dpl_modeloia', 'dpl_estado',
  'dpl_herramientaia', 'ctx_nombreunidad', 'dpl_json', 'ctx_abreviatura', 'ctx_unidad', 'ctx_elemento', 'dpl_resultadogpt', 'ctx_logrounidad',
  'ctx_instrumentoescogido', 'ctx_instrumentotextolista', 'ctx_carrera',
  ...INDICADOR_KEYS,
  'dpl_realizado', 'dpl_usuarioregistro', 'dpl_fecharegistro',
]
const CONTEXTO_LISTA = ORDEN_LISTA_SP.filter(k => k.startsWith('ctx_'))

/** ESCALA_DE_VALORACION in the exact order of the SharePoint export: one row per element (review columns not copied). */
const ORDEN_ESCALA_SP = [
  'dpl_idescalatext', 'ctx_codigocatalogo', 'ctx_logrocurso', 'ctx_idsesion', 'ctx_idunidad', 'dpl_modeloia', 'dpl_estado', 'dpl_herramientaia',
  'ctx_nombreunidad', 'dpl_json', 'ctx_nombrecurso', 'ctx_abreviatura', 'ctx_unidad', 'ctx_elemento', 'dpl_resultadogpt', 'ctx_logrounidad',
  'ctx_instrumentoescogido', 'ctx_instrumentotextolista', 'ctx_carrera',
  ...ESCALA_KEYS,
  'dpl_tipoescala', 'dpl_realizado', ...ERRORES_KEYS, 'dpl_usuarioregistro', 'dpl_fecharegistro',
]
const CONTEXTO_ESCALA_SP = ORDEN_ESCALA_SP.filter(k => k.startsWith('ctx_'))

/** MATRIZ_SN_RUBRICA in the order of the SharePoint export: one row per element (review columns not copied). */
const ORDEN_MATRIZ_SP = [
  'ctx_idunidad', 'ctx_idsesion', 'dpl_paraia', 'dpl_estado', 'dpl_json', 'dpl_resultadogpt', 'dpl_modeloia', 'dpl_herramientaia', 'dpl_inputs',
  'ctx_nombrecurso', 'ctx_idconsigna', 'dpl_realizado', 'ctx_logrocurso', 'ctx_abreviatura', 'ctx_logrounidad', 'ctx_elemento',
  ...MATRIZ_KEYS,
  'dpl_usuarioregistro', 'dpl_fecharegistro',
  ...MATRIZ_KEYS_FINAL,
  'dpl_usuarioia', 'dpl_fechaia',
]
const CONTEXTO_MATRIZ_SP = ORDEN_MATRIZ_SP.filter(k => k.startsWith('ctx_'))

/** REL_RUBRICA_COMPETENCIAS in the order of the SharePoint list. */
const ORDEN_REL_SP = [
  'dpl_programaid', 'ctx_programa', 'ctx_idconsigna', 'ctx_elemento', 'ctx_instrumento', 'ctx_criteriocodigo', 'ctx_criterionombre',
  'dpl_competenciaid', 'ctx_rel_competencia', 'ctx_rel_tipo', 'ctx_rel_descripcion', 'dpl_competenciaevidencia', 'dpl_nivel',
  'ctx_rel_catalogo', 'ctx_rel_cursoevidencia',
]
/** The course columns every instrument list of SharePoint starts with. */
const CONTEXTO_INSTRUMENTO = ['ctx_nombrecurso', 'ctx_codigocatalogo', 'ctx_logrocurso', 'ctx_idsesion', 'ctx_idunidad', 'ctx_nombreunidad', 'ctx_unidad', 'ctx_abreviatura', 'ctx_elemento', 'ctx_logrounidad', 'ctx_carrera']

/** CONSOLIDADO_CONSIGNAS in the exact order of the SharePoint export (29 columns). */
const ORDEN_CONSIGNAS = [
  'ctx_nombrecurso', 'ctx_codigocatalogo', 'ctx_logrocurso', 'dpl_idconsignatext', 'ctx_idsesion', 'ctx_idunidad',
  'dpl_modeloia', 'dpl_estado', 'dpl_herramientaia', 'ctx_nombreunidad', 'dpl_json', 'dpl_queseevaluara', 'ctx_abreviatura',
  'ctx_unidad', 'ctx_elemento', 'dpl_resultadogpt', 'ctx_logrounidad', 'dpl_indicaciongeneral', 'dpl_indicacionesespecificas',
  'dpl_recomendaciones', 'dpl_anexo', 'dpl_instrumento', 'ctx_carrera', 'dpl_realizado', 'dpl_usuarioregistro',
  'dpl_fecharegistro', 'ctx_realizadorubrica', 'ctx_instrumentotexto',
]

/** Headers shared by the five BACKUP lists. */
const ETIQUETAS_BACKUP: Record<string, string> = {
  dpl_backupid: 'ID_BACKUP',
  dpl_version: 'VERSION',
  dpl_fechabackup: 'FECHA_BACKUP',
  dpl_origen: 'ORIGEN',
  dpl_sesionbackupid: 'Elemento',
  dpl_idcursotext: 'ID_CURSO_TEXT',
  dpl_nombrecurso: 'NOMBRE_CURSO',
  dpl_elemento: 'ELEMENTO',
  dpl_json: 'JSON_IA',
  dpl_inputs: 'INPUTS',
  dpl_resultadogpt: 'RESULTADO_IA',
}
const ORDEN_BACKUP = ['dpl_idcursotext', 'dpl_elemento', 'dpl_version', 'dpl_fechabackup']

/** MATRIZ_SN_RUBRICA per question (N°PREGUNTA = order). Used with and without rubric. */
const ETIQUETAS_MATRIZ: Record<string, string> = {
  dpl_orden: 'N°PREGUNTA',
  dpl_nombreunidad: 'NOMBRE_UNIDAD',
  dpl_ejetematico: 'EJE_TEMATICO',
  dpl_taxonomia: 'TAXONOMIA',
  dpl_tipoitem: 'TIPO_ITEMS',
  dpl_puntajeia: 'PUNTAJE_IA',
  dpl_plataforma: 'PLATAFORMA',
  dpl_cantidaditems: 'CANT_ITEMS',
  dpl_indicador: 'INDICADOR',
  dpl_puntajeestandar: 'P_estandar',
  dpl_criterio: 'Criterio',
}
const ORDEN_MATRIZ = ['dpl_matrizid', 'dpl_orden', 'dpl_nombreunidad', 'dpl_ejetematico', 'dpl_taxonomia', 'dpl_tipoitem', 'dpl_puntajeia', 'dpl_plataforma', 'dpl_cantidaditems', 'dpl_indicador', 'dpl_puntajeestandar', 'dpl_criterio']
const ETIQUETAS_LISTA: Record<string, string> = { dpl_orden: 'N°', dpl_indicador: 'Indicadores', dpl_puntaje: 'Puntaje', dpl_respuesta: 'Sí / No', dpl_observaciones: 'Observaciones' }
const ORDEN_LISTA = ['dpl_listacotejoid', 'dpl_orden', 'dpl_indicador', 'dpl_puntaje', 'dpl_respuesta', 'dpl_observaciones']
/** ESCALA_DE_VALORACION levels as in SharePoint; the old ones stay hidden. */
const ETIQUETAS_ESCALA: Record<string, string> = {
  dpl_orden: 'N°',
  dpl_indicador: 'Indicadores',
  dpl_puntajeconsolidado: 'Consolidado',
  dpl_puntajeendesarrollo: 'En desarrollo',
  dpl_puntajeeninicio: 'En inicio',
  dpl_puntajenoevidenciado: 'No evidenciado',
  dpl_observaciones: 'Observaciones',
  dpl_puntajeconerrores: 'Errores',
}
const ORDEN_ESCALA = ['dpl_escalavaloracionid', 'dpl_orden', 'dpl_indicador', 'dpl_puntajeconsolidado', 'dpl_puntajeendesarrollo', 'dpl_puntajeeninicio', 'dpl_puntajenoevidenciado', 'dpl_observaciones', 'dpl_puntajeconerrores']
// Con varios errores (dpl_puntajeconerrores) is level 4 of the administración scale: shown as Errores.
const ESCALA_ANTIGUA = ['dpl_puntajeexcelente', 'dpl_puntajebueno', 'dpl_puntajeregular', 'dpl_respuestaseleccionada']
/** Options of UNIDADES_CURSOS_IA → ¿Qué instrumento (s) de evaluación se empleará? */
export const OPCIONES_INSTRUMENTO_UNIDAD = [
  'Consigna + rúbrica', 'Consigna + lista', 'Consigna + escala', 'Consigna + matriz', 'Consigna + rúbrica + matriz', 'Consigna', 'No aplica',
]
/** Options of CONSOLIDADO_CONSIGNAS → INSTRUMENTO_ESCOGIDO (same values the app stores). */
export const OPCIONES_INSTRUMENTO_CONSIGNA = [
  'rúbrica', 'matriz con rúbrica', 'matriz sin rúbrica', 'lista de cotejo', 'escala de valoración', 'escala de valoración (administración)', 'no aplica',
]

/** Folders of the Centro de datos menu, in display order (like the SharePoint site navigation). */
export const GRUPOS = ['Cursos', 'Consignas', 'Rúbricas', 'Matriz', 'Lista de cotejo', 'Escala de valoración', 'Competencias', 'Seguimiento'] as const

export const TABLAS: TablaConfig[] = [
  {
    grupo: 'Cursos', tabla: 'dpl_curso', pk: 'dpl_cursoid', titulo: 'LISTADO_CURSOS_PARA_IA', agregar: true, descripcion: 'Cursos y personas asignadas', etiqueta: 'dpl_nombrecurso',
    orden: [
      'dpl_idcursotext', 'dpl_codigocatalogo', 'dpl_nombrecurso', 'dpl_carrera', 'dpl_tipoensenanza', 'dpl_ciclo', 'dpl_cursoevidencia',
      'dpl_logrocurso', 'dpl_horas', 'dpl_metodologia', 'dpl_software', 'dpl_docenteasignado',
      'dpl_ia_consigna_corrido', 'dpl_ia_rubrica_corrido', 'dpl_ia_matrizconrubrica_corrido', 'dpl_ia_matrizsinrubrica_corrido',
      'dpl_ia_escala_corrido', 'dpl_ia_lista_corrido', 'dpl_ia_sesiones_corrido', 'dpl_ppt', 'dpl_sinppt', 'dpl_channelid',
      'dpl_permiteconsignas', 'dpl_permiterubricas', 'dpl_permitematrizsn', 'dpl_permitematrizcn', 'dpl_permitelistacotejo', 'dpl_permiteescala',
      // Diseña+ only: course data pulled into each process (after the Permite_* they depend on).
      'dpl_activado_consignas', 'dpl_activado_rubrica', 'dpl_activado_matriz', 'dpl_activado_lista', 'dpl_activado_escala',
      'dpl_notif_consigna_enviada', 'dpl_notif_rubrica_enviada', 'dpl_notif_matrizconrubrica_enviada', 'dpl_notif_matrizsinrubrica_enviada',
      'dpl_notif_escala_enviada', 'dpl_notif_lista_enviada',
    ],
    // Not part of this program (contenido académico): kept in the database, hidden here.
    ocultas: ['dpl_cursoevidencia', 'dpl_ppt', 'dpl_sinppt', 'dpl_permitematrizcn', 'dpl_notif_matrizconrubrica_enviada', 'dpl_ia_matrizconrubrica_corrido'],
  },
  {
    grupo: 'Cursos', tabla: 'dpl_unidad', pk: 'dpl_unidadid', titulo: 'UNIDADES_CURSOS_IA', agregar: true, referenciasEditables: ['dpl_cursoid'], descripcion: 'Unidades, logros y elementos', etiqueta: 'dpl_nombreunidad',
    orden: [
      'dpl_cursoid', 'dpl_idunidadtext', 'dpl_numerounidad', 'dpl_nombreunidad', 'dpl_logroespecifico', 'dpl_temasesiones', 'dpl_realizado',
      'dpl_elementoasignado', 'dpl_nivelcomplejidad', 'dpl_queseevaluar', 'dpl_instrumentoevaluacion',
      'dpl_catalogoelementoid', 'dpl_elementocatalogoabreviatura', 'dpl_elementocatalogodescripcion',
    ],
    // Elemento_Catalogo is a lookup to CATALOGO_ELEMENTOS; its abbreviation and
    // description come from the catalogue (kept as text for the Excel export).
    ocultas: ['dpl_elementocatalogo'],
    opciones: { dpl_instrumentoevaluacion: OPCIONES_INSTRUMENTO_UNIDAD },
    etiquetas: { dpl_cursoid: 'ID_CURSO' },
    soloLectura: ['dpl_elementocatalogoabreviatura', 'dpl_elementocatalogodescripcion'],
  },
  {
    grupo: 'Cursos', tabla: 'dpl_catalogoelemento', pk: 'dpl_catalogoelementoid', titulo: 'CATALOGO_ELEMENTOS', agregar: true, nuevaFila: { dpl_elemento: 'NUEVO ELEMENTO' }, descripcion: 'Tipos de elemento de evaluación', etiqueta: 'dpl_elemento',
    orden: ['dpl_tipo', 'dpl_elemento', 'dpl_abreviatura', 'dpl_descripcion'],
    etiquetas: { dpl_tipo: 'TIPO', dpl_abreviatura: 'ABREVIATURA', dpl_elemento: 'ELEMENTO', dpl_descripcion: 'DESCRIPCIÓN' },
  },
  {
    grupo: 'Cursos', tabla: 'dpl_sesion', pk: 'dpl_sesionid', titulo: 'SESIONES_CURSOS_IA', agregar: true, referenciasEditables: ['dpl_unidadid'], descripcion: 'Sesiones del sílabo', etiqueta: 'dpl_elemento',
    orden: [
      'dpl_unidadid', 'dpl_idsesiontext', 'dpl_herramientaia', 'dpl_semana', 'dpl_numerosesion', 'dpl_tiemposesionmin', 'dpl_tema',
      'dpl_actividad', 'dpl_elemento', 'dpl_abreviatura', 'dpl_observacion', 'dpl_peso', 'dpl_tipoobservacion', 'dpl_tieneelemento', 'dpl_realizado',
    ],
    etiquetas: { dpl_unidadid: 'ID_UNIDAD', dpl_idsesiontext: 'ID_SESION', dpl_realizado: 'RealizadoSesiones' },
  },
  {
    grupo: 'Consignas', tabla: 'dpl_consigna', pk: 'dpl_consignaid', titulo: 'CONSOLIDADO_CONSIGNAS', descripcion: 'Consignas (mismo orden que SharePoint)', etiqueta: 'dpl_idconsignatext',
    orden: ORDEN_CONSIGNAS, contexto: [...CONTEXTO_INSTRUMENTO, 'ctx_realizadorubrica', 'ctx_instrumentotexto'],
    etiquetas: { __id_curso__: 'ID_CURSO_TEXT', dpl_realizado: 'RealizadoConsigna', dpl_json: 'JSON', dpl_resultadogpt: 'RESULTADO_GPT' },
    opciones: { dpl_instrumento: OPCIONES_INSTRUMENTO_CONSIGNA },
  },
  {
    grupo: 'Rúbricas', tabla: 'dpl_rubrica', pk: 'dpl_rubricaid', titulo: 'CONSOLIDADO_RUBRICAS', descripcion: 'Una fila por elemento, como SharePoint (criterios 1 a 10 en columnas)', etiqueta: 'dpl_nombre',
    orden: ORDEN_RUBRICAS, contexto: CONTEXTO_RUBRICAS,
    etiquetas: { __id_curso__: 'ID_CURSO_TEXT', ctx_abreviatura: 'ABREVI_ELEMEN', dpl_realizado: 'RealizadoRúbrica', dpl_fecharegistro: 'Hora_Registro', dpl_json: 'JSON', dpl_resultadogpt: 'RESULTADO_GPT' },
  },
  { grupo: 'Rúbricas', tabla: 'dpl_rubricacriterio', pk: 'dpl_rubricacriterioid', titulo: 'CONSOLIDADO_RUBRICAS · criterios', descripcion: 'Una fila por criterio (para corregir criterio por criterio)', etiqueta: 'dpl_criterio', orden: ['dpl_rubricaid', 'dpl_orden', 'dpl_criterio'] },
  {
    grupo: 'Rúbricas', tabla: 'dpl_rubricacriteriocompetencia', pk: 'dpl_rubricacriteriocompetenciaid', titulo: 'REL_RUBRICA_COMPETENCIAS', descripcion: 'Competencias elegidas por criterio (y programa)',
    orden: ORDEN_REL_SP, contexto: ORDEN_REL_SP.filter(k => k.startsWith('ctx_')), codigos: ['dpl_programaid', 'dpl_competenciaid'],
    ocultas: ['dpl_rubricacriterioid'],
    etiquetas: { __id_curso__: 'ID_CURSO', dpl_programaid: 'ID_PROGRAMA', ctx_programa: 'Programa', ctx_idconsigna: 'ID_CONSIGNA_TEXT', ctx_elemento: 'Elemento', ctx_instrumento: 'Instrumento', dpl_competenciaid: 'ID_Competencia', dpl_competenciaevidencia: 'CompetenciaEvidencia', dpl_nivel: 'Nivel' },
  },
  {
    grupo: 'Matriz', tabla: 'dpl_matriz', pk: 'dpl_matrizid', titulo: 'MATRIZ_SN_RUBRICA', descripcion: 'Una fila por elemento, como SharePoint: las preguntas 1 a 10 (con y sin rúbrica) van en columnas. Para agregar una pregunta, escribe en las columnas de la siguiente libre.', etiqueta: 'dpl_nombre',
    orden: ORDEN_MATRIZ_SP, contexto: CONTEXTO_MATRIZ_SP,
    etiquetas: {
      __id_curso__: 'ID_CURSO_TEXT', ctx_abreviatura: 'ABREVIATURA_ELEMENTO', dpl_paraia: 'PARA_IA', dpl_estado: 'ESTADO', dpl_json: 'JSON_IA', dpl_resultadogpt: 'RESULTADO_IA',
      dpl_modeloia: 'MODELO_IA', dpl_herramientaia: 'HERRAMIENTA_IA', dpl_inputs: 'INPUTS_1', dpl_realizado: 'RealizadoMatrizSinRubrica',
      dpl_usuarioregistro: 'Usuario_Registro', dpl_fecharegistro: 'Fecha_Hora_Registro', dpl_usuarioia: 'IA_ParaMatrizSinRubrica_Usuario', dpl_fechaia: 'IA_ParaMatrizSinRubrica_Fecha',
    },
  },
  {
    grupo: 'Lista de cotejo', tabla: 'dpl_listacotejo', pk: 'dpl_listacotejoid', titulo: 'LISTA_DE_COTEJO', descripcion: 'Una fila por elemento, como SharePoint (indicadores 1 a 10 en columnas)', etiqueta: 'dpl_nombre',
    orden: ORDEN_LISTA_SP, contexto: CONTEXTO_LISTA,
    etiquetas: { __id_curso__: 'ID_CURSO_TEXT', dpl_idlistatext: 'ID_LISTA_TEXT', dpl_modeloia: 'MODELO_IA', dpl_estado: 'ESTADO', dpl_herramientaia: 'HERRAMIENTA_IA', dpl_json: 'JSON', dpl_resultadogpt: 'RESULTADO_GPT', dpl_realizado: 'RealizadoLista', dpl_usuarioregistro: 'Usuario_Registro', dpl_fecharegistro: 'Fecha_Hora_Registro' },
  },
  { grupo: 'Lista de cotejo', tabla: 'dpl_listacotejoindicador', pk: 'dpl_listacotejoindicadorid', titulo: 'LISTA_DE_COTEJO · indicadores', descripcion: 'Una fila por indicador (para corregir indicador por indicador)', etiquetas: { __id_curso__: 'ID_CURSO_TEXT', ...ETIQUETAS_LISTA }, orden: [...CONTEXTO_INSTRUMENTO, ...ORDEN_LISTA], contexto: CONTEXTO_INSTRUMENTO },
  {
    grupo: 'Escala de valoración', tabla: 'dpl_escalavaloracion', pk: 'dpl_escalavaloracionid', titulo: 'ESCALA_DE_VALORACION', descripcion: 'Una fila por elemento, como SharePoint (indicadores 1 a 10 en columnas)', etiqueta: 'dpl_nombre',
    orden: ORDEN_ESCALA_SP, contexto: CONTEXTO_ESCALA_SP,
    etiquetas: { __id_curso__: 'ID_CURSO_TEXT', dpl_idescalatext: 'ID_ESCALA_TEXT', dpl_modeloia: 'MODELO_IA', dpl_estado: 'ESTADO', dpl_herramientaia: 'HERRAMIENTA_IA', dpl_json: 'JSON', dpl_resultadogpt: 'RESULTADO_GPT', dpl_tipoescala: 'Escala', dpl_realizado: 'RealizadoEscala', dpl_usuarioregistro: 'Usuario_Registro', dpl_fecharegistro: 'Fecha_Hora_Registro' },
  },
  { grupo: 'Escala de valoración', tabla: 'dpl_escalaindicador', pk: 'dpl_escalaindicadorid', titulo: 'ESCALA_DE_VALORACION · indicadores', descripcion: 'Una fila por indicador (para corregir indicador por indicador)', etiquetas: { __id_curso__: 'ID_CURSO_TEXT', ...ETIQUETAS_ESCALA }, orden: [...CONTEXTO_INSTRUMENTO, ...ORDEN_ESCALA], ocultas: ESCALA_ANTIGUA, contexto: CONTEXTO_INSTRUMENTO },
  // IA BACKUP lists: the proposal exactly as the IA generated it (read only), to compare with the final version.
  { grupo: 'Consignas', tabla: 'dpl_consigna_backup', pk: 'dpl_backupid', titulo: 'CONSOLIDADO_CONSIGNAS_BACKUP', descripcion: 'Propuesta IA inicial de cada consigna', etiquetas: ETIQUETAS_BACKUP, orden: [...ORDEN_BACKUP, 'dpl_idconsignatext'], soloLecturaTabla: true },
  { grupo: 'Rúbricas', tabla: 'dpl_rubricacriterio_backup', pk: 'dpl_backupid', titulo: 'CONSOLIDADO_RUBRICAS_BACKUP', descripcion: 'Propuesta IA inicial de los criterios', etiquetas: ETIQUETAS_BACKUP, orden: [...ORDEN_BACKUP, 'dpl_orden', 'dpl_criterio'], soloLecturaTabla: true },
  { grupo: 'Matriz', tabla: 'dpl_matrizpregunta_backup', pk: 'dpl_backupid', titulo: 'MATRIZ_SN_RUBRICA_BACKUP', descripcion: 'Propuesta IA inicial de las preguntas', etiquetas: { ...ETIQUETAS_MATRIZ, ...ETIQUETAS_BACKUP }, orden: [...ORDEN_BACKUP, ...ORDEN_MATRIZ.slice(1)], soloLecturaTabla: true },
  { grupo: 'Lista de cotejo', tabla: 'dpl_listacotejoindicador_backup', pk: 'dpl_backupid', titulo: 'LISTA_DE_COTEJO_BACKUP', descripcion: 'Propuesta IA inicial de los indicadores', etiquetas: { ...ETIQUETAS_LISTA, ...ETIQUETAS_BACKUP }, orden: [...ORDEN_BACKUP, ...ORDEN_LISTA.slice(1)], soloLecturaTabla: true },
  { grupo: 'Escala de valoración', tabla: 'dpl_escalaindicador_backup', pk: 'dpl_backupid', titulo: 'ESCALA_DE_VALORACION_BACKUP', descripcion: 'Propuesta IA inicial de los indicadores', etiquetas: { ...ETIQUETAS_ESCALA, ...ETIQUETAS_BACKUP }, orden: [...ORDEN_BACKUP, ...ORDEN_ESCALA.slice(1)], ocultas: ESCALA_ANTIGUA, soloLecturaTabla: true },
  { grupo: 'Matriz', tabla: 'dpl_taxonomiaitem', pk: 'dpl_taxonomiaitemid', titulo: 'TAXONOMIA_MATRIZ_SN_RUBRICA', descripcion: 'Catálogo fijo de taxonomía: qué tipos de ítem permite cada nivel y su nombre en plataforma (solo lectura)', soloLecturaTabla: true },
  {
    grupo: 'Competencias', tabla: 'dpl_programa', pk: 'dpl_programaid', titulo: 'PROGRAMAS', descripcion: 'Programa de cada curso (un ID_PROGRAMA por fila)', etiqueta: 'dpl_nombre',
    agregar: true, referenciasEditables: ['dpl_cursoid'], script: 'supabase/schema-competencias-sp.sql',
    orden: ['dpl_cursoid', 'ctx_idcursotext', 'ctx_codigocatalogo', 'ctx_nombrecurso', 'ctx_tipoensenanza', 'dpl_idprogramatext', 'dpl_nombre'],
    contexto: ['ctx_idcursotext', 'ctx_codigocatalogo', 'ctx_nombrecurso', 'ctx_tipoensenanza'],
    etiquetas: { dpl_cursoid: 'ID_CURSO', ctx_codigocatalogo: 'ID_CURSO: Código de catálogo', ctx_nombrecurso: 'ID_CURSO: Nombre de curso', dpl_idprogramatext: 'ID_PROGRAMA', dpl_nombre: 'PROGRAMA' },
  },
  {
    grupo: 'Competencias', tabla: 'dpl_competencia', pk: 'dpl_competenciaid', titulo: 'COMPETENCIAS', descripcion: 'Competencias por curso y programa (alimenta Rúbricas)', etiqueta: 'dpl_competencia',
    agregar: true, referenciasEditables: ['dpl_cursoid', 'dpl_programaid'], script: 'supabase/schema-competencias-sp.sql',
    nuevaFila: { dpl_catalogoevidencia: false, dpl_cursoevidencia: false, dpl_competenciaevidencia: false },
    orden: [
      'dpl_cursoid', 'ctx_idcursotext', 'ctx_codigocatalogo', 'ctx_nombrecurso', 'ctx_tipoensenanza', 'ctx_ciclo', 'dpl_programaid', 'ctx_programa',
      'dpl_idcompetenciatext', 'dpl_competencia', 'dpl_descripcion', 'dpl_tipocompetencia', 'dpl_nivel', 'dpl_catalogoevidencia', 'dpl_cursoevidencia', 'dpl_competenciaevidencia',
    ],
    contexto: ['ctx_idcursotext', 'ctx_codigocatalogo', 'ctx_nombrecurso', 'ctx_tipoensenanza', 'ctx_ciclo', 'ctx_programa'],
    etiquetas: {
      dpl_cursoid: 'ID_CURSO', ctx_codigocatalogo: 'ID_CURSO: Código de catálogo', ctx_nombrecurso: 'ID_CURSO: Nombre de curso', dpl_programaid: 'ID_PROGRAMA',
      dpl_idcompetenciatext: 'ID_Comptencia', dpl_competencia: 'Competencia', dpl_descripcion: 'Descripción de la competencia', dpl_tipocompetencia: 'Tipo de competencia',
      dpl_nivel: 'Nivel', dpl_catalogoevidencia: 'Catálogo evidencia', dpl_cursoevidencia: 'Curso evidencia', dpl_competenciaevidencia: 'Competencia evidencia',
    },
  },
  { grupo: 'Seguimiento', tabla: 'dpl_procesocurso', pk: 'dpl_procesocursoid', titulo: 'ESTADO_PROCESO', descripcion: 'Estado de aprobación por curso' },
  { grupo: 'Seguimiento', tabla: 'dpl_procesoevento', pk: 'dpl_procesoeventoid', titulo: 'HISTORIAL_APROBACIONES', descripcion: 'Quién finalizó, aprobó o devolvió' },
  { grupo: 'Seguimiento', tabla: 'dpl_comentario', pk: 'dpl_comentarioid', titulo: 'COMENTARIOS', descripcion: 'Comentarios de los aprobadores' },
]

/** Column headers — SharePoint names where the column came from a SharePoint list. */
const ETIQUETAS: Record<string, string> = {
  dpl_idcursotext: 'ID_CURSO',
  dpl_nombrecurso: 'Nombre de curso',
  dpl_codigocatalogo: 'Código de catálogo',
  dpl_carrera: 'Carrera',
  dpl_tipoensenanza: 'Tipo_Enseñanza',
  dpl_ciclo: 'Ciclo',
  dpl_logrocurso: 'Logro de aprendizaje',
  dpl_permiteconsignas: 'Permite_Consignas',
  dpl_permiterubricas: 'Permite_Rubricas',
  dpl_permitelistacotejo: 'Permite_Lista_Cotejo',
  dpl_permiteescala: 'Permite_Escala',
  // Course data pulled into each process (ACTIVAR); the IA_Para*_Corrido columns are IA only.
  dpl_activado_consignas: 'Activado_Consignas',
  dpl_activado_rubrica: 'Activado_Rubricas',
  dpl_activado_matriz: 'Activado_Matriz',
  dpl_activado_lista: 'Activado_Lista_Cotejo',
  dpl_activado_escala: 'Activado_Escala',
  dpl_docenteasignado: 'DocenteyAsesor (texto antiguo)',
  dpl_horas: 'Horas',
  dpl_metodologia: 'Metodología',
  dpl_software: 'Software',
  dpl_idunidadtext: 'ID_UNIDAD',
  dpl_nombreunidad: 'Título de unidad',
  dpl_numerounidad: 'Unidad',
  dpl_logroespecifico: 'Logro específico de aprendizaje',
  dpl_temasesiones: 'Tema sesión X Unidad',
  dpl_realizado: 'Realizado',
  dpl_elementoasignado: 'ElementoAsignado',
  dpl_nivelcomplejidad: 'Nivel de Complejidad',
  dpl_queseevaluar: '¿Qué se debe evaluar en la actividad?',
  dpl_instrumentoevaluacion: '¿Qué instrumento (s) de evaluación se empleará?',
  dpl_elementocatalogo: 'Elemento_Catalogo',
  dpl_elementocatalogoabreviatura: 'Elemento_Catalogo: ABREVIATURA',
  dpl_elementocatalogodescripcion: 'Elemento_Catalogo: DESCRIPCIÓN',
  dpl_idsesiontext: 'ID_SESION',
  dpl_elemento: 'ElementoAsignado',
  dpl_abreviatura: 'Abreviatura_E',
  dpl_tema: 'Tema sesión',
  dpl_herramientaia: 'HERRAMIENTA_IA',
  dpl_semana: 'Semana',
  dpl_numerosesion: 'Sesión',
  dpl_tiemposesionmin: 'TIEMPO_SESION_MIN',
  dpl_actividad: 'Actividad/ Observación',
  dpl_observacion: 'Observación_E',
  dpl_peso: 'Peso_E',
  dpl_tipoobservacion: 'TIPO Observación_E',
  dpl_tieneelemento: 'TIENE_ELEMENTO',
  dpl_idconsignatext: 'ID_CONSIGNA_TEXT',
  dpl_queseevaluara: 'QUE_SE_EVALUARA',
  dpl_indicaciongeneral: 'Indicación General',
  dpl_indicacionesespecificas: 'Indicaciones Específicas',
  dpl_recomendaciones: 'Recomendaciones',
  dpl_anexo: 'Anexo',
  dpl_instrumento: 'INSTRUMENTO_ESCOGIDO',
  dpl_estado: 'ESTADO',
  dpl_usuarioregistro: 'Usuario_Registro',
  dpl_fecharegistro: 'Fecha_Hora_Registro',
  dpl_criterio: 'Criterio',
  dpl_orden: 'N°',
  dpl_definicioncriterio: 'Descripción del criterio',
  dpl_estandaresperado: 'Estándar esperado',
  dpl_puntajeestandar: 'Puntaje estándar',
  dpl_enproceso2: 'En proceso 2',
  dpl_puntajeenproceso2: 'Puntaje en proceso 2',
  dpl_enproceso1: 'En proceso 1',
  dpl_puntajeenproceso1: 'Puntaje en proceso 1',
  dpl_inicial: 'Inicial',
  dpl_puntajeinicial: 'Puntaje inicial',
  dpl_competencia: 'COMPETENCIA',
  dpl_descripcion: 'DESCRIPCION_COMPETENCIA',
  dpl_tipocompetencia: 'TIPO_COMPETENCIA',
  dpl_nivel: 'NIVEL_COMPETENCIA',
  dpl_cursoevidencia: 'CURSO_EVIDENCIA',
  dpl_competenciaevidencia: 'COMPETENCIA_EVIDENCIA',
  dpl_cursoid: 'Curso',
  dpl_unidadid: 'Unidad',
  dpl_sesionid: 'Elemento',
  dpl_programaid: 'Programa',
  dpl_competenciaid: 'Competencia',
  dpl_rubricaid: 'Rúbrica',
  dpl_rubricacriterioid: 'Criterio',
  dpl_json: 'JSON',
  dpl_resultadogpt: 'RESULTADO_GPT',
  dpl_modeloia: 'MODELO_IA',
  dpl_fechaia: 'Fecha IA',
  dpl_permitematrizsn: 'Permite_Matriz_SN',
  dpl_ppt: 'PPT',
  dpl_sinppt: 'Sin_PPT',
  dpl_channelid: 'ChannelID',
  dpl_ia_consigna_corrido: 'IA_ParaConsigna_Corrido',
  dpl_ia_rubrica_corrido: 'IA_ParaRubrica_Corrido',
  dpl_ia_matrizconrubrica_corrido: 'IA_ParaMatrizConRubrica_Corrido',
  dpl_ia_matrizsinrubrica_corrido: 'IA_ParaMatrizSinRubrica_Corrido',
  dpl_ia_escala_corrido: 'IA_ParaEscala_Corrido',
  dpl_ia_lista_corrido: 'IA_ParaLista_Corrido',
  dpl_ia_sesiones_corrido: 'IA_ParaSesiones_Corrido',
  dpl_notif_consigna_enviada: 'NotificacionConsignaEnviada',
  dpl_notif_rubrica_enviada: 'NotificacionRubricaEnviada',
  dpl_notif_matrizsinrubrica_enviada: 'NotificacionMatrizSinRubricaEnviada',
  dpl_notif_escala_enviada: 'NotificacionEscalaEnviada',
  dpl_notif_lista_enviada: 'NotificacionListaEnviada',
  dpl_catalogoelementoid: 'Elemento_Catalogo',
  dpl_inputs: 'INPUTS',
  dpl_paraia: 'PARA_IA',
  dpl_usuarioia: 'Usuario IA',
  dpl_idlistatext: 'ID_LISTA_TEXT',
  dpl_idescalatext: 'ID_ESCALA_TEXT',
  dpl_tipoescala: 'Escala',
  dpl_indicador: 'Indicador',
  dpl_observaciones: 'Observaciones',
  dpl_matrizid: 'Matriz',
  dpl_listacotejoid: 'Lista de cotejo',
  dpl_escalavaloracionid: 'Escala',
}

/** Foreign-key columns → the table they point at (shown by name, not id). */
export const REFERENCIAS: Record<string, string> = {
  dpl_cursoid: 'dpl_curso',
  dpl_unidadid: 'dpl_unidad',
  dpl_sesionid: 'dpl_sesion',
  dpl_programaid: 'dpl_programa',
  dpl_competenciaid: 'dpl_competencia',
  dpl_rubricaid: 'dpl_rubrica',
  dpl_rubricacriterioid: 'dpl_rubricacriterio',
  dpl_catalogoelementoid: 'dpl_catalogoelemento',
  dpl_matrizid: 'dpl_matriz',
  dpl_listacotejoid: 'dpl_listacotejo',
  dpl_escalavaloracionid: 'dpl_escalavaloracion',
  dpl_sesionbackupid: 'dpl_sesion',
}

/** System columns hidden from the grid (still exported). */
const OCULTAS = new Set(['statecode', 'statuscode', 'createdon', 'modifiedon'])

/** Lookup columns that can be changed by picking a value (the rest are structural). */
export const REFERENCIAS_EDITABLES = new Set(['dpl_catalogoelementoid'])

/** Options of a lookup: every row of the target table by its name. */
export async function opcionesReferencia(col: string): Promise<Array<{ id: string; nombre: string; fila: Record<string, unknown> }>> {
  const destino = TABLAS.find(t => t.tabla === REFERENCIAS[col])
  if (!destino?.etiqueta) return []
  const { data, error } = await supabase.from(destino.tabla).select('*').order(destino.etiqueta, { ascending: true }).limit(10000)
  if (error) throw new Error(error.message)
  return ((data ?? []) as Array<Record<string, unknown>>).map(f => ({ id: f[destino.pk] as string, nombre: String(f[destino.etiqueta!] ?? ''), fila: f }))
}

export function etiquetaColumna(col: string, cfg?: TablaConfig): string {
  if (cfg?.etiquetas?.[col]) return cfg.etiquetas[col]
  if (ETIQUETAS[col]) return ETIQUETAS[col]
  return col.replace(/^dpl_/, '').replace(/_/g, ' ')
}

export function columnasVisibles(filas: Array<Record<string, unknown>>, cfg: TablaConfig): string[] {
  const cols = new Set<string>(cfg.contexto ?? [])
  for (const f of filas.slice(0, 50)) Object.keys(f).forEach(k => cols.add(k))
  // An empty list still shows its columns (taken from its SharePoint order), ready for the first row.
  if (!filas.length) (cfg.orden ?? []).forEach(k => cols.add(k))
  const todas = [...cols].filter(c => c !== cfg.pk && !OCULTAS.has(c) && !cfg.ocultas?.includes(c))
  const primero = (cfg.orden ?? []).filter(c => todas.includes(c))
  return [...primero, ...todas.filter(c => !primero.includes(c))]
}

/** Lookup chains so every row can show which course it belongs to, like the SharePoint lists did. */
export interface Relaciones {
  nombres: Map<string, string>
  cursoDe: (fila: Record<string, unknown>) => string | null
  cursoTexto: Map<string, string>
  /** Course, unit and element a row belongs to (for the ctx_ columns). */
  contextoDe: (fila: Record<string, unknown>) => Contexto
}

export async function cargarRelaciones(cfg?: TablaConfig): Promise<Relaciones> {
  const pide = new Set(cfg?.contexto ?? [])
  const conConsigna = ['ctx_idconsigna', 'ctx_instrumento', 'ctx_queseevaluara', 'ctx_indicaciongeneral', 'ctx_indicacionesespecificas', 'ctx_instrumentoescogido'].some(k => pide.has(k))
  // Checklist / rating scale headers show their indicators as columns.
  const conIndicadores = cfg?.tabla === 'dpl_listacotejo' || cfg?.tabla === 'dpl_escalavaloracion' || cfg?.tabla === 'dpl_matriz'
  const conRelCompetencias = cfg?.tabla === 'dpl_rubricacriteriocompetencia'
  const conCriterios = cfg?.tabla === 'dpl_rubrica' && [...pide].some(k => k.startsWith('ctx_c') || k.startsWith('ctx_competencia') || k.includes('competencia'))
  const [nombres, u, s, r, c, m, l, e] = await Promise.all([
    cargarNombres(),
    supabase.from('dpl_unidad').select('dpl_unidadid, dpl_cursoid, dpl_idunidadtext, dpl_nombreunidad, dpl_numerounidad, dpl_logroespecifico, dpl_elementocatalogoabreviatura, dpl_elementoasignado').limit(10000),
    supabase.from('dpl_sesion').select('dpl_sesionid, dpl_unidadid, dpl_idsesiontext, dpl_elemento, dpl_abreviatura').limit(10000),
    supabase.from('dpl_rubrica').select('*').limit(10000),
    supabase.from('dpl_curso').select('dpl_cursoid, dpl_idcursotext, dpl_nombrecurso, dpl_codigocatalogo, dpl_logrocurso, dpl_carrera, dpl_tipoensenanza, dpl_ciclo').limit(10000),
    supabase.from('dpl_matriz').select('dpl_matrizid, dpl_sesionid').limit(10000),
    supabase.from('dpl_listacotejo').select('dpl_listacotejoid, dpl_sesionid').limit(10000),
    supabase.from('dpl_escalavaloracion').select('dpl_escalavaloracionid, dpl_sesionid').limit(10000),
  ])
  const cabeceraSesion = new Map<string, string>([
    ...(m.data ?? []).map(x => [x.dpl_matrizid as string, x.dpl_sesionid as string] as [string, string]),
    ...(l.data ?? []).map(x => [x.dpl_listacotejoid as string, x.dpl_sesionid as string] as [string, string]),
    ...(e.data ?? []).map(x => [x.dpl_escalavaloracionid as string, x.dpl_sesionid as string] as [string, string]),
  ])
  const unidadCurso = new Map((u.data ?? []).map(x => [x.dpl_unidadid as string, x.dpl_cursoid as string]))
  const sesionUnidad = new Map((s.data ?? []).map(x => [x.dpl_sesionid as string, x.dpl_unidadid as string]))
  const rubricaSesion = new Map((r.data ?? []).map(x => [x.dpl_rubricaid as string, x.dpl_sesionid as string]))
  const cursoTexto = new Map((c.data ?? []).map(x => [x.dpl_cursoid as string, (x.dpl_idcursotext as string) ?? '']))
  const deSesion = (id: unknown): string | null => (id ? unidadCurso.get(sesionUnidad.get(id as string) ?? '') ?? null : null)
  const cursoDe = (f: Record<string, unknown>): string | null =>
    (f.dpl_cursoid as string | undefined) ??
    (f.dpl_unidadid ? unidadCurso.get(f.dpl_unidadid as string) ?? null : null) ??
    deSesion(f.dpl_sesionid) ??
    (f.dpl_rubricaid ? deSesion(rubricaSesion.get(f.dpl_rubricaid as string)) : null) ??
    deSesion(f.dpl_sesionbackupid) ??
    deSesion(cabeceraSesion.get((f.dpl_matrizid ?? f.dpl_listacotejoid ?? f.dpl_escalavaloracionid) as string)) ??
    // REL_RUBRICA_COMPETENCIAS: criterion → rubric → element → course.
    (f.dpl_rubricacriterioid ? deSesion(sesionDe(f)) : null)
  // Context rows for the ctx_ columns.
  const [cp, pr] = await Promise.all([
    supabase.from('dpl_cursoprograma').select('dpl_cursoid, dpl_programaid').limit(10000),
    supabase.from('dpl_programa').select('dpl_programaid, dpl_nombre').limit(10000),
  ])
  const programa = new Map((pr.data ?? []).map(x => [x.dpl_programaid as string, (x.dpl_nombre as string) ?? '']))
  const programasCurso = new Map<string, string[]>()
  for (const x of cp.data ?? []) programasCurso.set(x.dpl_cursoid as string, [...(programasCurso.get(x.dpl_cursoid as string) ?? []), programa.get(x.dpl_programaid as string) ?? ''])
  const cursos = new Map((c.data ?? []).map(x => [x.dpl_cursoid as string, x as Record<string, unknown>]))
  const unidades = new Map((u.data ?? []).map(x => [x.dpl_unidadid as string, x as Record<string, unknown>]))
  const sesiones = new Map((s.data ?? []).map(x => [x.dpl_sesionid as string, x as Record<string, unknown>]))
  const rubricaDeSesion = new Map((r.data ?? []).map(x => [x.dpl_sesionid as string, x as Record<string, unknown>]))
  const sesionDe = (f: Record<string, unknown>): string | null =>
    (f.dpl_rubricacriterioid && criterioPorId.has(f.dpl_rubricacriterioid as string)
      ? rubricaSesion.get(criterioPorId.get(f.dpl_rubricacriterioid as string)!.dpl_rubricaid as string)
      : undefined) ??
    (f.dpl_sesionid as string | undefined) ??
    (f.dpl_sesionbackupid as string | undefined) ??
    (f.dpl_rubricaid ? rubricaSesion.get(f.dpl_rubricaid as string) : undefined) ??
    cabeceraSesion.get((f.dpl_matrizid ?? f.dpl_listacotejoid ?? f.dpl_escalavaloracionid) as string) ??
    null
  // Consignas, criteria and competences, only when the list shows them.
  const consignaDeSesion = new Map<string, Record<string, unknown>>()
  if (conConsigna) {
    const { data } = await supabase.from('dpl_consigna').select('dpl_consignaid, dpl_sesionid, dpl_idconsignatext, dpl_instrumento, dpl_queseevaluara, dpl_indicaciongeneral, dpl_indicacionesespecificas').limit(10000)
    for (const x of data ?? []) consignaDeSesion.set(x.dpl_sesionid as string, x)
  }
  const criteriosDeRubrica = new Map<string, Array<Record<string, unknown>>>()
  const competenciasDeRubrica = new Map<string, Array<Record<string, unknown>>>()
  if (conCriterios) {
    const [cr, sel, comp, cpc] = await Promise.all([
      supabase.from('dpl_rubricacriterio').select('*').order('dpl_orden', { ascending: true }).limit(20000),
      supabase.from('dpl_rubricacriteriocompetencia').select('dpl_rubricacriterioid, dpl_competenciaid').limit(20000),
      supabase.from('dpl_competencia').select('dpl_competenciaid, dpl_competencia, dpl_descripcion, dpl_tipocompetencia').limit(10000),
      supabase.from('dpl_cursoprogramacompetencia').select('dpl_cursoid, dpl_competenciaid, dpl_nivel, dpl_cursoevidencia, dpl_competenciaevidencia').limit(20000),
    ])
    const rubricaDeCriterio = new Map<string, string>()
    for (const x of cr.data ?? []) {
      rubricaDeCriterio.set(x.dpl_rubricacriterioid as string, x.dpl_rubricaid as string)
      criteriosDeRubrica.set(x.dpl_rubricaid as string, [...(criteriosDeRubrica.get(x.dpl_rubricaid as string) ?? []), x])
    }
    const competencia = new Map((comp.data ?? []).map(x => [x.dpl_competenciaid as string, x]))
    const mapeo = new Map((cpc.data ?? []).map(x => [`${x.dpl_cursoid}|${x.dpl_competenciaid}`, x]))
    const vistos = new Set<string>()
    for (const x of sel.data ?? []) {
      const rid = rubricaDeCriterio.get(x.dpl_rubricacriterioid as string)
      const c = competencia.get(x.dpl_competenciaid as string)
      if (!rid || !c || vistos.has(rid + '|' + c.dpl_competenciaid)) continue
      vistos.add(rid + '|' + c.dpl_competenciaid)
      const cid = deSesion(rubricaSesion.get(rid))
      const m = cid ? mapeo.get(`${cid}|${c.dpl_competenciaid}`) : undefined
      competenciasDeRubrica.set(rid, [
        ...(competenciasDeRubrica.get(rid) ?? []),
        { nombre: c.dpl_competencia, descripcion: c.dpl_descripcion, tipo: c.dpl_tipocompetencia, nivel: m?.dpl_nivel, cursoEvidencia: m?.dpl_cursoevidencia, competenciaEvidencia: m?.dpl_competenciaevidencia },
      ])
    }
  }

  const indicadoresDeLista = new Map<string, Array<Record<string, unknown>>>()
  if (conIndicadores) {
    const [tabla, fk] =
      cfg?.tabla === 'dpl_escalavaloracion' ? ['dpl_escalaindicador', 'dpl_escalavaloracionid']
      : cfg?.tabla === 'dpl_matriz' ? ['dpl_matrizpregunta', 'dpl_matrizid']
      : ['dpl_listacotejoindicador', 'dpl_listacotejoid']
    const { data } = await supabase.from(tabla).select('*').order('dpl_orden', { ascending: true }).limit(20000)
    for (const x of data ?? []) indicadoresDeLista.set(x[fk] as string, [...(indicadoresDeLista.get(x[fk] as string) ?? []), x])
  }

  const criterioPorId = new Map<string, Record<string, unknown>>()
  const competenciaPorId = new Map<string, Record<string, unknown>>()
  if (conRelCompetencias) {
    const [cr, co] = await Promise.all([
      supabase.from('dpl_rubricacriterio').select('dpl_rubricacriterioid, dpl_rubricaid, dpl_orden, dpl_criterio').limit(20000),
      supabase.from('dpl_competencia').select('*').limit(10000),
    ])
    for (const x of cr.data ?? []) criterioPorId.set(x.dpl_rubricacriterioid as string, x)
    for (const x of co.data ?? []) competenciaPorId.set(x.dpl_competenciaid as string, x)
  }

  const contextoDe = (f: Record<string, unknown>): Contexto => {
    const sid = sesionDe(f)
    const sesion = sid ? sesiones.get(sid) ?? null : null
    const unidad = (sesion ? unidades.get(sesion.dpl_unidadid as string) : f.dpl_unidadid ? unidades.get(f.dpl_unidadid as string) : null) ?? null
    const cid = cursoDe(f)
    const curso = cid ? cursos.get(cid) ?? null : null
    const rub = sid ? rubricaDeSesion.get(sid) : undefined
    return {
      curso,
      unidad,
      sesion,
      carrera: (curso?.dpl_carrera as string | undefined) || (cid ? (programasCurso.get(cid) ?? []).filter(Boolean).join(', ') : ''),
      rubricaRealizada: rub ? !!rub.dpl_realizado : null,
      consigna: sid ? consignaDeSesion.get(sid) ?? null : null,
      criterios: f.dpl_rubricaid ? criteriosDeRubrica.get(f.dpl_rubricaid as string) ?? [] : [],
      competencias: f.dpl_rubricaid ? competenciasDeRubrica.get(f.dpl_rubricaid as string) ?? [] : [],
      indicadores: conIndicadores ? indicadoresDeLista.get((f.dpl_listacotejoid ?? f.dpl_escalavaloracionid ?? f.dpl_matrizid) as string) ?? [] : [],
      cabeceraId: ((f.dpl_matrizid ?? f.dpl_listacotejoid ?? f.dpl_escalavaloracionid) as string | undefined) ?? null,
      criterio: f.dpl_rubricacriterioid ? criterioPorId.get(f.dpl_rubricacriterioid as string) ?? null : null,
      competencia: f.dpl_competenciaid ? competenciaPorId.get(f.dpl_competenciaid as string) ?? null : null,
      programa: f.dpl_programaid ? programa.get(f.dpl_programaid as string) ?? '' : '',
      programaId: (f.dpl_programaid as string | undefined) ?? null,
    }
  }
  return { nombres, cursoDe, cursoTexto, contextoDe }
}

export async function cargarTabla(cfg: TablaConfig): Promise<{ existe: boolean; filas: Array<Record<string, unknown>> }> {
  const filas: Array<Record<string, unknown>> = []
  for (let desde = 0; desde < 20000; desde += 1000) {
    const { data, error } = await supabase.from(cfg.tabla).select('*').range(desde, desde + 999)
    if (error) {
      if (/does not exist|schema cache/i.test(error.message)) return { existe: false, filas: [] }
      throw new Error(error.message)
    }
    filas.push(...(data ?? []))
    if (!data || data.length < 1000) break
  }
  return { existe: true, filas: ordenarComoSharePoint(filas) }
}

/**
 * Rows in a stable order: oldest first, so new rows go at the end. Rows created
 * in the same minute (an import) follow their code naturally: C1, C2 … C10.
 */
function ordenarComoSharePoint(filas: Array<Record<string, unknown>>): Array<Record<string, unknown>> {
  const CODIGOS = ['dpl_idcursotext', 'dpl_idunidadtext', 'dpl_idsesiontext', 'dpl_idconsignatext', 'dpl_idlistatext', 'dpl_idescalatext', 'dpl_idprogramatext', 'dpl_idcompetenciatext']
  const minuto = (f: Record<string, unknown>) => String(f.createdon ?? '').slice(0, 16)
  const codigo = (f: Record<string, unknown>) => String(CODIGOS.map(k => f[k]).find(v => v) ?? '')
  const natural = new Intl.Collator('es', { numeric: true, sensitivity: 'base' })
  return [...filas].sort(
    (a, b) =>
      minuto(a).localeCompare(minuto(b)) ||
      natural.compare(codigo(a), codigo(b)) ||
      Number(a.dpl_orden ?? 0) - Number(b.dpl_orden ?? 0) ||
      String(a.createdon ?? '').localeCompare(String(b.createdon ?? '')),
  )
}

/** id → readable name for every referenced table, used to show lookups by name. */
/** Code column of each lookup target (what SharePoint shows in a lookup cell). */
const CODIGO_DE_TABLA: Record<string, string> = {
  dpl_curso: 'dpl_idcursotext',
  dpl_unidad: 'dpl_idunidadtext',
  dpl_sesion: 'dpl_idsesiontext',
  dpl_programa: 'dpl_idprogramatext',
  dpl_competencia: 'dpl_idcompetenciatext',
}
/** id → code (C14, U69…), filled by cargarNombres. */
export const codigosRef = new Map<string, string>()

export async function cargarNombres(): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  const destinos = [...new Set(Object.values(REFERENCIAS))]
  await Promise.all(
    destinos.map(async t => {
      const cfg = TABLAS.find(x => x.tabla === t)
      if (!cfg?.etiqueta) return
      const cod = CODIGO_DE_TABLA[t]
      const { data } = await supabase.from(t).select([cfg.pk, cfg.etiqueta, cod].filter(Boolean).join(', ')).limit(10000)
      for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) {
        nombres.set(r[cfg.pk] as string, String(r[cfg.etiqueta] ?? ''))
        if (cod && r[cod]) codigosRef.set(r[cfg.pk] as string, String(r[cod]))
      }
    }),
  )
  return nombres
}

/** Insert new rows (with the table's required defaults). Returns them as stored. */
export async function insertarFilas(cfg: TablaConfig, filas: Array<Record<string, unknown>>): Promise<Array<Record<string, unknown>>> {
  const { data, error } = await supabase.from(cfg.tabla).insert(filas.map(f => ({ ...(cfg.nuevaFila ?? {}), ...f }))).select('*')
  if (error) throw new Error(/duplicate key/i.test(error.message) ? 'Ya existe un registro con ese código o esa combinación.' : error.message)
  return (data ?? []) as Array<Record<string, unknown>>
}

/** Code shown next to a lookup option (C14, U69, S313…), also used to match pasted text. */
export function codigoReferencia(fila: Record<string, unknown>): string {
  for (const k of ['dpl_idcursotext', 'dpl_idunidadtext', 'dpl_idsesiontext', 'dpl_idprogramatext', 'dpl_idcompetenciatext', 'dpl_abreviatura'])
    if (fila[k]) return String(fila[k])
  return ''
}

/** Save a context value in the list it comes from. */
export async function actualizarDestino(d: DestinoContexto, valor: unknown): Promise<void> {
  if (!d.id && d.crear) {
    // Created by an earlier cell of the same paste? Then update it instead of creating another.
    let q = supabase.from(d.tabla).select(d.pk)
    for (const [k, v] of Object.entries(d.crear)) q = q.eq(k, v as string)
    const { data: existe, error: e1 } = await q.limit(1)
    if (e1) throw new Error(e1.message)
    const id = (existe?.[0] as unknown as Record<string, unknown> | undefined)?.[d.pk]
    if (id) return actualizarDestino({ ...d, id: String(id), crear: undefined }, valor)
    if (valor === null || valor === '') return
    const { error } = await supabase.from(d.tabla).insert({ ...d.crear, [d.col]: valor })
    if (error) throw new Error(error.message)
    return
  }
  const { error } = await supabase.from(d.tabla).update({ [d.col]: valor }).eq(d.pk, d.id)
  if (error) throw new Error(error.message)
}

export async function actualizarCelda(cfg: TablaConfig, id: string, col: string, valor: unknown): Promise<void> {
  const { error } = await supabase.from(cfg.tabla).update({ [col]: valor }).eq(cfg.pk, id)
  if (error) throw new Error(error.message)
}

export async function eliminarFila(cfg: TablaConfig, id: string): Promise<void> {
  const { error } = await supabase.from(cfg.tabla).delete().eq(cfg.pk, id)
  if (error) throw new Error(error.message)
}

/** Excel-friendly CSV (UTF-8 BOM, ";" separator) and trigger the download. */
export function descargarCsv(
  nombre: string,
  columnas: string[],
  filas: Array<Record<string, unknown>>,
  valor: (f: Record<string, unknown>, c: string) => string,
  encabezado: (c: string) => string = etiquetaColumna,
) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lineas = [columnas.map(c => esc(encabezado(c))).join(';'), ...filas.map(f => columnas.map(c => esc(valor(f, c))).join(';'))]
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
