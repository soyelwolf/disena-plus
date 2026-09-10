import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../shared/supabaseClient'

const BUCKET = 'adjuntos'

interface ArchivoAdjunto {
  name: string
  url: string
}

export default function AdjuntosPanel({ carpeta, disabled }: { carpeta: string; disabled?: boolean }) {
  const [archivos, setArchivos] = useState<ArchivoAdjunto[]>([])
  const [isLoading, setIsLoading] = useState(!disabled)
  const [isUploading, setIsUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    if (disabled) return
    setIsLoading(true)
    try {
      const { data, error } = await supabase.storage.from(BUCKET).list(carpeta)
      if (error) throw error
      const files = (data ?? []).filter(f => f.id) // folders have no id
      setArchivos(
        files.map(f => ({
          name: f.name,
          url: supabase.storage.from(BUCKET).getPublicUrl(`${carpeta}/${f.name}`).data.publicUrl,
        })),
      )
      setError(null)
    } catch {
      // Storage not reachable/configured yet (e.g. local demo mode) — show empty state quietly.
      setArchivos([])
    } finally {
      setIsLoading(false)
    }
  }, [carpeta, disabled])

  useEffect(() => {
    void load()
  }, [load])

  const handleUploadClick = () => {
    if (disabled) return
    fileInputRef.current?.click()
  }

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    setIsUploading(true)
    setError(null)
    try {
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(`${carpeta}/${file.name}`, file, { upsert: true })
      if (error) throw error
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo adjuntar el archivo.')
    } finally {
      setIsUploading(false)
    }
  }

  const handleDelete = async (name: string) => {
    setError(null)
    try {
      const { error } = await supabase.storage.from(BUCKET).remove([`${carpeta}/${name}`])
      if (error) throw error
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar el archivo.')
    }
  }

  return (
    <div>
      {isLoading ? (
        <p className="muted" style={{ fontSize: '0.85rem' }}>Cargando…</p>
      ) : archivos.length === 0 ? (
        <p className="muted" style={{ fontSize: '0.85rem' }}>No hay nada adjunto.</p>
      ) : (
        <ul style={{ margin: 0, paddingLeft: 'var(--space-4)', fontSize: '0.85rem' }}>
          {archivos.map(a => (
            <li key={a.name} style={{ marginBottom: 'var(--space-1)' }}>
              <a href={a.url} target="_blank" rel="noreferrer">{a.name}</a>{' '}
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                style={{ padding: '0 var(--space-1)', fontSize: '0.75rem' }}
                onClick={() => handleDelete(a.name)}
                disabled={disabled}
              >
                Quitar
              </button>
            </li>
          ))}
        </ul>
      )}

      <button
        type="button"
        onClick={handleUploadClick}
        disabled={disabled || isUploading}
        style={{
          background: 'none',
          border: 'none',
          padding: 0,
          marginTop: 'var(--space-2)',
          color: 'var(--color-primary)',
          fontSize: '0.85rem',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textDecoration: 'underline',
        }}
      >
        📎 {isUploading ? 'Adjuntando…' : 'Adjuntar un archivo'}
      </button>
      <input ref={fileInputRef} type="file" hidden onChange={handleFileSelected} />

      {error && <p style={{ color: 'var(--color-danger)', fontSize: '0.8rem', marginTop: 'var(--space-1)' }}>{error}</p>}
    </div>
  )
}
