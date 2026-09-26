import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import Icon, { type IconName } from './Icon'
import { haceCuanto } from '../shared/academico'
import { listarNotificaciones, marcarLeidas, type Notificacion, type TipoNotificacion } from '../shared/notificaciones'

const ICONO: Record<TipoNotificacion, IconName> = {
  finalizado: 'pencil',
  enviado: 'mail',
  comentario: 'comment',
  respuesta: 'comment',
  aprobado: 'checkCircle',
  devuelto: 'alert',
  habilitado: 'lock',
  incidencia: 'alert',
}

/** Checked every few seconds (and when the tab gets focus), so it updates without reloading. */
const CADA_MS = 20000

/** Bell in the header: what happened in my courses (finalized parts, comments, approvals, incidents). */
export default function Campana({ usuarioId }: { usuarioId: string }) {
  const navigate = useNavigate()
  const [items, setItems] = useState<Notificacion[]>([])
  const [tabla, setTabla] = useState(true)
  const [abierta, setAbierta] = useState(false)
  const [soloNoLeidas, setSoloNoLeidas] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  const cargar = useCallback(() => {
    listarNotificaciones(usuarioId)
      .then(r => {
        setTabla(r.tabla)
        setItems(r.items)
      })
      .catch(() => {})
  }, [usuarioId])

  useEffect(() => {
    cargar()
    const t = setInterval(cargar, CADA_MS)
    window.addEventListener('focus', cargar)
    return () => {
      clearInterval(t)
      window.removeEventListener('focus', cargar)
    }
  }, [cargar])

  useEffect(() => {
    if (!abierta) return
    const cerrar = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setAbierta(false)
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAbierta(false)
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', esc)
    }
  }, [abierta])

  const noLeidas = items.filter(n => !n.leida)
  const lista = soloNoLeidas ? noLeidas : items

  const abrir = (n: Notificacion) => {
    if (!n.leida) {
      setItems(prev => prev.map(x => (x.id === n.id ? { ...x, leida: true } : x)))
      void marcarLeidas([n.id])
    }
    setAbierta(false)
    if (n.ruta) navigate(n.ruta)
  }
  const leerTodas = () => {
    setItems(prev => prev.map(x => ({ ...x, leida: true })))
    void marcarLeidas(noLeidas.map(n => n.id))
  }

  return (
    <div className="campana" ref={ref}>
      <button
        className="campana-btn"
        aria-label={noLeidas.length ? `Notificaciones: ${noLeidas.length} sin leer` : 'Notificaciones'}
        aria-expanded={abierta}
        onClick={() => {
          setAbierta(a => !a)
          if (!abierta) cargar()
        }}
      >
        <Icon name="bell" size={22} />
        {noLeidas.length > 0 && <span className="campana-num">{noLeidas.length > 99 ? '99+' : noLeidas.length}</span>}
      </button>
      {abierta && (
        <div className="campana-panel" role="dialog" aria-label="Notificaciones">
          <div className="campana-head">
            <b style={{ fontSize: 15 }}>Notificaciones</b>
            <span style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}>
                <input type="checkbox" checked={soloNoLeidas} onChange={e => setSoloNoLeidas(e.target.checked)} />
                Solo sin leer
              </label>
              {noLeidas.length > 0 && <button className="link-btn" style={{ fontSize: 12 }} onClick={leerTodas}>Marcar todas como leídas</button>}
            </span>
          </div>
          <div className="campana-lista">
            {!tabla ? (
              <p className="campana-vacia">Las notificaciones se activan al ejecutar <b>supabase/schema-notificaciones.sql</b> en Supabase.</p>
            ) : lista.length === 0 ? (
              <p className="campana-vacia">{soloNoLeidas ? 'No tienes notificaciones sin leer.' : 'Aún no tienes notificaciones. Aquí verás cuando terminen una parte, comenten, aprueben o haya una incidencia en tus cursos.'}</p>
            ) : (
              lista.map(n => (
                <button key={n.id} className={`campana-item${n.leida ? '' : ' nueva'} ${n.tipo}`} onClick={() => abrir(n)}>
                  <span className="campana-icono"><Icon name={ICONO[n.tipo] ?? 'info'} size={15} /></span>
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0, flex: 1, textAlign: 'left' }}>
                    <span style={{ fontWeight: n.leida ? 400 : 700, fontSize: 13, lineHeight: 1.35 }}>{n.titulo}</span>
                    {n.detalle && <span className="campana-detalle">{n.detalle}</span>}
                    <span style={{ fontSize: 11, color: 'var(--color-text-muted)' }}>
                      {n.actor ? `${n.actor} · ` : ''}{haceCuanto(n.fecha)}
                    </span>
                  </span>
                  {!n.leida && <span className="campana-punto" aria-label="Sin leer" />}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
