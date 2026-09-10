// scripts/migrate-competencias.cjs
// One-time data loader for the Programas/Competencias extension.
//
// Prerequisite: schema-competencias.sql has already been run in the Supabase
// SQL Editor (adds the new columns/tables this script writes to).
//
// Reads the original SharePoint CSV exports from Downloads (never a live
// SharePoint call — these are files the user already downloaded), resolves
// every relationship against the *live* Supabase project (via its REST API,
// using the anon key — same trust boundary as the app itself, since RLS is
// currently wide open), and writes the new rows directly over HTTP. No manual
// SQL paste needed for the data itself, only for the DDL.
//
// Usage: node scripts/migrate-competencias.cjs

const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')

const PROJECT_ROOT = path.join(__dirname, '..')
const DOWNLOADS = 'C:/Users/fbustamant/Downloads/'

// ── Env ───────────────────────────────────────────────────────────────────────

function loadEnvLocal() {
  const text = fs.readFileSync(path.join(PROJECT_ROOT, '.env.local'), 'utf8')
  const env = {}
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
    if (m) env[m[1]] = m[2].trim()
  }
  return env
}

const env = loadEnvLocal()
const SUPABASE_URL = env.VITE_SUPABASE_URL
const ANON_KEY = env.VITE_SUPABASE_ANON_KEY
if (!SUPABASE_URL || !ANON_KEY) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env.local')
  process.exit(1)
}

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ANON_KEY}`,
  'Content-Type': 'application/json',
}

async function sbGet(table, query) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers })
  if (!res.ok) throw new Error(`GET ${table} failed: ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbInsert(table, rows) {
  if (rows.length === 0) return
  const chunkSize = 200
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize)
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify(chunk),
    })
    if (!res.ok) throw new Error(`INSERT ${table} failed: ${res.status} ${await res.text()}`)
  }
}

