// "Propuesta IA vs versión final": what the teacher kept, added and removed
// from the initial IA proposal (BACKUP lists), field by field.

import { useEffect, useState } from 'react'
import { comparar } from '../shared/diferencias'
import { textoPlano } from '../shared/textoRico'
import Icon from './Icon'

export interface CampoComparado {
  label: string
  ia: string | null | undefined
  final: string | null | undefined
}

export interface SeccionComparada {
  titulo: string
  /** e.g. "Criterio agregado por el docente". */
  nota?: string
  campos: CampoComparado[]
}

export default function ComparadorIA(props: {
  open: boolean
  onClose: () => void
  titulo: string
  detalle: string
  secciones: SeccionComparada[]
}) {
  const { open, onClose, titulo, detalle, secciones } = props
  const [ladoALado, setLadoALado] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null

  // Overall change, weighted by the length of each field.
  let pesos = 0
  let cambios = 0
  for (const s of secciones)
    for (const c of s.campos) {
      const largo = Math.max(textoPlano(c.ia ?? '').split(/\s+/).filter(Boolean).length, textoPlano(c.final ?? '').split(/\s+/).filter(Boolean).length)
      pesos += largo
      cambios += (comparar(c.ia, c.final).cambio * largo) / 100
    }
  const total = pesos ? Math.round((cambios / pesos) * 100) : 0

  return (
    <div className="overlay overlay-drawer" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className="drawer drawer-ancho" role="dialog" aria-modal="true" aria-label={titulo}>
        <div className="drawer-head">
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700 }}>{titulo}</h2>
            <p style={{ fontSize: 13, color: 'var(--color-text-muted)', marginTop: 2 }}>{detalle}</p>
          </div>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}><Icon name="close" size={22} /></button>
        </div>
        <div className="drawer-body">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <b>Cambio total respecto a la propuesta IA:</b>
              <span className={`regla-chip ${total === 0 ? 'ok' : 'mal'}`}>{total}%</span>
            </span>
            <label className="radio" style={{ fontSize: 13 }}>
              <input type="checkbox" checked={ladoALado} onChange={e => setLadoALado(e.target.checked)} />Ver lado a lado
            </label>
          </div>
          <div className="diff-leyenda">
            <span><span className="diff-quitado">texto</span> quitado de la propuesta IA</span>
            <span><span className="diff-agregado">texto</span> agregado por el docente</span>
          </div>
          {secciones.map(s => (
            <section key={s.titulo} className="diff-seccion">
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>{s.titulo}</h3>
              {s.nota && <p className="diff-nota">{s.nota}</p>}
              {s.campos.map((c, k) => {
                const r = comparar(c.ia, c.final)
                return (
                  // Position as key: labels can repeat (a scale without type has three "Por defecto").
                  <div key={k} className="diff-campo">
                    <div className="row-between">
                      <span className="field-label" style={{ marginBottom: 0 }}>{c.label}</span>
                      <span className={`regla-chip ${r.identico ? 'ok' : 'mal'}`}>{r.identico ? 'Sin cambios' : `Cambió ${r.cambio}%`}</span>
                    </div>
                    {ladoALado ? (
                      <div className="diff-lados">
                        <div><small>Propuesta IA</small><p>{textoPlano(c.ia ?? '') || '—'}</p></div>
                        <div><small>Versión final</small><p>{textoPlano(c.final ?? '') || '—'}</p></div>
                      </div>
                    ) : (
                      <p className="diff-texto">
                        {r.tramos.length === 0
                          ? '—'
                          : r.tramos.map((t, i) => (
                              <span key={i} className={t.tipo === 'igual' ? undefined : t.tipo === 'agregado' ? 'diff-agregado' : 'diff-quitado'}>
                                {t.texto}{' '}
                              </span>
                            ))}
                      </p>
                    )}
                  </div>
                )
              })}
            </section>
          ))}
        </div>
        <div className="drawer-foot"><button className="btn btn-primary" onClick={onClose}>Cerrar</button></div>
      </aside>
    </div>
  )
}
