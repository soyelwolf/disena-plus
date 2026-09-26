// "Aprobaciones" side panel: who approved what and when (Monitor EA → DDA),
// plus the approvers' actions for the current state.

import type { RolCurso } from '../shared/hooks/useContenidoAcademico'
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
import Icon, { type IconName } from './Icon'
import { Drawer, useToast } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  cursoId: string
  proceso: ProcesoCurso
  rol: RolCurso
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

export default function Aprobaciones({ open, onClose, cursoId, proceso, rol, onCambio }: Props) {
  const { user } = useAuth()
  const toast = useToast()
  const [comentario, setComentario] = useState('')
  const [trabajando, setTrabajando] = useState(false)
  // Monitor EA / DDA of THIS course (LISTADO_CURSOS_PARA_IA), not the global roles.
  const esMonitor = rol.monitor
  const esDda = rol.dda

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
  const puedeHabilitar = esMonitor && proceso.estado === 'aprobado'

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
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-text-muted)' }}>Historial · del más reciente al más antiguo</span>
          <ol className="historial">
            {[...proceso.eventos].reverse().map(e => {
              const d = describirEvento(e)
              return (
                <li key={e.id} className={`historial-item ${d.tono}`}>
                  <span className="historial-icono"><Icon name={d.icono} size={15} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                    <b>{d.titulo}</b>
                    {d.detalle && <span style={{ color: '#3d434a' }}>{d.detalle}</span>}
                    <span style={{ color: 'var(--color-text-muted)' }}>
                      {e.usuario ? `${e.usuario} · ` : ''}{fecha(e.fecha)} {hora(e.fecha)}
                    </span>
                    {e.comentario && <span style={{ fontStyle: 'italic' }}>“{e.comentario}”</span>}
                  </span>
                </li>
              )
            })}
          </ol>
        </div>
      )}
    </Drawer>
  )
}

/**
 * History wording: "finalizado" is one part closed by the teacher; "enviado" is
 * recorded automatically once every part is finalized (the notice to the approvers).
 */
function describirEvento(e: EventoProceso): { titulo: string; detalle?: string; icono: IconName; tono: string } {
  const parte = e.instrumento ? PARTE_LABEL[e.instrumento] ?? e.instrumento : ''
  const quien = e.rol === 'dda' ? 'DDA' : 'Monitor EA'
  switch (e.accion) {
    case 'finalizado':
      return { titulo: `${parte || 'Una parte'}: edición finalizada`, detalle: 'El docente terminó esta parte. Aún puede seguir editando.', icono: 'pencil', tono: 'neutro' }
    case 'enviado':
      return { titulo: 'Enviado a revisión', detalle: 'Todas las partes quedaron finalizadas: se avisó al Monitor EA y DDA que pueden revisar.', icono: 'mail', tono: 'info' }
    case 'aprobado':
      return {
        titulo: `Aprobado por ${quien}`,
        detalle: e.rol === 'dda' ? 'Con los dos checks, el proceso quedó cerrado.' : 'Falta la aprobación de DDA.',
        icono: 'checkCircle',
        tono: 'ok',
      }
    case 'devuelto':
      return { titulo: `Devuelto al docente por ${quien}`, detalle: 'Se habilitó la edición para hacer los cambios.', icono: 'alert', tono: 'alerta' }
    case 'habilitado':
      return { titulo: 'Edición habilitada por Monitor EA', detalle: 'La aprobación empieza de nuevo.', icono: 'lock', tono: 'alerta' }
    // Incidents: the decision and its reason stay on record for the whole team.
    case 'cambio_instrumento':
      return { titulo: `Incidencia · cambio de instrumento${e.rol ? ` (${e.rol})` : ''}`, icono: 'alert', tono: 'alerta' }
    case 'quitado':
      return { titulo: `Incidencia · ${parte || 'instrumento'}: se quitó un elemento${e.rol ? ` (${e.rol})` : ''}`, icono: 'trash', tono: 'alerta' }
  }
}

const PARTE_LABEL: Record<string, string> = { consignas: 'Consignas', rubricas: 'Rúbricas', matriz: 'Matriz', lista: 'Lista de cotejo', escala: 'Escala de valoración' }

/**
 * Message after "Finalizar edición general" of one part: the process is one
 * (consignas + the instruments the course uses) and the approvers are notified
 * only once every part is finalized.
 */
export function MensajeFinalizado({ parte, requeridos, finalizado }: { parte: string; requeridos: string[]; finalizado: Record<string, boolean> }) {
  const faltan = requeridos.filter(r => !finalizado[r])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <span>
        Marcaste {PARTE_LABEL[parte] ?? parte} como terminada. El Monitor EA y DDA revisan el <b>Diseño de contenido académico completo</b>, así que el aviso se
        envía cuando todas estas partes estén finalizadas:
      </span>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        {requeridos.map(r => (
          <li key={r} style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 700, color: finalizado[r] ? '#0a7a3e' : '#8a4b00' }}>
            <Icon name={finalizado[r] ? 'checkCircle' : 'clock'} size={16} />
            {PARTE_LABEL[r] ?? r}: {finalizado[r] ? 'finalizada' : 'falta pulsar «Finalizar edición general»'}
          </li>
        ))}
      </ul>
      {faltan.length > 0 && <span>Puedes seguir editando mientras tanto.</span>}
    </div>
  )
}
