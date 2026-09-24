#!/usr/bin/env node
// scripts/completar-unidades-sesiones.cjs
// Completes dpl_unidad and dpl_sesion with every row and column of the
// SharePoint lists UNIDADES_CURSOS_IA and SESIONES_CURSOS_IA (extracted into
// importacion/unidades.json and importacion/sesiones.json).
//
// - Existing rows are updated (matched by ID_UNIDAD, and by unit + ID_SESION);
//   missing ones are created. Nothing is deleted.
// - Values already typed in Diseña+ (logro, título, elemento) are kept; only
//   empty ones are filled from SharePoint.
// - Requires supabase/schema-unidades-sesiones.sql to have been run.
//
// Usage:  node scripts/completar-unidades-sesiones.cjs

const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const env = Object.fromEntries(
  fs
    .readFileSync(path.join(ROOT, '.env.local'), 'utf8')
    .split(/\r?\n/)
    .filter(l => l.includes('='))
    .map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()]),
)
const URL_BASE = `${env.VITE_SUPABASE_URL}/rest/v1/`
const HEADERS = {
  apikey: env.VITE_SUPABASE_ANON_KEY,
  Authorization: `Bearer ${env.VITE_SUPABASE_ANON_KEY}`,
  'Content-Type': 'application/json',
}