async function sbPatch(table, filter, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, {
    method: 'PATCH',
    headers: { ...headers, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`PATCH ${table} failed: ${res.status} ${await res.text()}`)
}

// ── CSV loading ───────────────────────────────────────────────────────────────

function loadCsv(name) {
  const raw = fs.readFileSync(path.join(DOWNLOADS, name))
  const text = raw.toString('utf8').replace(/^\uFEFF/, '')
  return parse(text, { columns: true, skip_empty_lines: true, relax_column_count: true })
}

const parseBool = v => {
  if (v === null || v === undefined || v === '') return null
  const s = String(v).trim().toLowerCase()
  return ['true', 'verdadero', 'sí', 'si', 'yes', '1'].includes(s)
}
const parseIntOrNull = v => {
  const n = parseInt(v, 10)
  return Number.isFinite(n) ? n : null
}
const emptyToNull = v => (v === undefined || v === null || v === '' ? null : v)

/** "C6-U24-S105" -> "S105" (the trailing Sesión segment). */
const sesionTextFromComposite = composite => {
  const parts = String(composite).split('-')
  return parts[parts.length - 1]
}

async function main() {
  console.log('Fetching existing ID mappings from Supabase...')
  const [cursos, sesiones, unidades, rubricas, criterios, consignas] = await Promise.all([
    sbGet('dpl_curso', 'select=dpl_cursoid,dpl_idcursotext'),
    sbGet('dpl_sesion', 'select=dpl_sesionid,dpl_idsesiontext'),
    sbGet('dpl_unidad', 'select=dpl_unidadid,dpl_idunidadtext'),
    sbGet('dpl_rubrica', 'select=dpl_rubricaid,dpl_sesionid'),
    sbGet('dpl_rubricacriterio', 'select=dpl_rubricacriterioid,dpl_rubricaid,dpl_orden'),
    sbGet('dpl_consigna', 'select=dpl_consignaid,dpl_idconsignatext'),
  ])

  const cursoIdByText = new Map(cursos.map(c => [c.dpl_idcursotext, c.dpl_cursoid]))
  const sesionIdByText = new Map(sesiones.map(s => [s.dpl_idsesiontext, s.dpl_sesionid]))
  const unidadIdByText = new Map(unidades.map(u => [u.dpl_idunidadtext, u.dpl_unidadid]))
  const rubricaIdBySesionId = new Map(rubricas.map(r => [r.dpl_sesionid, r.dpl_rubricaid]))
  const criterioIdByRubricaOrden = new Map(
    criterios.map(c => [`${c.dpl_rubricaid}|${c.dpl_orden}`, c.dpl_rubricacriterioid]),
  )
  const consignaIdByText = new Map(consignas.map(c => [c.dpl_idconsignatext, c.dpl_consignaid]))
  console.log(
    `Loaded ${cursos.length} cursos, ${sesiones.length} sesiones, ${unidades.length} unidades, ${rubricas.length} rubricas, ${criterios.length} criterios, ${consignas.length} consignas.`,
  )

  // ── Programa ────────────────────────────────────────────────────────────────
  const programasCsv = loadCsv('PROGRAMAS.csv')
  const programaIdByText = new Map()
  const programaRows = []
  for (const row of programasCsv) {
    const idText = row.ID_PROGRAMA
    if (!idText || programaIdByText.has(idText)) continue
    const id = crypto.randomUUID()
    programaIdByText.set(idText, id)
    programaRows.push({ dpl_programaid: id, dpl_idprogramatext: idText, dpl_nombre: row.PROGRAMA })
  }
  await sbInsert('dpl_programa', programaRows)
  console.log(`Inserted ${programaRows.length} dpl_programa rows.`)

  // ── Curso <-> Programa ─────────────────────────────────────────────────────
  const seenCursoPrograma = new Set()
  const cursoProgramaRows = []
  for (const row of programasCsv) {
    const cursoId = cursoIdByText.get(row.ID_CURSO)
    const programaId = programaIdByText.get(row.ID_PROGRAMA)
    if (!cursoId || !programaId) continue
    const key = `${cursoId}|${programaId}`
    if (seenCursoPrograma.has(key)) continue
    seenCursoPrograma.add(key)
    cursoProgramaRows.push({ dpl_cursoid: cursoId, dpl_programaid: programaId })
  }
  await sbInsert('dpl_cursoprograma', cursoProgramaRows)
  console.log(`Inserted ${cursoProgramaRows.length} dpl_cursoprograma rows.`)

  // ── Competencia ────────────────────────────────────────────────────────────
  const competenciasCsv = loadCsv('COMPTENCIAS_PARA MAPEO.csv')
  const competenciaIdByText = new Map()
  const competenciaRows = []
  for (const row of competenciasCsv) {
    const idText = row.ID_Comptencia
    if (!idText || competenciaIdByText.has(idText)) continue
    const id = crypto.randomUUID()
    competenciaIdByText.set(idText, id)
    competenciaRows.push({
      dpl_competenciaid: id,
      dpl_idcompetenciatext: idText,
      dpl_competencia: row.Competencia,
      dpl_descripcion: row['Descripción de la competencia'],
      dpl_tipocompetencia: row['Tipo de competencia'],
      dpl_catalogoevidencia: parseBool(row['Catálogo evidencia']),
    })
  }
  await sbInsert('dpl_competencia', competenciaRows)
  console.log(`Inserted ${competenciaRows.length} dpl_competencia rows.`)

  // ── Curso+Programa <-> Competencia ─────────────────────────────────────────
  const cpcRows = []
  for (const row of competenciasCsv) {
    const cursoId = cursoIdByText.get(row.ID_CURSO)
    const programaId = programaIdByText.get(row.ID_PROGRAMA_M)
    const competenciaId = competenciaIdByText.get(row.ID_Comptencia)
    if (!cursoId || !programaId || !competenciaId) continue
    cpcRows.push({
      dpl_cursoid: cursoId,
      dpl_programaid: programaId,
      dpl_competenciaid: competenciaId,
      dpl_nivel: parseIntOrNull(row.Nivel),
      dpl_cursoevidencia: parseBool(row['Curso evidencia']),
      dpl_competenciaevidencia: parseBool(row['Competencia evidencia']),
    })
  }
  await sbInsert('dpl_cursoprogramacompetencia', cpcRows)
  console.log(`Inserted ${cpcRows.length} dpl_cursoprogramacompetencia rows.`)

  // ── Criterio de Rúbrica <-> Competencia ─────────────────────────────────────
  const relCsv = loadCsv('REL_RUBRICA_COMPETENCIAS.csv')
  const rccRows = []
  let unresolvedRel = 0
  for (const row of relCsv) {
    const competenciaId = competenciaIdByText.get(row.ID_Competencia)
    if (!competenciaId) continue // unlinked criterion in the source data — nothing to record

    const sesionText = sesionTextFromComposite(row.ID_CONSIGNA_TEXT)
    const sesionId = sesionIdByText.get(sesionText)
    const rubricaId = sesionId ? rubricaIdBySesionId.get(sesionId) : undefined
    const orden = parseIntOrNull(String(row.CriterioCodigo || '').replace(/^CR/i, ''))
    const criterioId = rubricaId && orden ? criterioIdByRubricaOrden.get(`${rubricaId}|${orden}`) : undefined

    if (!criterioId) {
      unresolvedRel++
      continue
    }

    rccRows.push({
      dpl_rubricacriterioid: criterioId,
      dpl_competenciaid: competenciaId,
      dpl_nivel: parseIntOrNull(row.Nivel),
      dpl_competenciaevidencia: parseBool(row.CompetenciaEvidencia),
    })
  }
  await sbInsert('dpl_rubricacriteriocompetencia', rccRows)
  console.log(
    `Inserted ${rccRows.length} dpl_rubricacriteriocompetencia rows (${unresolvedRel} rows in the CSV referenced a criterion this database doesn't have — skipped).`,
  )

  // ── Taxonomía -> Tipo de Ítem catalog ──────────────────────────────────────
  const taxCsv = loadCsv('TAXONOMIA_MATRIZ_SN_RUBRICA.csv')
  const taxRows = []
  for (const row of taxCsv) {
    const taxonomia = row['Taxonomía_Bloom']
    for (let i = 1; i <= 8; i++) {
      const tipoItem = row[`Tipos_ítem_${i}`]
      const nombrePlataforma = row[`Nombre_plataforma_${i}`]
      if (!tipoItem) continue
      taxRows.push({
        dpl_taxonomia: taxonomia,
        dpl_tipoitem: tipoItem,
        dpl_nombreplataforma: emptyToNull(nombrePlataforma),
        dpl_orden: i,
      })
    }
  }
  await sbInsert('dpl_taxonomiaitem', taxRows)
  console.log(`Inserted ${taxRows.length} dpl_taxonomiaitem rows.`)

  // ── Extra Curso columns ─────────────────────────────────────────────────────
  const cursosIACsv = loadCsv('LISTADO_CURSOS_PARA_IA.csv')
  let cursoPatched = 0
  for (const row of cursosIACsv) {
    const cursoId = cursoIdByText.get(row.ID_CURSO)
    if (!cursoId) continue
    await sbPatch('dpl_curso', `dpl_cursoid=eq.${cursoId}`, {
      dpl_docenteasignado: emptyToNull(row['DocenteyAsesor'] || row['Persona Asignada']),
      dpl_horas: parseIntOrNull(row['Horas_S']),
      dpl_metodologia: emptyToNull(row['Metodología_S']),
      dpl_software: emptyToNull(row['Software']),
      dpl_ia_consigna_corrido: parseBool(row['IA_ParaConsigna_Corrido']),
      dpl_ia_rubrica_corrido: parseBool(row['IA_ParaRubrica_Corrido']),
      dpl_ia_matrizconrubrica_corrido: parseBool(row['IA_ParaMatrizConRubrica_Corrido']),
      dpl_ia_matrizsinrubrica_corrido: parseBool(row['IA_ParaMatrizSinRubrica_Corrido']),
      dpl_ia_escala_corrido: parseBool(row['IA_ParaEscala_Corrido']),
      dpl_ia_lista_corrido: parseBool(row['IA_ParaLista_Corrido']),
      dpl_ia_sesiones_corrido: parseBool(row['IA_ParaSesiones_Corrido']),
      dpl_notif_consigna_enviada: parseBool(row['NotificacionConsignaEnviada']),
      dpl_notif_rubrica_enviada: parseBool(row['NotificacionRubricaEnviada']),
      dpl_notif_matrizsinrubrica_enviada: parseBool(row['NotificacionMatrizSinRubricaEnviada']),
      dpl_notif_escala_enviada: parseBool(row['NotificacionEscalaEnviada']),
      dpl_notif_lista_enviada: parseBool(row['NotificacionListaEnviada']),
    })
    cursoPatched++
  }
  console.log(`Patched ${cursoPatched} dpl_curso rows with extra columns.`)

  // ── Unidad: backfill "Logro específico" (shown read-only as "Logro a evaluar") ──
  // MAPEO_PROGRAMAS.csv repeats one row per Curso x Programa x Unidad, so the same
  // unidad's logro can appear many times — that's fine, we just patch it once per
  // ID_UNIDAD.
  const mapeoCsv = loadCsv('MAPEO_PROGRAMAS.csv')
  const logroByUnidadText = new Map()
  for (const row of mapeoCsv) {
    const logro = row['Logro específico de aprendizaje_S']
    if (row.ID_UNIDAD && logro && logro.trim() && !logroByUnidadText.has(row.ID_UNIDAD)) {
      logroByUnidadText.set(row.ID_UNIDAD, logro)
    }
  }
  let unidadPatched = 0
  for (const [idUnidadText, logro] of logroByUnidadText) {
    const unidadId = unidadIdByText.get(idUnidadText)
    if (!unidadId) continue
    await sbPatch('dpl_unidad', `dpl_unidadid=eq.${unidadId}`, { dpl_logroespecifico: logro })
    unidadPatched++
  }
  console.log(`Patched ${unidadPatched} dpl_unidad rows with dpl_logroespecifico.`)

  // ── Consigna: backfill "Instrumento" ────────────────────────────────────────
  const consignasIACsv = loadCsv('CONSOLIDADO_CONSIGNAS (1).csv')
  let consignaPatched = 0
  for (const row of consignasIACsv) {
    const consignaId = consignaIdByText.get(row.ID_CONSIGNA_TEXT)
    const instrumento = emptyToNull(row.INSTRUMENTO_ESCOGIDO)
    if (!consignaId || !instrumento) continue
    await sbPatch('dpl_consigna', `dpl_consignaid=eq.${consignaId}`, { dpl_instrumento: instrumento })
    consignaPatched++
  }
  console.log(`Patched ${consignaPatched} dpl_consigna rows with dpl_instrumento.`)

  console.log('Done.')
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
