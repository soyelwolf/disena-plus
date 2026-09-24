// "Aprobaciones" side panel: who approved what and when (Monitor EA → DDA),
// plus the approvers' actions for the current state.

import { useState } from 'react'
import { useAuth } from '../shared/AuthContext'
import {
  ESTADO_LABEL,
  aprobarProceso,
  devolverProceso,
  habilitarEdicion,
  type EventoProceso,
  type ProcesoCurso,
} from '../shared/academico'
import Icon from './Icon'
import { Drawer, useToast } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  cursoId: string
  proceso: ProcesoCurso
  onCambio: () => void
}

const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' })
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })

/** The last approval by `rol` in the current round (after the latest reopening / return). */
function aprobacionVigente(eventos: EventoProceso[], rol: string): EventoProceso | null {
  let ultima: EventoProceso | null = null
  for (const e of eventos) {
    if (e.accion === 'habilitado' || e.accion === 'devuelto') ultima = null
    else if (e.accion === 'aprobado' && e.rol === rol) ultima = e
  }
  return ultima
}

export default function Aprobaciones({ open, onClose, cursoId, proceso, onCambio }: Props) {
  const { user } = useAuth()
  const toast = useToast()
  const [comentario, setComentario] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  const roles = user?.roles ?? []
  const esMonitor = roles.includes('monitor_ea')
  const esDda = roles.includes('dda')

  const monitor = aprobacionVigente(proceso.eventos, 'monitor_ea')
  const dda = aprobacionVigente(proceso.eventos, 'dda')

  const ejecutar = async (accion: () => Promise<void>, mensaje: string) => {
    setTrabajando(true)
    try {
      await accion()
      toast(mensaje)
      setComentario('')
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo completar la acción.', 'error')
    } finally {
      setTrabajando(false)
    }
  }

  const correo = user?.correo ?? ''
  const puedeRevisarMonitor = esMonitor && proceso.estado === 'revision_monitor'
  const puedeRevisarDda = esDda && proceso.estado === 'revision_dda'
  const rolRevisor = puedeRevisarMonitor ? 'monitor_ea' : puedeRevisarDda ? 'dda' : null
  const puedeHabilitar = esMonitor && (proceso.estado === 'revision_dda' || proceso.estado === 'aprobado')

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Aprobaciones"
      footer={<button className="btn btn-primary" onClick={onClose}>Entendido</button>}
    >
      <div className="row-between">
        <span style={{ fontSize: 15, fontWeight: 700 }}>Diseño de contenido académico</span>
        <span className={`chip ${proceso.estado === 'aprobado' ? 'chip-aprobado' : proceso.estado === 'en_edicion' ? 'chip-edicion' : 'chip-revision'}`}>
          {ESTADO_LABEL[proceso.estado]}
        </span>
      </div>

      <div className="panel" style={{ border: '1px solid var(--color-border)', display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
        {[
          { etiqueta: 'Monitor EA', ev: monitor },
          { etiqueta: 'DDA', ev: dda },
        ].map((c, i) => (
          <div key={c.etiqueta} style={{ padding: 18, borderLeft: i ? '1px solid var(--color-border)' : undefined, display: 'flex', flexDirection: 'column', gap: 10, fontSize: 14 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, color: c.ev ? 'var(--color-primary)' : 'var(--color-text-muted)' }}>
              <Icon name={c.ev ? 'checkCircle' : 'clock'} size={18} />
              <span style={{ color: 'var(--color-text)' }}>{c.etiqueta}</span>
            </span>
            {c.ev ? (
              <>
                <span>{c.ev.usuario}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="calendar" size={16} />{fecha(c.ev.fecha)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Icon name="clock" size={16} />{hora(c.ev.fecha)}</span>
              </>
            ) : (
              <span style={{ color: 'var(--color-text-muted)' }}>Aprobación pendiente</span>
            )}
          </div>
        ))}
      </div>

      {rolRevisor && (
        <div className="panel" style={{ border: '1px solid var(--color-border)', padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <span style={{ fontWeight: 700 }}>Tu revisión como {rolRevisor === 'monitor_ea' ? 'Monitor EA' : 'DDA'}</span>
          <textarea
            className="textarea"
            style={{ minHeight: 90 }}
            placeholder="Comentario para el docente (obligatorio si devuelves)"
            value={comentario}
            onChange={e => setComentario(e.target.value)}
          />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn btn-outline"
              disabled={trabajando || !comentario.trim()}
              onClick={() => ejecutar(() => devolverProceso(cursoId, rolRevisor, correo, comentario.trim()), 'Se devolvió al docente con tus comentarios.')}
            >
              Devolver con comentarios
            </button>
            <button
              className="btn btn-primary"
              disabled={trabajando}
              onClick={() =>
                ejecutar(
                  () => aprobarProceso(cursoId, rolRevisor, correo),
                  rolRevisor === 'dda' ? 'Proceso aprobado y cerrado.' : 'Aprobado. Se envió a DDA.',
                )
              }
            >
              Aprobar
            </button>
          </div>
        </div>
      )}

      {puedeHabilitar && (
        <div className="alert-banner alert-warn" style={{ justifyContent: 'space-between', padding: '12px 14px' }}>
          <span>Si el docente necesita hacer cambios, habilita la edición. La aprobación empezará de nuevo.</span>
          <button
            className="btn btn-outline"
            disabled={trabajando}
            onClick={() => ejecutar(() => habilitarEdicion(cursoId, correo, comentario.trim() || undefined), 'Edición habilitada.')}
          >
            Habilitar edición
          </button>
        </div>
      )}

      {proceso.eventos.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>Historial</span>
          {[...proceso.eventos].reverse().map(e => (
            <div key={e.id} style={{ fontSize: 13, display: 'flex', flexDirection: 'column', gap: 2, paddingBottom: 8, borderBottom: '1px solid var(--color-border)' }}>
              <span>
                <b>{ACCION_LABEL[e.accion]}</b>
                {e.instrumento ? ` · ${e.instrumento}` : ''} — {e.usuario}
              </span>
              <span style={{ color: 'var(--color-text-muted)' }}>{fecha(e.fecha)} {hora(e.fecha)}</span>
              {e.comentario && <span style={{ fontStyle: 'italic' }}>“{e.comentario}”</span>}
            </div>
          ))}
        </div>
      )}
    </Drawer>
  )
}

const ACCION_LABEL: Record<EventoProceso['accion'], string> = {
  finalizado: 'Edición finalizada',
  enviado: 'Enviado a revisión',
  aprobado: 'Aprobado',
  devuelto: 'Devuelto con comentarios',
  habilitado: 'Edición habilitada',
}
