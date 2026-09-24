// src/shared/documentosCurso.ts
// Course PDFs (sílabo and formato de orientación) kept in the Supabase Storage
// bucket "adjuntos" under cursos/<cursoId>-<tipo>.pdf — one flat folder, so a
// single listing tells which courses have which document.

import { supabase } from './supabaseClient'

const BUCKET = 'adjuntos'
const CARPETA = 'cursos'
const MAX_MB = 20

export type TipoDocumento = 'silabo' | 'formato'

export const DOCUMENTOS: Record<TipoDocumento, { label: string; archivo: string }> = {
  silabo: { label: 'Sílabo', archivo: 'silabo' },
  formato: { label: 'Formato de orientación', archivo: 'formato-orientacion' },
}

export interface DocumentoCurso {
  cursoId: string
  tipo: TipoDocumento
  url: string
  actualizado: string | null
  tamano: number | null
}

const ruta = (cursoId: string, tipo: TipoDocumento) => `${CARPETA}/${cursoId}-${DOCUMENTOS[tipo].archivo}.pdf`

/** Every course document, keyed by `${cursoId}|${tipo}`. */
export async function listarDocumentos(): Promise<Map<string, DocumentoCurso>> {
  const { data, error } = await supabase.storage.from(BUCKET).list(CARPETA, { limit: 10000 })
  if (error) throw new Error(error.message)
  const docs = new Map<string, DocumentoCurso>()
  for (const f of data ?? []) {
    const m = /^(.+)-(silabo|formato-orientacion)\.pdf$/.exec(f.name)
    if (!m) continue
    const tipo: TipoDocumento = m[2] === 'silabo' ? 'silabo' : 'formato'
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(`${CARPETA}/${f.name}`)
    const version = f.updated_at ? `?v=${encodeURIComponent(f.updated_at)}` : ''
    docs.set(`${m[1]}|${tipo}`, {
      cursoId: m[1],
      tipo,
      url: pub.publicUrl + version,
      actualizado: f.updated_at ?? null,
      tamano: (f.metadata as { size?: number } | null)?.size ?? null,
    })
  }
  return docs
}

export async function subirDocumento(cursoId: string, tipo: TipoDocumento, archivo: File): Promise<void> {
  const esPdf = archivo.type === 'application/pdf' || /\.pdf$/i.test(archivo.name)
  if (!esPdf) throw new Error('El archivo debe ser un PDF.')
  if (archivo.size > MAX_MB * 1024 * 1024) throw new Error(`El PDF no puede pesar más de ${MAX_MB} MB.`)
  const { error } = await supabase.storage.from(BUCKET).upload(ruta(cursoId, tipo), archivo, {
    upsert: true,
    contentType: 'application/pdf',
    cacheControl: '60',
  })
  if (error) throw new Error(error.message)
}

export async function quitarDocumento(cursoId: string, tipo: TipoDocumento): Promise<void> {
  const { error } = await supabase.storage.from(BUCKET).remove([ruta(cursoId, tipo)])
  if (error) throw new Error(error.message)
}

/** Friendly download name, e.g. "Silabo - Gestion I.pdf". */
export function nombreDescarga(tipo: TipoDocumento, curso: string): string {
  const base = `${DOCUMENTOS[tipo].label} - ${curso}`.replace(/[\\/:*?"<>|]+/g, ' ').trim()
  return `${base}.pdf`
}
