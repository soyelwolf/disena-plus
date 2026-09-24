#!/usr/bin/env node
// scripts/importar-usuarios.cjs
// One-time import of people, their course assignments and the existing
// approvals from the SharePoint list LISTADO_CURSOS_PARA_IA (already extracted
// into importacion/asignaciones.json and importacion/aprobaciones.json, which
// are gitignored because they contain names).
//
// SharePoint stores people by NAME, so users are created without email; the
// administrator completes each email in Diseña+ → Centro de datos → Usuarios.
// Safe to re-run: existing users/assignments are reused, not duplicated.
//
// Requires supabase/schema-flujo.sql to have been run (dpl_usuario,
// dpl_cursoasignacion, dpl_procesocurso, dpl_procesoevento).
//
// Usage:  node scripts/importar-usuarios.cjs

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

/** Known emails (everyone else is completed from the Centro de datos). */
const CORREOS = { 'fernando yonathan bustamante mattos': 'fbustamant@utp.edu.pe' }
const ADMINS = new Set(['fbustamant@utp.edu.pe'])

async function api(metodo, ruta, cuerpo, extra = {}) {
  const r = await fetch(URL_BASE + ruta, { method: metodo, headers: { ...HEADERS, ...extra }, body: cuerpo ? JSON.stringify(cuerpo) : undefined })
  const texto = await r.text()
  if (!r.ok) throw new Error(`${metodo} ${ruta} → ${r.status} ${texto}`)
  return texto ? JSON.parse(texto) : null
}

const clave = s => s.normalize('NFC').trim().toLowerCase()

async function main() {
  const asignaciones = JSON.parse(fs.readFileSync(path.join(ROOT, 'importacion/asignaciones.json'), 'utf8'))
  const aprobaciones = JSON.parse(fs.readFileSync(path.join(ROOT, 'importacion/aprobaciones.json'), 'utf8'))

  const cursos = await api('GET', 'dpl_curso?select=dpl_cursoid,dpl_idcursotext')
  const cursoPorTexto = new Map(cursos.map(c => [c.dpl_idcursotext, c.dpl_cursoid]))

  // ── Users ──
  const personas = new Map()
  for (const a of asignaciones) {
    const k = clave(a.nombre)
    const p = personas.get(k) ?? { nombre: a.nombre.trim(), roles: new Set() }
    p.roles.add(a.rol)
    personas.set(k, p)
  }
  const existentes = await api('GET', 'dpl_usuario?select=dpl_usuarioid,dpl_nombre,dpl_correo,dpl_roles')
  const idPorNombre = new Map(existentes.map(u => [clave(u.dpl_nombre), u]))
  let creados = 0
  for (const [k, p] of personas) {
    const correo = CORREOS[k] ?? null
    const roles = [...p.roles]
    if (correo && ADMINS.has(correo)) roles.unshift('administrador')
    const actual = idPorNombre.get(k)
    if (actual) {
      const union = [...new Set([...(actual.dpl_roles ?? []), ...roles])]
      await api('PATCH', `dpl_usuario?dpl_usuarioid=eq.${actual.dpl_usuarioid}`, {
        dpl_roles: union,
        ...(actual.dpl_correo ? {} : correo ? { dpl_correo: correo } : {}),
      })
    } else {
      const [nuevo] = await api('POST', 'dpl_usuario', { dpl_nombre: p.nombre, dpl_correo: correo, dpl_roles: roles }, { Prefer: 'return=representation' })
      idPorNombre.set(k, nuevo)
      creados++
    }
  }
  console.log(`Usuarios: ${creados} creados, ${personas.size - creados} ya existían.`)

  // ── Assignments ──
  const filas = []
  let sinCurso = 0
  for (const a of asignaciones) {
    const cursoId = cursoPorTexto.get(a.curso)
    if (!cursoId) {
      sinCurso++
      continue
    }
    filas.push({ dpl_cursoid: cursoId, dpl_usuarioid: idPorNombre.get(clave(a.nombre)).dpl_usuarioid, dpl_rol: a.rol })
  }
  const unicas = [...new Map(filas.map(f => [`${f.dpl_cursoid}|${f.dpl_usuarioid}|${f.dpl_rol}`, f])).values()]
  if (unicas.length) {
    await api('POST', 'dpl_cursoasignacion?on_conflict=dpl_cursoid,dpl_usuarioid,dpl_rol', unicas, {
      Prefer: 'resolution=ignore-duplicates,return=minimal',
    })
  }
  console.log(`Asignaciones: ${unicas.length} cargadas${sinCurso ? `, ${sinCurso} omitidas (curso no existe en la base)` : ''}.`)

  // ── Existing approvals → process state + history ──
  for (const a of aprobaciones) {
    const cursoId = cursoPorTexto.get(a.curso)
    if (!cursoId) continue
    const estado = a.dda ? 'aprobado' : a.dci ? 'revision_dda' : 'en_edicion'
    await api(
      'POST',
      'dpl_procesocurso?on_conflict=dpl_cursoid,dpl_proceso',
      { dpl_cursoid: cursoId, dpl_proceso: 'contenido_academico', dpl_estado: estado, dpl_consignas_finalizado: true, dpl_rubricas_finalizado: true },
      { Prefer: 'resolution=merge-duplicates,return=minimal' },
    )
    const ya = await api('GET', `dpl_procesoevento?select=dpl_procesoeventoid&dpl_cursoid=eq.${cursoId}&dpl_accion=eq.aprobado`)
    if (ya.length) continue
    const eventos = []
    const fecha = f => (f && !Number.isNaN(Date.parse(f)) ? new Date(f).toISOString() : new Date().toISOString())
    if (a.dci) eventos.push({ dpl_cursoid: cursoId, dpl_accion: 'aprobado', dpl_rol: 'monitor_ea', dpl_usuario: a.dciAprobador ?? 'SharePoint', dpl_comentario: 'Importado de SharePoint', createdon: fecha(a.dciFecha) })
    if (a.dda) eventos.push({ dpl_cursoid: cursoId, dpl_accion: 'aprobado', dpl_rol: 'dda', dpl_usuario: a.ddaAprobador ?? 'SharePoint', dpl_comentario: 'Importado de SharePoint', createdon: fecha(a.ddaFecha) })
    if (eventos.length) await api('POST', 'dpl_procesoevento', eventos, { Prefer: 'return=minimal' })
    console.log(`Aprobación ${a.curso}: ${estado}`)
  }
  console.log('Listo. Completa los correos en Diseña+ → Centro de datos → Usuarios.')
}

main().catch(err => {
  console.error('Error:', err.message)
  process.exit(1)
})
