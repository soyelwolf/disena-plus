import { useCallback, useEffect, useState } from 'react'
import Icon from '../components/Icon'
import { Drawer, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  TEMAS_SOPORTE,
  cambiarEstadoConsulta,
  crearConsulta,
  listarConsultas,
  listarMensajes,
  responderConsulta,
  type Consulta,
  type EstadoSoporte,
  type MensajeSoporte,
  type TemaSoporte,
} from '../shared/soporte'

/** Product Operations analysts who answer Diseña+ support requests. */
const ANALISTAS = [
  { nombre: 'Fernando Yonathan Bustamante Mattos', correo: 'fbustamant@utp.edu.pe', foto: '/soporte-fbustamant.png' },
  { nombre: 'Jose Luis Antunez Condezo', correo: 'jantunezc@utp.edu.pe', foto: null },
]

const ESTADO: Record<EstadoSoporte, { label: string; chip: string }> = {
  abierto: { label: 'Esperando respuesta', chip: 'chip-edicion' },
  respondido: { label: 'Respondida', chip: 'chip-revision' },
  cerrado: { label: 'Cerrada', chip: 'chip-aprobado' },
}

const teams = (correo: string) => `https://teams.microsoft.com/l/chat/0/0?users=${encodeURIComponent(correo)}`

const fecha = (iso: string) =>
  new Date(iso).toLocaleString('es-PE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

const iniciales = (nombre: string) =>
  nombre.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

/** The analyst's photo, or their initials when there is none (the photo file is kept out of the repository). */
function FotoAnalista({ foto, nombre }: { foto: string | null; nombre: string }) {
  const [fallo, setFallo] = useState(false)
  if (!foto || fallo) return <span className="soporte-foto soporte-iniciales">{iniciales(nombre)}</span>
  return <img src={foto} alt="" className="soporte-foto" onError={() => setFallo(true)} />
}

/** Support channel: contacts, and a chat with the administrators inside Diseña+. */
export default function Soporte() {
  const { user, isAdmin } = useAuth()
  const [vista, setVista] = useState<'mias' | 'bandeja'>('mias')
  const [datos, setDatos] = useState<{ tabla: boolean; consultas: Consulta[] } | null>(null)
  const [abierta, setAbierta] = useState<Consulta | null>(null)
  const bandeja = isAdmin && vista === 'bandeja'

  useEffect(() => {
    document.title = 'Soporte — Diseña+'
  }, [])

  const cargar = useCallback(() => {
    if (!user) return
    listarConsultas(bandeja ? null : user.correo)
      .then(setDatos)
      .catch(() => setDatos({ tabla: true, consultas: [] }))
  }, [user, bandeja])
  useEffect(cargar, [cargar])

  if (!user) return null
  const pendientes = datos?.consultas.filter(c => c.estado === 'abierto').length ?? 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>Soporte</h1>

      <section className="panel animate-in soporte-hero">
        <span className="soporte-hero-icono">
          <Icon name="soporte" size={30} />
        </span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, minWidth: 0 }}>
          <span style={{ color: 'var(--color-primary)', fontWeight: 700, fontSize: 14 }}>Canal de atención</span>
          <h2 style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.25 }}>
            Estimado/a: <span style={{ color: 'var(--color-primary)' }}>{user.nombre}</span>
          </h2>
          <p style={{ color: 'var(--color-text-muted)', fontSize: 15, lineHeight: 1.6, marginTop: 4 }}>
            Para cualquier atención, feedback o sugerencia, escríbenos aquí mismo o contacta a un analista por Teams o correo.
            También puedes usar los canales indicados en las capacitaciones 😊.
          </p>
        </div>
      </section>

      <div className="soporte-grid">
        <section className="panel animate-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Analistas de Product Operations</h3>
          {ANALISTAS.map(a => (
            <div key={a.correo} className="soporte-analista">
              <FotoAnalista foto={a.foto} nombre={a.nombre} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1 }}>
                <span style={{ fontWeight: 700 }}>{a.nombre}</span>
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', overflowWrap: 'anywhere' }}>{a.correo}</span>
                <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <a className="btn btn-primary btn-sm" href={teams(a.correo)} target="_blank" rel="noreferrer">
                    <Icon name="comment" size={16} /> Chat en Teams
                  </a>
                  <a className="btn btn-outline btn-sm" href={`mailto:${a.correo}?subject=${encodeURIComponent('Soporte Diseña+')}`}>
                    <Icon name="mail" size={16} /> Correo
                  </a>
                </div>
              </div>
            </div>
          ))}
        </section>

        <NuevaConsulta
          disponible={datos?.tabla !== false}
          onEnviada={c => {
            setVista('mias')
            cargar()
            setAbierta(c)
          }}
        />
      </div>

      <section className="panel animate-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isAdmin ? (
          <div className="tabs" role="tablist">
            <button role="tab" aria-selected={vista === 'mias'} className={`tab${vista === 'mias' ? ' active' : ''}`} onClick={() => setVista('mias')}>
              Mis consultas
            </button>
            <button role="tab" aria-selected={vista === 'bandeja'} className={`tab${vista === 'bandeja' ? ' active' : ''}`} onClick={() => setVista('bandeja')}>
              Bandeja de soporte{bandeja && pendientes > 0 ? ` (${pendientes} por responder)` : ''}
            </button>
          </div>
        ) : (
          <h3 style={{ fontSize: 18, fontWeight: 700 }}>Mis consultas</h3>
        )}

        {datos && !datos.tabla ? (
          <div className="alert-banner alert-warn" style={{ padding: '12px 14px' }}>
            <Icon name="info" size={16} />
            Para activar el chat de soporte, ejecuta <b>supabase/schema-soporte.sql</b> en Supabase.
          </div>
        ) : !datos ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : datos.consultas.length === 0 ? (
          <p style={{ color: 'var(--color-text-muted)' }}>
            {bandeja ? 'No hay consultas por ahora.' : 'Aún no has enviado consultas. Cuando escribas una, verás aquí las respuestas.'}
          </p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {datos.consultas.map(c => (
              <button key={c.id} className="soporte-fila" onClick={() => setAbierta(c)}>
                <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0, flex: 1, textAlign: 'left' }}>
                  <span style={{ fontWeight: 700 }}>{c.asunto}</span>
                  <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                    {bandeja ? `${c.nombre} · ` : ''}{TEMAS_SOPORTE[c.tema]} · {fecha(c.modificado)}
                  </span>
                </span>
                <span className={`chip ${ESTADO[c.estado].chip}`}>
                  {bandeja && c.estado === 'abierto' ? 'Por responder' : ESTADO[c.estado].label}
                </span>
                <Icon name="chevronRight" size={18} />
              </button>
            ))}
          </div>
        )}
      </section>

      {abierta && (
        <Conversacion
          consulta={abierta}
          comoSoporte={isAdmin && abierta.correo !== user.correo.toLowerCase()}
          onClose={() => setAbierta(null)}
          onCambio={cargar}
        />
      )}
    </div>
  )
}