async function api(metodo, ruta, cuerpo, extra = {}) {
  const r = await fetch(URL_BASE + ruta, { method: metodo, headers: { ...HEADERS, ...extra }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${metodo} ${ruta.slice(0, 80)} → ${r.status} ${texto}`)
  return texto ? JSON.parse(texto) : null
}

const txt = v => (v === undefined || v === null || String(v).trim() === '' ? null : String(v).trim())
const entero = v => {
  const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(n) ? n : null
}
const numero = v => {
  const n = parseFloat(String(v ?? '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}
const si = v => /^(1|true|verdadero|s[ií])$/i.test(String(v ?? '').trim())
/** Only fill a value that is empty in the database. */
const siVacio = (actual, nuevo) => (actual === null || actual === undefined || String(actual).trim() === '' ? nuevo : actual)

async function main() {
  const unidadesSp = JSON.parse(fs.readFileSync(path.join(ROOT, 'importacion/unidades.json'), 'utf8'))
  const sesionesSp = JSON.parse(fs.readFileSync(path.join(ROOT, 'importacion/sesiones.json'), 'utf8'))

  const cursos = await api('GET', 'dpl_curso?select=dpl_cursoid,dpl_idcursotext')
  const cursoPorTexto = new Map(cursos.map(c => [c.dpl_idcursotext, c.dpl_cursoid]))

  // ── Unidades ──
  const unidadesDb = await api('GET', 'dpl_unidad?select=*&limit=10000')
  const unidadPorTexto = new Map(unidadesDb.map(u => [u.dpl_idunidadtext, u]))
  let uAct = 0, uNew = 0, uSinCurso = 0
  for (const r of unidadesSp) {
    const cursoId = cursoPorTexto.get(r.ID_CURSO)
    if (!cursoId) { uSinCurso++; continue }
    const actual = unidadPorTexto.get(r.ID_UNIDAD)
    const fila = {
      dpl_cursoid: cursoId,
      dpl_idunidadtext: r.ID_UNIDAD,
      dpl_numerounidad: siVacio(actual?.dpl_numerounidad, entero(r['Unidad_S'])),
      dpl_nombreunidad: siVacio(actual?.dpl_nombreunidad, txt(r['Título de unidad_S'])),
      dpl_logroespecifico: siVacio(actual?.dpl_logroespecifico, txt(r['Logro específico de aprendizaje_S'])),
      dpl_temasesiones: txt(r['Tema sesión X Unidad_S']),
      dpl_elementoasignado: txt(r['ElementoAsignado']),
      dpl_nivelcomplejidad: txt(r['Nivel de Complejidad']) ?? txt(r['NIVEL_COMPLEJIDAD_TEXT']),
      dpl_queseevaluar: txt(r['¿Qué se debe evaluar en la actividad?']),
      dpl_instrumentoevaluacion: txt(r['¿Qué instrumento (s) de evaluación se empleará?']) ?? txt(r['¿Qué instrumento (s) de evaluación se empleará?_TEXT']),
      dpl_elementocatalogo: txt(r['Elemento_Catalogo']) ?? txt(r['Elemento']),
      dpl_elementocatalogoabreviatura: txt(r['Elemento_Catalogo: ABREVIATURA']),
      dpl_elementocatalogodescripcion: txt(r['Elemento_Catalogo: DESCRIPCIÓN']) ?? txt(r['Descripción']),
      dpl_realizado: si(r['Realizado']),
    }
    if (actual) {
      await api('PATCH', `dpl_unidad?dpl_unidadid=eq.${actual.dpl_unidadid}`, fila, { Prefer: 'return=minimal' })
      uAct++
    } else {
      const [nueva] = await api('POST', 'dpl_unidad', fila, { Prefer: 'return=representation' })
      unidadPorTexto.set(r.ID_UNIDAD, nueva)
      uNew++
    }
  }
  console.log(`Unidades: ${uAct} actualizadas, ${uNew} creadas${uSinCurso ? `, ${uSinCurso} omitidas (curso no existe)` : ''}.`)

  // ── Sesiones ──
  const sesionesDb = await api('GET', 'dpl_sesion?select=*&limit=10000')
  const claveSesion = (unidadId, idSesion) => `${unidadId}|${idSesion}`
  const sesionPorClave = new Map(sesionesDb.map(s => [claveSesion(s.dpl_unidadid, s.dpl_idsesiontext), s]))
  let sAct = 0, sNew = 0, sSinUnidad = 0
  for (const r of sesionesSp) {
    const unidad = unidadPorTexto.get(r.ID_UNIDAD) ?? unidadPorTexto.get(r.ID_UNIDAD_TXT)
    if (!unidad) { sSinUnidad++; continue }
    const idSesion = r.ID_SESION || r.ID_SESION_TXT
    const actual = sesionPorClave.get(claveSesion(unidad.dpl_unidadid, idSesion))
    const elemento = txt(r['ElementoAsignado'])
    const fila = {
      dpl_unidadid: unidad.dpl_unidadid,
      dpl_idsesiontext: idSesion,
      dpl_elemento: siVacio(actual?.dpl_elemento, elemento),
      dpl_abreviatura: siVacio(actual?.dpl_abreviatura, txt(r['Abreviatura_E'])),
      dpl_tema: siVacio(actual?.dpl_tema, txt(r['Tema sesión_S'])),
      dpl_herramientaia: txt(r['HERRAMIENTA_IA']),
      dpl_semana: entero(r['Semana_S']),
      dpl_numerosesion: entero(r['Sesión_S']),
      dpl_tiemposesionmin: entero(r['TIEMPO_SESION_MIN']),
      dpl_actividad: txt(r['Actividad/ Observación_S']),
      dpl_observacion: txt(r['Observación_E']),
      dpl_peso: numero(r['Peso_E']),
      dpl_tipoobservacion: txt(r['TIPO Observación_E']),
      dpl_tieneelemento: !!(elemento || actual?.dpl_elemento),
      dpl_realizado: si(r['RealizadoSesiones']),
    }
    if (actual) {
      await api('PATCH', `dpl_sesion?dpl_sesionid=eq.${actual.dpl_sesionid}`, fila, { Prefer: 'return=minimal' })
      sAct++
    } else {
      await api('POST', 'dpl_sesion', fila, { Prefer: 'return=minimal' })
      sNew++
    }
  }
  // Sessions that already existed as evaluation elements keep that flag.
  await api('PATCH', 'dpl_sesion?dpl_elemento=not.is.null&dpl_tieneelemento=is.false', { dpl_tieneelemento: true }, { Prefer: 'return=minimal' })
  console.log(`Sesiones: ${sAct} actualizadas, ${sNew} creadas${sSinUnidad ? `, ${sSinUnidad} omitidas (unidad no existe)` : ''}.`)
  console.log('Listo.')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
