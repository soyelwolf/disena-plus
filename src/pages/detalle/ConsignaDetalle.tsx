import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RichTextEditor from '../../components/RichTextEditor'
import {
  listConsignasBySesion,
  updateConsignaRichText,
  type ConsignaRichTextField,
} from '../../shared/services/consignaService'
import type { Consigna } from '../../types/consigna'
import { MOCK_CONSIGNAS, MOCK_CURSO_ID } from '../../shared/mockData'

type CampoRico = ConsignaRichTextField

const CAMPOS_RICOS: CampoRico[] = [
  'queSeEvaluara',
  'indicacionGeneral',
  'indicacionesEspecificas',
  'recomendaciones',
  'anexo',
]

export default function ConsignaDetalle() {
  const { cursoId, sesionId, elementoNombre } = useParams<{ cursoId: string; sesionId: string; elementoNombre?: string }>()
  const isMock = cursoId === MOCK_CURSO_ID

  const [consigna, setConsigna] = useState<Consigna | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!sesionId) return
    if (isMock) {
      setConsigna(MOCK_CONSIGNAS[sesionId] ?? null)
      setUsingMock(true)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const result = await listConsignasBySesion(sesionId, { includeRichText: true, pageSize: 1 })
      setConsigna(result.items[0] ?? null)
      setUsingMock(false)
    } catch {
      setConsigna(MOCK_CONSIGNAS[sesionId] ?? Object.values(MOCK_CONSIGNAS)[0] ?? null)
      setUsingMock(true)
    } finally {
      setIsLoading(false)
    }
  }, [sesionId, isMock])

  useEffect(() => {
    document.title = 'Consigna — Diseña+'
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const handleChange = (campo: CampoRico, html: string) => {
    setConsigna(prev => (prev ? { ...prev, [campo]: html } : prev))
  }

  const handleSave = async () => {
    if (!consigna) return
    if (usingMock) {
      setSavedAt(new Date().toLocaleString('es-PE'))
      return
    }
    setIsSaving(true)
    try {
      // Each rich text field is an independent column — save them in parallel.
      await Promise.all(CAMPOS_RICOS.map(campo => updateConsignaRichText(consigna.id, campo, consigna[campo])))
      setSavedAt(new Date().toLocaleString('es-PE'))
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <Link to={`/cursos/${cursoId}/consignas`} className="muted" style={{ fontSize: '0.85rem' }}>← Volver</Link>

      {isLoading && <p className="muted" style={{ marginTop: 'var(--space-3)' }}>Cargando…</p>}

      {!isLoading && !consigna && (
        <div className="card animate-in" style={{ padding: 'var(--space-5)', marginTop: 'var(--space-3)', textAlign: 'center' }}>
          <p className="muted">No se encontró una consigna para este elemento.</p>
        </div>
      )}

      {consigna && (
        <>
          <div className="row-between animate-in" style={{ margin: 'var(--space-3) 0 var(--space-4)' }}>
            <div>
              <h1 style={{ fontSize: '1.3rem' }}>Consigna para {elementoNombre ?? consigna.sesionNombre}</h1>
              <p className="mono muted" style={{ fontSize: '0.8rem' }}>{consigna.idConsignaText}</p>
            </div>
            {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
          </div>

          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <RichTextEditor label="Qué se evaluará" value={consigna.queSeEvaluara} onChange={html => handleChange('queSeEvaluara', html)} />
            </div>
            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <RichTextEditor label="Indicación General" value={consigna.indicacionGeneral} onChange={html => handleChange('indicacionGeneral', html)} minHeight={160} />
            </div>
            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <RichTextEditor label="Indicaciones Específicas" value={consigna.indicacionesEspecificas} onChange={html => handleChange('indicacionesEspecificas', html)} minHeight={160} />
            </div>
            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <RichTextEditor label="Recomendaciones" value={consigna.recomendaciones} onChange={html => handleChange('recomendaciones', html)} />
            </div>
            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <RichTextEditor label="Anexo" value={consigna.anexo} onChange={html => handleChange('anexo', html)} />
            </div>
          </div>

          <div className="row-between animate-in" style={{ marginTop: 'var(--space-4)' }}>
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              {savedAt ? `Último guardado: ${savedAt}` : `Registrado por ${consigna.usuarioRegistro || 'ProAc'}`}
            </p>
            <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
              {isSaving ? 'Guardando…' : '💾 Guardar'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
