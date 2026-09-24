// Full-screen PDF viewer window with download / open-in-new-tab.

import { useEffect, useState } from 'react'
import Icon from './Icon'
import { useToast } from './ui'

interface Props {
  titulo: string
  url: string
  nombreArchivo: string
  onClose: () => void
}

export default function VisorPdf({ titulo, url, nombreArchivo, onClose }: Props) {
  const toast = useToast()
  const [descargando, setDescargando] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Fetch + blob so the file downloads with a readable name instead of opening.
  const descargar = async () => {
    setDescargando(true)
    try {
      const r = await fetch(url)
      if (!r.ok) throw new Error()
      const blob = await r.blob()
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = nombreArchivo
      a.click()
      URL.revokeObjectURL(a.href)
    } catch {
      toast('No se pudo descargar el archivo.', 'error')
    } finally {
      setDescargando(false)
    }
  }

  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="visor" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="visor-head">
          <h2 style={{ fontSize: 17, fontWeight: 700, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</h2>
          <button className="btn btn-outline" style={{ height: 38 }} onClick={descargar} disabled={descargando}>
            <Icon name="download" size={16} />{descargando ? 'Descargando…' : 'Descargar'}
          </button>
          <a className="btn btn-outline" style={{ height: 38 }} href={url} target="_blank" rel="noreferrer">
            Abrir en otra pestaña
          </a>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={22} /></button>
        </div>
        <iframe className="visor-pdf" src={url} title={titulo} />
      </div>
    </div>
  )
}
