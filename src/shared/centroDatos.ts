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
}

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
    grupo: 'Cursos', tabla: 'dpl_curso', pk: 'dpl_cursoid', titulo: 'LISTADO_CURSOS_PARA_IA', descripcion: 'Cursos y personas asignadas', etiqueta: 'dpl_nombrecurso',
    orden: ['dpl_idcursotext', 'dpl_codigocatalogo', 'dpl_nombrecurso', 'dpl_carrera', 'dpl_tipoensenanza', 'dpl_ciclo'],
  },
  {
    grupo: 'Cursos', tabla: 'dpl_unidad', pk: 'dpl_unidadid', titulo: 'UNIDADES_CURSOS_IA', descripcion: 'Unidades, logros y elementos', etiqueta: 'dpl_nombreunidad',
    orden: [
      'dpl_idunidadtext', 'dpl_numerounidad', 'dpl_nombreunidad', 'dpl_logroespecifico', 'dpl_temasesiones', 'dpl_realizado',
      'dpl_elementoasignado', 'dpl_nivelcomplejidad', 'dpl_queseevaluar', 'dpl_instrumentoevaluacion',
      'dpl_catalogoelementoid', 'dpl_elementocatalogoabreviatura', 'dpl_elementocatalogodescripcion',
    ],
    // Elemento_Catalogo is a lookup to CATALOGO_ELEMENTOS; its abbreviation and
    // description come from the catalogue (kept as text for the Excel export).
    ocultas: ['dpl_elementocatalogo'],
    opciones: { dpl_instrumentoevaluacion: OPCIONES_INSTRUMENTO_UNIDAD },
    soloLectura: ['dpl_elementocatalogoabreviatura', 'dpl_elementocatalogodescripcion'],
  },
  {
    grupo: 'Cursos', tabla: 'dpl_catalogoelemento', pk: 'dpl_catalogoelementoid', titulo: 'CATALOGO_ELEMENTOS', descripcion: 'Tipos de elemento de evaluación', etiqueta: 'dpl_elemento',
    orden: ['dpl_tipo', 'dpl_elemento', 'dpl_abreviatura', 'dpl_descripcion'],
    etiquetas: { dpl_tipo: 'TIPO', dpl_abreviatura: 'ABREVIATURA', dpl_elemento: 'ELEMENTO', dpl_descripcion: 'DESCRIPCIÓN' },
  },
  {
    grupo: 'Cursos', tabla: 'dpl_sesion', pk: 'dpl_sesionid', titulo: 'SESIONES_CURSOS_IA', descripcion: 'Sesiones del sílabo', etiqueta: 'dpl_elemento',
    orden: [
      'dpl_unidadid', 'dpl_idsesiontext', 'dpl_herramientaia', 'dpl_semana', 'dpl_numerosesion', 'dpl_tiemposesionmin', 'dpl_tema',
      'dpl_actividad', 'dpl_elemento', 'dpl_abreviatura', 'dpl_observacion', 'dpl_peso', 'dpl_tipoobservacion', 'dpl_tieneelemento', 'dpl_realizado',
    ],
  },
  { grupo: 'Consignas', tabla: 'dpl_consigna', pk: 'dpl_consignaid', titulo: 'CONSOLIDADO_CONSIGNAS', descripcion: 'Consignas', etiqueta: 'dpl_idconsignatext', orden: ['dpl_idconsignatext', 'dpl_instrumento'], opciones: { dpl_instrumento: OPCIONES_INSTRUMENTO_CONSIGNA } },
  { grupo: 'Rúbricas', tabla: 'dpl_rubricacriterio', pk: 'dpl_rubricacriterioid', titulo: 'CONSOLIDADO_RUBRICAS', descripcion: 'Criterios de las rúbricas', etiqueta: 'dpl_criterio', orden: ['dpl_rubricaid', 'dpl_orden', 'dpl_criterio'] },
  { grupo: 'Rúbricas', tabla: 'dpl_rubricacriteriocompetencia', pk: 'dpl_rubricacriteriocompetenciaid', titulo: 'REL_RUBRICA_COMPETENCIAS', descripcion: 'Competencias elegidas por criterio' },
  { grupo: 'Matriz', tabla: 'dpl_matrizpregunta', pk: 'dpl_matrizpreguntaid', titulo: 'MATRIZ_SN_RUBRICA', descripcion: 'Preguntas de la matriz' },
  { grupo: 'Lista de cotejo', tabla: 'dpl_listacotejoindicador', pk: 'dpl_listacotejoindicadorid', titulo: 'CONSOLIDADO_LISTA_DE_COTEJO', descripcion: 'Indicadores de la lista de cotejo' },
  { grupo: 'Escala de valoración', tabla: 'dpl_escalaindicador', pk: 'dpl_escalaindicadorid', titulo: 'CONSOLIDADO_ESCALA_DE_VALORACION', descripcion: 'Indicadores de la escala' },
  { grupo: 'Matriz', tabla: 'dpl_taxonomiaitem', pk: 'dpl_taxonomiaitemid', titulo: 'TAXONOMIA_MATRIZ_SN_RUBRICA', descripcion: 'Catálogo de taxonomía' },
  { grupo: 'Competencias', tabla: 'dpl_competencia', pk: 'dpl_competenciaid', titulo: 'COMPETENCIAS_PARA_MAPEO', descripcion: 'Catálogo de competencias', etiqueta: 'dpl_competencia' },
  { grupo: 'Competencias', tabla: 'dpl_programa', pk: 'dpl_programaid', titulo: 'PROGRAMAS', descripcion: 'Catálogo de programas', etiqueta: 'dpl_nombre' },
  { grupo: 'Competencias', tabla: 'dpl_cursoprograma', pk: 'dpl_cursoprogramaid', titulo: 'MAPEO_PROGRAMAS', descripcion: 'Programas de cada curso' },
  { grupo: 'Seguimiento', tabla: 'dpl_procesocurso', pk: 'dpl_procesocursoid', titulo: 'ESTADO_PROCESO', descripcion: 'Estado de aprobación por curso' },
  { grupo: 'Seguimiento', tabla: 'dpl_procesoevento', pk: 'dpl_procesoeventoid', titulo: 'HISTORIAL_APROBACIONES', descripcion: 'Quién finalizó, aprobó o devolvió' },
  { grupo: 'Seguimiento', tabla: 'dpl_comentario', pk: 'dpl_comentarioid', titulo: 'COMENTARIOS', descripcion: 'Comentarios de los aprobadores' },
  { grupo: 'Competencias', tabla: 'dpl_cursoprogramacompetencia', pk: 'dpl_cursoprogramacompetenciaid', titulo: 'Competencias por curso y programa', descripcion: 'Alimenta las competencias de Rúbricas' },
  { grupo: 'Rúbricas', tabla: 'dpl_rubrica', pk: 'dpl_rubricaid', titulo: 'Rúbricas (cabecera)', descripcion: 'Una por elemento', etiqueta: 'dpl_nombre' },
  { grupo: 'Matriz', tabla: 'dpl_matriz', pk: 'dpl_matrizid', titulo: 'Matrices (cabecera)', descripcion: 'Una por elemento', etiqueta: 'dpl_nombre' },
  { grupo: 'Lista de cotejo', tabla: 'dpl_listacotejo', pk: 'dpl_listacotejoid', titulo: 'Listas de cotejo (cabecera)', descripcion: 'Una por elemento', etiqueta: 'dpl_nombre' },
  { grupo: 'Escala de valoración', tabla: 'dpl_escalavaloracion', pk: 'dpl_escalavaloracionid', titulo: 'Escalas (cabecera)', descripcion: 'Una por elemento', etiqueta: 'dpl_nombre' },
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
  const cols = new Set<string>()
  for (const f of filas.slice(0, 50)) Object.keys(f).forEach(k => cols.add(k))
  const todas = [...cols].filter(c => c !== cfg.pk && !OCULTAS.has(c) && !cfg.ocultas?.includes(c))
  const primero = (cfg.orden ?? []).filter(c => todas.includes(c))
  return [...primero, ...todas.filter(c => !primero.includes(c))]
}

