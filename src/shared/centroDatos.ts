// src/shared/centroDatos.ts
// Catalogue and generic data access for the admin "Centro de datos": every
// table the platform uses, viewable, editable and downloadable like the old
// SharePoint lists.

import { supabase } from './supabaseClient'

export interface TablaConfig {
  tabla: string
  pk: string
  titulo: string
  grupo: string
  /** Column that names a row when another table points at it. */
  etiqueta?: string
}

export const GRUPOS = ['Información base', 'Contenido académico', 'Seguimiento'] as const

export const TABLAS: TablaConfig[] = [
  { grupo: 'Información base', tabla: 'dpl_curso', pk: 'dpl_cursoid', titulo: 'Cursos', etiqueta: 'dpl_nombrecurso' },
  { grupo: 'Información base', tabla: 'dpl_unidad', pk: 'dpl_unidadid', titulo: 'Unidades', etiqueta: 'dpl_nombreunidad' },
  { grupo: 'Información base', tabla: 'dpl_sesion', pk: 'dpl_sesionid', titulo: 'Elementos de evaluación (sesiones)', etiqueta: 'dpl_elemento' },
  { grupo: 'Información base', tabla: 'dpl_programa', pk: 'dpl_programaid', titulo: 'Programas', etiqueta: 'dpl_nombre' },
  { grupo: 'Información base', tabla: 'dpl_cursoprograma', pk: 'dpl_cursoprogramaid', titulo: 'Cursos por programa' },
  { grupo: 'Información base', tabla: 'dpl_competencia', pk: 'dpl_competenciaid', titulo: 'Competencias', etiqueta: 'dpl_competencia' },
  { grupo: 'Información base', tabla: 'dpl_cursoprogramacompetencia', pk: 'dpl_cursoprogramacompetenciaid', titulo: 'Competencias por curso y programa' },
  { grupo: 'Información base', tabla: 'dpl_taxonomiaitem', pk: 'dpl_taxonomiaitemid', titulo: 'Taxonomía de la matriz' },
  { grupo: 'Contenido académico', tabla: 'dpl_consigna', pk: 'dpl_consignaid', titulo: 'Consignas', etiqueta: 'dpl_idconsignatext' },
  { grupo: 'Contenido académico', tabla: 'dpl_rubrica', pk: 'dpl_rubricaid', titulo: 'Rúbricas', etiqueta: 'dpl_nombre' },
  { grupo: 'Contenido académico', tabla: 'dpl_rubricacriterio', pk: 'dpl_rubricacriterioid', titulo: 'Criterios de rúbrica', etiqueta: 'dpl_criterio' },
  { grupo: 'Contenido académico', tabla: 'dpl_rubricacriteriocompetencia', pk: 'dpl_rubricacriteriocompetenciaid', titulo: 'Competencias por criterio' },
  { grupo: 'Contenido académico', tabla: 'dpl_matriz', pk: 'dpl_matrizid', titulo: 'Matrices', etiqueta: 'dpl_nombre' },
  { grupo: 'Contenido académico', tabla: 'dpl_matrizpregunta', pk: 'dpl_matrizpreguntaid', titulo: 'Preguntas de matriz' },
  { grupo: 'Contenido académico', tabla: 'dpl_listacotejo', pk: 'dpl_listacotejoid', titulo: 'Listas de cotejo', etiqueta: 'dpl_nombre' },
  { grupo: 'Contenido académico', tabla: 'dpl_listacotejoindicador', pk: 'dpl_listacotejoindicadorid', titulo: 'Indicadores de lista de cotejo' },
  { grupo: 'Contenido académico', tabla: 'dpl_escalavaloracion', pk: 'dpl_escalavaloracionid', titulo: 'Escalas de valoración', etiqueta: 'dpl_nombre' },
  { grupo: 'Contenido académico', tabla: 'dpl_escalaindicador', pk: 'dpl_escalaindicadorid', titulo: 'Indicadores de escala' },
  { grupo: 'Seguimiento', tabla: 'dpl_procesocurso', pk: 'dpl_procesocursoid', titulo: 'Estado del proceso por curso' },
  { grupo: 'Seguimiento', tabla: 'dpl_procesoevento', pk: 'dpl_procesoeventoid', titulo: 'Historial de aprobaciones' },
  { grupo: 'Seguimiento', tabla: 'dpl_comentario', pk: 'dpl_comentarioid', titulo: 'Comentarios de aprobadores' },
]

/** Column headers — SharePoint names where the column came from a SharePoint list. */
const ETIQUETAS: Record<string, string> = {
  dpl_idcursotext: 'ID_CURSO_TEXT',
  dpl_nombrecurso: 'NOMBRE_CURSO',
  dpl_codigocatalogo: 'COD_CATALAGO',
  dpl_carrera: 'CARRERA',
  dpl_tipoensenanza: 'TIPO_ENSEÑANZA',
  dpl_ciclo: 'CICLO',
  dpl_logrocurso: 'LOGRO_CURSO',
  dpl_permiteconsignas: 'Permite_Consignas',
  dpl_permiterubricas: 'Permite_Rubricas',
  dpl_permitematrizsn: 'Permite_Matriz',
  dpl_permitelistacotejo: 'Permite_Lista_Cotejo',
  dpl_permiteescala: 'Permite_Escala',
  dpl_docenteasignado: 'DocenteyAsesor',
  dpl_horas: 'Horas',
  dpl_metodologia: 'Metodología',
  dpl_software: 'Software',
  dpl_idunidadtext: 'ID_UNIDAD_TEXT',
  dpl_nombreunidad: 'NOMBRE_UNIDAD',
  dpl_numerounidad: 'UNIDAD',
  dpl_logroespecifico: 'LOGRO_UNIDAD',
  dpl_idsesiontext: 'ID_SESION_TEXT',
  dpl_elemento: 'ELEMENTO',
  dpl_abreviatura: 'ABREVIATURA',
  dpl_tema: 'TEMA',
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
  dpl_matrizid: 'dpl_matriz',
  dpl_listacotejoid: 'dpl_listacotejo',
  dpl_escalavaloracionid: 'dpl_escalavaloracion',
}

/** System columns hidden from the grid (still exported). */
const OCULTAS = new Set(['statecode', 'statuscode', 'createdon', 'modifiedon'])

export function etiquetaColumna(col: string): string {
  if (ETIQUETAS[col]) return ETIQUETAS[col]
  return col.replace(/^dpl_/, '').replace(/_/g, ' ')
}

export function columnasVisibles(filas: Array<Record<string, unknown>>, cfg: TablaConfig): string[] {
  const cols = new Set<string>()
  for (const f of filas.slice(0, 50)) Object.keys(f).forEach(k => cols.add(k))
  return [...cols].filter(c => c !== cfg.pk && !OCULTAS.has(c))
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
export function descargarCsv(nombre: string, columnas: string[], filas: Array<Record<string, unknown>>, valor: (f: Record<string, unknown>, c: string) => string) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`
  const lineas = [columnas.map(c => esc(etiquetaColumna(c))).join(';'), ...filas.map(f => columnas.map(c => esc(valor(f, c))).join(';'))]
  const blob = new Blob(['﻿' + lineas.join('\r\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${nombre}.csv`
  a.click()
  URL.revokeObjectURL(url)
}
