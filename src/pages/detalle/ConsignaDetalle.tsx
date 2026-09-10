import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import RichTextEditor from '../../components/RichTextEditor'
import GenerarIABoton from '../../components/GenerarIABoton'
import AdjuntosPanel from '../../components/AdjuntosPanel'
import {
  listConsignasBySesion,
  updateConsigna,
  updateConsignaRichText,
  type ConsignaRichTextField,
} from '../../shared/services/consignaService'
import { getSesionById } from '../../shared/services/sesionService'
import type { Consigna } from '../../types/consigna'
import { MOCK_CONSIGNAS, MOCK_CURSO_ID, MOCK_LOGRO_ESPECIFICO } from '../../shared/mockData'

type CampoRico = ConsignaRichTextField

const CAMPOS_RICOS: CampoRico[] = [
  'indicacionGeneral',
  'indicacionesEspecificas',
  'recomendaciones',
  'anexo',
]

const INSTRUMENTO_OPTIONS = [
  'rúbrica',
  'matriz con rúbrica',
  'matriz sin rúbrica',
  'lista de cotejo',
  'escala de valoración',
  'escala de valoración (administración)',
]

export default function ConsignaDetalle() {
  const { cursoId, sesionId, elementoNombre } = useParams<{ cursoId: string; sesionId: string; elementoNombre?: string }>()
  const isMock = cursoId === MOCK_CURSO_ID

  const [consigna, setConsigna] = useState<Consigna | null>(null)
  const [logroEspecifico, setLogroEspecifico] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [usingMock, setUsingMock] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!sesionId) return
    if (isMock) {
      setConsigna(MOCK_CONSIGNAS[sesionId] ?? null)
      setLogroEspecifico(MOCK_LOGRO_ESPECIFICO[sesionId] ?? '')
      setUsingMock(true)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    try {
      const [result, sesion] = await Promise.all([
        listConsignasBySesion(sesionId, { includeRichText: true, pageSize: 1 }),
        getSesionById(sesionId, { includeUnidad: true }),
      ])
      setConsigna(result.items[0] ?? null)
      setLogroEspecifico(sesion?.unidad?.logroEspecifico ?? '')
      setUsingMock(false)
    } catch {
      setConsigna(MOCK_CONSIGNAS[sesionId] ?? Object.values(MOCK_CONSIGNAS)[0] ?? null)
      setLogroEspecifico(MOCK_LOGRO_ESPECIFICO[sesionId] ?? '')
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

  const handleInstrumentoChange = (instrumento: string) => {
    setConsigna(prev => (prev ? { ...prev, instrumento } : prev))
  }

  const handleSave = async () => {
    if (!consigna) return
    if (usingMock) {
      setSavedAt(new Date().toLocaleString('es-PE'))
      return
    }
    setIsSaving(true)
    try {
      await Promise.all([
        ...CAMPOS_RICOS.map(campo => updateConsignaRichText(consigna.id, campo, consigna[campo])),
        updateConsigna(consigna.id, { instrumento: consigna.instrumento }),
      ])
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
            <div className="row" style={{ gap: 'var(--space-2)', alignItems: 'center' }}>
              {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
              <GenerarIABoton />
            </div>
          </div>

          <div className="stack" style={{ gap: 'var(--space-4)' }}>
            {logroEspecifico && (
              <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
                <p style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Logro a evaluar</p>
                <p className="muted" style={{ fontSize: '0.9rem' }}>{logroEspecifico}</p>
              </div>
            )}

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
              <label htmlFor="instrumento" style={{ display: 'block', fontWeight: 700, marginBottom: 'var(--space-2)' }}>
                Instrumento
              </label>
              <select
                id="instrumento"
                value={consigna.instrumento}
                onChange={e => handleInstrumentoChange(e.target.value)}
                style={{
                  width: '100%',
                  padding: 'var(--space-2) var(--space-3)',
                  borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--color-border)',
                  fontFamily: 'var(--font-body)',
                  fontSize: '0.95rem',
                }}
              >
                <option value="">— Sin asignar —</option>
                {INSTRUMENTO_OPTIONS.map(opt => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            </div>

            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <RichTextEditor label="Anexo (Opcional)" value={consigna.anexo} onChange={html => handleChange('anexo', html)} />
            </div>

            <div className="card animate-in" style={{ padding: 'var(--space-4)' }}>
              <p style={{ fontWeight: 700, marginBottom: 'var(--space-2)' }}>Datos adjuntos</p>
              <AdjuntosPanel carpeta={`consigna/${consigna.id}`} disabled={usingMock} />
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