/** Lookup chains so every row can show which course it belongs to, like the SharePoint lists did. */
export interface Relaciones {
  nombres: Map<string, string>
  cursoDe: (fila: Record<string, unknown>) => string | null
  cursoTexto: Map<string, string>
}

export async function cargarRelaciones(): Promise<Relaciones> {
  const [nombres, u, s, r, c] = await Promise.all([
    cargarNombres(),
    supabase.from('dpl_unidad').select('dpl_unidadid, dpl_cursoid').limit(10000),
    supabase.from('dpl_sesion').select('dpl_sesionid, dpl_unidadid').limit(10000),
    supabase.from('dpl_rubrica').select('dpl_rubricaid, dpl_sesionid').limit(10000),
    supabase.from('dpl_curso').select('dpl_cursoid, dpl_idcursotext').limit(10000),
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
    (f.dpl_rubricaid ? deSesion(rubricaSesion.get(f.dpl_rubricaid as string)) : null)
  return { nombres, cursoDe, cursoTexto }
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
  return { existe: true, filas }
}

/** id → readable name for every referenced table, used to show lookups by name. */
export async function cargarNombres(): Promise<Map<string, string>> {
  const nombres = new Map<string, string>()
  const destinos = [...new Set(Object.values(REFERENCIAS))]
  await Promise.all(
    destinos.map(async t => {
      const cfg = TABLAS.find(x => x.tabla === t)
      if (!cfg?.etiqueta) return
      const { data } = await supabase.from(t).select(`${cfg.pk}, ${cfg.etiqueta}`).limit(10000)
      for (const r of (data ?? []) as unknown as Array<Record<string, unknown>>) nombres.set(r[cfg.pk] as string, String(r[cfg.etiqueta] ?? ''))
    }),
  )
  return nombres
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
