// "Datos adjuntos" of a consigna: the teacher attaches Word/PDF/… files; PDFs
// open in the viewer, everything can be downloaded. Files live in the Storage
// bucket "adjuntos" under consigna/<consignaId>/.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { supabase } from '../shared/supabaseClient'
import Icon from './Icon'
import VisorPdf from './VisorPdf'
import { Modal, useToast } from './ui'

const BUCKET = 'adjuntos'
const MAX_MB = 20
const ACEPTADOS = '.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.png,.jpg,.jpeg,.txt'

interface Archivo {
  ruta: string
  nombre: string
  url: string
  tamano: number | null
  fecha: string | null
}

/** Stored as "<timestamp>__<original name>" so two uploads never collide. */
const nombreVisible = (n: string) => n.replace(/^\d{10,}__/, '')
const limpio = (n: string) => n.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '_').trim()
const tamanoTexto = (b: number | null) => (b === null ? '' : b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)
const esPdf = (n: string) => /\.pdf$/i.test(n)

export default function DatosAdjuntos({ consignaId, editable, titulo, accion }: { consignaId: string | null; editable: boolean; titulo: string; accion?: ReactNode }) {
  const toast = useToast()
  const [archivos, setArchivos] = useState<Archivo[] | null>(null)
  const [subiendo, setSubiendo] = useState(false)
  const [quitar, setQuitar] = useState<Archivo | null>(null)
  const [ver, setVer] = useState<Archivo | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const carpeta = consignaId ? `consigna/${consignaId}` : null

  const cargar = useCallback(async () => {
    if (!carpeta) return setArchivos([])
    const { data, error } = await supabase.storage.from(BUCKET).list(carpeta, { limit: 200, sortBy: { column: 'created_at', order: 'asc' } })
    if (error) return setArchivos([])
    setArchivos(
      (data ?? [])
        .filter(f => f.id)
        .map(f => {
          const ruta = `${carpeta}/${f.name}`
          const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(ruta)
          return { ruta, nombre: nombreVisible(f.name), url: pub.publicUrl, tamano: (f.metadata as { size?: number } | null)?.size ?? null, fecha: f.created_at ?? null }
        }),
    )
  }, [carpeta])
  useEffect(() => {
    cargar()
  }, [cargar])

  const subir = async (lista: FileList | null) => {
    if (!lista?.length || !carpeta) return
    setSubiendo(true)
    try {
      for (const f of Array.from(lista)) {
        if (f.size > MAX_MB * 1024 * 1024) throw new Error(`"${f.name}" pesa más de ${MAX_MB} MB.`)
        const { error } = await supabase.storage.from(BUCKET).upload(`${carpeta}/${Date.now()}__${limpio(f.name)}`, f, { contentType: f.type || undefined })
        if (error) throw new Error(error.message)
      }
      toast(lista.length > 1 ? 'Se adjuntaron los archivos' : 'Se adjuntó el archivo')
      await cargar()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo adjuntar.', 'error')
    } finally {
      setSubiendo(false)
    }
  }

  const descargar = async (a: Archivo) => {
    try {
      const r = await fetch(a.url)
      const blob = await r.blob()
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = a.nombre
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      toast('No se pudo descargar.', 'error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="row-between">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span className="field-label" style={{ marginBottom: 0 }}>Datos adjuntos</span>{accion}</span>
        {editable && carpeta && (
          <>
            <input ref={input} type="file" multiple accept={ACEPTADOS} className="sr-only" onChange={e => { subir(e.target.files); e.target.value = '' }} />
            <button className="btn btn-outline btn-sm" disabled={subiendo} onClick={() => input.current?.click()}>
              <Icon name="upload" size={15} />{subiendo ? 'Adjuntando…' : 'Adjuntar archivo'}
            </button>
          </>
        )}
      </div>
      {!carpeta ? (
        <p className="adjuntos-vacio">Podrás adjuntar archivos cuando la consigna esté guardada.</p>
      ) : archivos === null ? (
        <p className="adjuntos-vacio">Cargando…</p>
      ) : archivos.length === 0 ? (
        <p className="adjuntos-vacio">{editable ? 'Sin archivos. Puedes adjuntar Word, PDF, Excel, PowerPoint o imágenes (hasta 20 MB).' : 'Sin archivos adjuntos.'}</p>
      ) : (
        <div className="adjuntos-lista">
          {archivos.map(a => (
            <div key={a.ruta} className="adjunto">
              <span className="adjunto-icono"><Icon name="pdf" size={18} /></span>
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                <span className="adjunto-nombre" title={a.nombre}>{a.nombre}</span>
                <small>{[tamanoTexto(a.tamano), a.fecha ? new Date(a.fecha).toLocaleDateString('es-PE') : ''].filter(Boolean).join(' · ')}</small>
              </span>
              {esPdf(a.nombre) && <button className="link-btn" onClick={() => setVer(a)}>Ver</button>}
              <button className="icon-btn" aria-label={`Descargar ${a.nombre}`} title="Descargar" onClick={() => descargar(a)}><Icon name="download" size={17} /></button>
              {editable && <button className="icon-btn" aria-label={`Quitar ${a.nombre}`} title="Quitar" onClick={() => setQuitar(a)}><Icon name="trash" size={17} /></button>}
            </div>
          ))}
        </div>
      )}
      <Modal
        open={!!quitar}
        title="¿Quitar archivo adjunto?"
        onClose={() => setQuitar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitar(null)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                const a = quitar
                setQuitar(null)
                if (!a) return
                const { error } = await supabase.storage.from(BUCKET).remove([a.ruta])
                if (error) toast(error.message, 'error')
                else {
                  toast('Archivo quitado')
                  cargar()
                }
              }}
            >
              Sí, quitar
            </button>
          </>
        }
      >
        {quitar?.nombre}
      </Modal>
      {ver && <VisorPdf titulo={`${ver.nombre} · ${titulo}`} url={ver.url} nombreArchivo={ver.nombre} onClose={() => setVer(null)} />}
    </div>
  )
}