function NuevaConsulta({ disponible, onEnviada }: { disponible: boolean; onEnviada: (c: Consulta) => void }) {
  const { user } = useAuth()
  const toast = useToast()
  const [tema, setTema] = useState<TemaSoporte>('uso')
  const [asunto, setAsunto] = useState('')
  const [mensaje, setMensaje] = useState('')
  const [enviando, setEnviando] = useState(false)
  const listo = disponible && asunto.trim() && mensaje.trim() && !enviando

  const enviar = async () => {
    if (!user || !listo) return
    setEnviando(true)
    try {
      const c = await crearConsulta({ correo: user.correo, nombre: user.nombre, tema, asunto, mensaje })
      setAsunto('')
      setMensaje('')
      toast('Consulta enviada. Te responderemos aquí mismo.')
      onEnviada(c)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <section className="panel animate-in" style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h3 style={{ fontSize: 18, fontWeight: 700 }}>Escríbenos desde aquí</h3>
        <p style={{ fontSize: 14, color: 'var(--color-text-muted)', marginTop: 4 }}>
          Tu mensaje llega al equipo de Diseña+ y la respuesta aparecerá en “Mis consultas”.
        </p>
      </div>
      <div>
        <label className="field-label" htmlFor="soporte-tema">Tema</label>
        <select id="soporte-tema" style={{ width: '100%', height: 44, borderColor: 'var(--color-input-border)', borderRadius: 4 }} value={tema} onChange={e => setTema(e.target.value as TemaSoporte)}>
          {(Object.keys(TEMAS_SOPORTE) as TemaSoporte[]).map(t => (
            <option key={t} value={t}>{TEMAS_SOPORTE[t]}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="field-label" htmlFor="soporte-asunto">Asunto</label>
        <div className="input-box">
          <input id="soporte-asunto" maxLength={120} placeholder="Ej.: No puedo finalizar la rúbrica del curso…" value={asunto} onChange={e => setAsunto(e.target.value)} />
        </div>
      </div>
      <div>
        <label className="field-label" htmlFor="soporte-mensaje">Mensaje</label>
        <textarea id="soporte-mensaje" className="textarea" maxLength={4000} placeholder="Cuéntanos qué necesitas. Si es un curso, indica su nombre o código." value={mensaje} onChange={e => setMensaje(e.target.value)} />
      </div>
      <button className="btn btn-primary" style={{ alignSelf: 'flex-end', height: 44, padding: '0 24px' }} disabled={!listo} onClick={enviar}>
        <Icon name={enviando ? 'spinner' : 'arrowRight'} size={18} /> {enviando ? 'Enviando…' : 'Enviar consulta'}
      </button>
    </section>
  )
}

function Conversacion(props: { consulta: Consulta; comoSoporte: boolean; onClose: () => void; onCambio: () => void }) {
  const { consulta, comoSoporte, onClose, onCambio } = props
  const { user } = useAuth()
  const toast = useToast()
  const [mensajes, setMensajes] = useState<MensajeSoporte[] | null>(null)
  const [estado, setEstado] = useState<EstadoSoporte>(consulta.estado)
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  const cargar = useCallback(() => {
    listarMensajes(consulta.id).then(setMensajes).catch(() => setMensajes([]))
  }, [consulta.id])
  useEffect(cargar, [cargar])

  const enviar = async () => {
    if (!user || !texto.trim()) return
    setEnviando(true)
    try {
      await responderConsulta(consulta.id, { autor: user.nombre, correo: user.correo, esAdmin: comoSoporte, texto })
      setTexto('')
      setEstado(comoSoporte ? 'respondido' : 'abierto')
      cargar()
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo enviar.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  const cambiarEstado = async (nuevo: EstadoSoporte) => {
    try {
      await cambiarEstadoConsulta(consulta.id, nuevo)
      setEstado(nuevo)
      toast(nuevo === 'cerrado' ? 'Consulta cerrada' : 'Consulta reabierta')
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error')
    }
  }

  return (
    <Drawer
      open
      onClose={onClose}
      title={consulta.asunto}
      footer={
        estado === 'cerrado' ? (
          <button className="btn btn-outline" onClick={() => cambiarEstado('abierto')}>Reabrir consulta</button>
        ) : (
          <>
            <button className="btn btn-outline" onClick={() => cambiarEstado('cerrado')}>
              {comoSoporte ? 'Cerrar consulta' : 'Ya se resolvió'}
            </button>
            <button className="btn btn-primary" disabled={!texto.trim() || enviando} onClick={enviar}>
              {enviando ? 'Enviando…' : comoSoporte ? 'Responder' : 'Enviar'}
            </button>
          </>
        )
      }
    >
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`chip ${ESTADO[estado].chip}`}>{ESTADO[estado].label}</span>
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
          {TEMAS_SOPORTE[consulta.tema]}{comoSoporte ? ` · ${consulta.nombre} (${consulta.correo})` : ''}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {!mensajes ? (
          <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>
        ) : (
          mensajes.map(m => {
            const propio = m.esAdmin === comoSoporte
            return (
              <div key={m.id} className={`soporte-msg${propio ? ' propio' : ''}${m.esAdmin ? ' soporte' : ''}`}>
                <span style={{ fontSize: 12, fontWeight: 700 }}>
                  {m.esAdmin ? `${m.autor} · Soporte Diseña+` : m.autor}
                  <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}> · {fecha(m.creado)}</span>
                </span>
                <span style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55 }}>{m.texto}</span>
              </div>
            )
          })
        )}
      </div>
      {estado !== 'cerrado' && (
        <textarea
          className="textarea"
          style={{ minHeight: 90 }}
          maxLength={4000}
          placeholder={comoSoporte ? 'Escribe tu respuesta' : 'Escribe un mensaje'}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          aria-label="Mensaje"
        />
      )}
    </Drawer>
  )
}
