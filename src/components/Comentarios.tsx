// Comments per item (field of a consigna, cell of a criterion…), like the
// SharePoint review columns: Monitor EA / DDA open a comment, optionally on a
// highlighted fragment; teachers and advisers reply in the thread; only the
// author marks it resolved. Badge: + (none) · 1 / 2 (sides with open comments) · ✓.

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ROLE_LABELS, useAuth, type UserRole } from '../shared/AuthContext'
import {
  CAMPO_GENERAL,
  agregarComentario,
  estadoComentarios,
  ladoDeUsuario,
  resolverComentario,
  type Comentario,
  type EstadoComentarios,
  type InstrumentoFlujo,
  type LadoComentario,
} from '../shared/academico'
import { textoPlano } from '../shared/textoRico'
import Icon from './Icon'
import { useToast } from './ui'

const sinEspacios = (s: string) => s.replace(/\s+/g, '')
const fechaHora = (iso: string) => new Date(iso).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })
const LADO_LABEL: Record<LadoComentario, string> = { monitor_ea: 'Monitor EA', dda: 'DDA', docente: 'Docente' }

// ── Badge ────────────────────────────────────────────────────────────────────

export function BotonComentarios(props: {
  estado: EstadoComentarios
  puedeComentar: boolean
  onClick: () => void
  label: string
  activo?: boolean
}) {
  const { estado, puedeComentar, onClick, label, activo } = props
  const hay = estado.abiertos + estado.resueltos > 0
  if (!hay && !puedeComentar) return null
  const clase = estado.abiertos > 0 ? 'abierto' : hay ? 'resuelto' : 'vacio'
  const titulo =
    estado.abiertos > 0
      ? `${estado.abiertos} ${estado.abiertos === 1 ? 'comentario pendiente' : 'comentarios pendientes'}`
      : hay
        ? 'Comentarios resueltos'
        : 'Agregar comentario'
  return (
    <button
      type="button"
      className={`coment-btn ${clase}${activo ? ' activo' : ''}`}
      onClick={onClick}
      title={titulo}
      aria-label={`${titulo}: ${label}`}
    >
      <Icon name="comment" size={16} />
      <span className="coment-badge">{estado.abiertos > 0 ? estado.lados : hay ? '✓' : '+'}</span>
    </button>
  )
}

// ── Highlighting quoted fragments (CSS Custom Highlight API: no DOM changes) ──

const registro = new Map<symbol, Range[]>()

function refrescarResaltado() {
  const H = (window as unknown as { Highlight?: new (...r: Range[]) => unknown }).Highlight
  const mapa = (CSS as unknown as { highlights?: Map<string, unknown> }).highlights
  if (!H || !mapa) return
  const rangos = [...registro.values()].flat()
  if (rangos.length) mapa.set('cita', new H(...rangos))
  else mapa.delete('cita')
}

/** Range of `cita` inside `raiz`, ignoring whitespace and formatting boundaries. */
function buscarRango(raiz: HTMLElement, cita: string): Range | null {
  const objetivo = sinEspacios(cita)
  if (!objetivo) return null
  const pos: Array<{ nodo: Text; i: number }> = []
  let texto = ''
  const walker = document.createTreeWalker(raiz, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const t = n as Text
    for (let i = 0; i < t.data.length; i++) {
      if (/\s/.test(t.data[i])) continue
      texto += t.data[i]
      pos.push({ nodo: t, i })
    }
  }
  const k = texto.indexOf(objetivo)
  if (k < 0) return null
  const r = document.createRange()
  r.setStart(pos[k].nodo, pos[k].i)
  const fin = pos[k + objetivo.length - 1]
  r.setEnd(fin.nodo, fin.i + 1)
  return r
}

/** True when the quoted fragment is no longer in the current text. */
export function citaCambio(cita: string, valorActual: string | null | undefined): boolean {
  return !sinEspacios(textoPlano(valorActual ?? '')).includes(sinEspacios(cita))
}

/**
 * Wraps an item: highlights the fragments quoted by open comments and, for
 * approvers, offers "Comentar" on the text they select.
 */
export function ZonaComentable(props: { children: ReactNode; citas: string[]; puedeComentar: boolean; onComentar: (cita: string) => void; className?: string }) {
  const { children, citas, puedeComentar, onComentar, className } = props
  const ref = useRef<HTMLDivElement>(null)
  const clave = useMemo(() => Symbol('zona'), [])
  const [boton, setBoton] = useState<{ x: number; y: number; texto: string } | null>(null)
  const citasKey = citas.join('\u0000')

  useEffect(() => {
    const raiz = ref.current
    if (!raiz) return
    const aplicar = () => {
      const lista = citasKey ? citasKey.split('\u0000') : []
      registro.set(clave, lista.map(c => buscarRango(raiz, c)).filter((r): r is Range => !!r))
      refrescarResaltado()
    }
    aplicar()
    const obs = new MutationObserver(aplicar)
    obs.observe(raiz, { subtree: true, childList: true, characterData: true })
    return () => {
      obs.disconnect()
      registro.delete(clave)
      refrescarResaltado()
    }
  }, [clave, citasKey])

  useEffect(() => {
    if (!boton) return
    const ocultar = () => setBoton(null)
    window.addEventListener('scroll', ocultar, true)
    return () => window.removeEventListener('scroll', ocultar, true)
  }, [boton])

  const revisarSeleccion = () => {
    if (!puedeComentar) return
    const sel = window.getSelection()
    const raiz = ref.current
    if (!sel || sel.isCollapsed || !raiz || !raiz.contains(sel.anchorNode) || !raiz.contains(sel.focusNode)) return setBoton(null)
    const texto = sel.toString().trim()
    if (!texto) return setBoton(null)
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    setBoton({ x: Math.min(rect.right, window.innerWidth - 170), y: rect.bottom + 6, texto: texto.slice(0, 500) })
  }

  return (
    <div ref={ref} className={className} onMouseUp={revisarSeleccion} onKeyUp={revisarSeleccion} onMouseDown={() => setBoton(null)}>
      {children}
      {boton && (
        <button
          type="button"
          className="btn btn-primary btn-sm coment-seleccion"
          style={{ left: boton.x, top: boton.y }}
          onMouseDown={e => e.preventDefault()}
          onClick={() => {
            onComentar(boton.texto)
            setBoton(null)
            window.getSelection()?.removeAllRanges()
          }}
        >
          <Icon name="comment" size={14} />Comentar selección
        </button>
      )}
    </div>
  )
}

// ── Side panel ───────────────────────────────────────────────────────────────

export interface FiltroComentarios {
  entidadId?: string
  campo?: string
  /** Fragment selected by the approver for the new comment. */
  cita?: string
}

interface PanelProps {
  filtro: FiltroComentarios | null
  onClose: () => void
  titulo: string
  cursoId: string
  instrumento: InstrumentoFlujo
  comentarios: Comentario[]
  onCambio: () => void
  /** Label of an item, e.g. "Consigna PC1 · Indicaciones específicas". */
  etiquetaItem: (entidadId: string, campo: string) => string
  /** Current text of an item, to tell whether it changed since the comment. */
  valorItem: (entidadId: string, campo: string) => string | null
  /** Monitor EA / DDA: open new comments. */
  puedeComentar: boolean
  /** Approvers and the teaching team: reply in threads. */
  puedeResponder: boolean
  onIrItem?: (entidadId: string, campo: string) => void
}

export function PanelComentarios(props: PanelProps) {
  const { filtro, onClose, titulo, comentarios, etiquetaItem, valorItem, puedeComentar, puedeResponder, onIrItem } = props
  const { user } = useAuth()
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [cita, setCita] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [verResueltos, setVerResueltos] = useState(false)

  useEffect(() => {
    setCita(filtro?.cita ?? null)
    setVerResueltos(false)
  }, [filtro?.entidadId, filtro?.campo, filtro?.cita])

  // Leave room on the right so the reviewed item stays visible.
  useEffect(() => {
    if (!filtro) return
    document.body.classList.add('con-panel-comentarios')
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.classList.remove('con-panel-comentarios')
      document.removeEventListener('keydown', onKey)
    }
  }, [filtro, onClose])

  if (!filtro || !user) return null
  const unItem = !!(filtro.entidadId && filtro.campo)
  const raices = comentarios.filter(
    c => !c.padreId && (!filtro.entidadId || c.entidadId === filtro.entidadId) && (!filtro.campo || c.campo === filtro.campo),
  )
  const abiertas = raices.filter(c => !c.resuelto)
  const resueltas = raices.filter(c => c.resuelto)
  const visibles = verResueltos ? [...abiertas, ...resueltas] : abiertas
  const lado = ladoDeUsuario(user.roles)
  const rolLabel = (): string => {
    const r = user.roles.find(x => (lado === 'docente' ? x === 'docente' || x === 'asesor' : lado === 'dda' ? x === 'dda' : x.startsWith('monitor')))
    return r ? ROLE_LABELS[r as UserRole] : LADO_LABEL[lado]
  }

  const enviar = async (params: { entidadId: string; campo: string; padreId?: string; texto: string; cita?: string | null }) => {
    setEnviando(true)
    try {
      await agregarComentario({
        cursoId: props.cursoId,
        instrumento: props.instrumento,
        entidadId: params.entidadId,
        campo: params.campo,
        padreId: params.padreId ?? null,
        lado,
        autor: user.nombre,
        correo: user.correo,
        rol: rolLabel(),
        texto: params.texto,
        cita: params.cita ?? null,
        textoItem: params.padreId ? null : valorItem(params.entidadId, params.campo),
      })
      props.onCambio()
      return true
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo enviar el comentario.', 'error')
      return false
    } finally {
      setEnviando(false)
    }
  }

  const resolver = async (c: Comentario, valor: boolean) => {
    try {
      await resolverComentario(c.id, valor, user.nombre)
      toast(valor ? 'Comentario resuelto' : 'Comentario reabierto')
      props.onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error')
    }
  }

  // Group by item when the panel shows more than one.
  const grupos = new Map<string, Comentario[]>()
  for (const c of visibles) {
    const k = `${c.entidadId}|${c.campo}`
    grupos.set(k, [...(grupos.get(k) ?? []), c])
  }

  return (
    <aside className="coment-panel" role="complementary" aria-label={titulo}>
      <div className="coment-panel-head">
        <div style={{ minWidth: 0 }}>
          <h2 style={{ fontSize: 17, fontWeight: 700 }}>{titulo}</h2>
          {unItem && <p className="coment-sub">{etiquetaItem(filtro.entidadId!, filtro.campo!)}</p>}
        </div>
        <button className="icon-btn" aria-label="Cerrar comentarios" onClick={onClose}><Icon name="close" size={20} /></button>
      </div>

      <div className="coment-panel-body">
        <div className="coment-resumen">
          <span>{abiertas.length} {abiertas.length === 1 ? 'pendiente' : 'pendientes'} · {resueltas.length} {resueltas.length === 1 ? 'resuelto' : 'resueltos'}</span>
          {resueltas.length > 0 && (
            <button className="link-btn" onClick={() => setVerResueltos(v => !v)}>{verResueltos ? 'Ocultar resueltos' : 'Ver resueltos'}</button>
          )}
        </div>

        {visibles.length === 0 && (
          <p className="coment-vacio">
            {raices.length === 0 ? (puedeComentar && unItem ? 'Aún no hay comentarios. Escribe el primero abajo o selecciona un texto del ítem para citarlo.' : 'Aún no hay comentarios.') : 'No hay comentarios pendientes.'}
          </p>
        )}

        {[...grupos.entries()].map(([k, lista]) => {
          const [entidadId, campo] = k.split('|')
          return (
            <div key={k} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {!unItem && (
                <div className="coment-grupo">
                  <b>{etiquetaItem(entidadId, campo)}</b>
                  {onIrItem && <button className="link-btn" onClick={() => onIrItem(entidadId, campo)}>Ir al ítem</button>}
                </div>
              )}
              {lista.map(c => (
                <Hilo
                  key={c.id}
                  raiz={c}
                  respuestas={comentarios.filter(r => r.padreId === c.id)}
                  valorActual={valorItem(c.entidadId, c.campo)}
                  esAutor={c.correo ? c.correo.toLowerCase() === user.correo.toLowerCase() : c.autor === user.nombre}
                  puedeResponder={puedeResponder}
                  enviando={enviando}
                  onResponder={t => enviar({ entidadId: c.entidadId, campo: c.campo, padreId: c.id, texto: t })}
                  onResolver={v => resolver(c, v)}
                />
              ))}
            </div>
          )
        })}
      </div>

      {puedeComentar && unItem && (
        <div className="coment-nuevo">
          {cita && (
            <div className="coment-cita">
              <span>«{cita}»</span>
              <button className="icon-btn" aria-label="Quitar texto citado" onClick={() => setCita(null)}><Icon name="close" size={14} /></button>
            </div>
          )}
          <textarea
            className="textarea"
            style={{ minHeight: 80 }}
            placeholder={cita ? 'Comentario sobre el texto citado' : 'Nuevo comentario sobre este ítem'}
            value={texto}
            onChange={e => setTexto(e.target.value)}
            aria-label="Nuevo comentario"
          />
          <div className="row-between">
            <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Como {rolLabel()}</span>
            <button
              className="btn btn-primary btn-sm"
              disabled={enviando || !texto.trim()}
              onClick={async () => {
                if (await enviar({ entidadId: filtro.entidadId!, campo: filtro.campo!, texto: texto.trim(), cita })) {
                  setTexto('')
                  setCita(null)
                }
              }}
            >
              Comentar
            </button>
          </div>
        </div>
      )}
    </aside>
  )
}

function Hilo(props: {
  raiz: Comentario
  respuestas: Comentario[]
  valorActual: string | null
  esAutor: boolean
  puedeResponder: boolean
  enviando: boolean
  onResponder: (texto: string) => Promise<boolean>
  onResolver: (resuelto: boolean) => void
}) {
  const { raiz: c, respuestas, valorActual, esAutor, puedeResponder, enviando } = props
  const [respondiendo, setRespondiendo] = useState(false)
  const [texto, setTexto] = useState('')
  const citaDistinta = c.cita ? citaCambio(c.cita, valorActual) : false
  const itemDistinto = !c.cita && c.textoItem !== null && valorActual !== null && sinEspacios(textoPlano(c.textoItem)) !== sinEspacios(textoPlano(valorActual))

  return (
    <div className={`coment-hilo${c.resuelto ? ' resuelto' : ''}`}>
      <Mensaje c={c} />
      {c.cita && (
        <blockquote className="coment-cita-hilo">
          «{c.cita}»
          {citaDistinta && <span className="coment-aviso"><Icon name="info" size={13} />El texto citado cambió</span>}
        </blockquote>
      )}
      {itemDistinto && <span className="coment-aviso"><Icon name="info" size={13} />El ítem cambió desde este comentario</span>}
      <p className="coment-texto">{c.texto}</p>

      {respuestas.map(r => (
        <div key={r.id} className="coment-respuesta">
          <Mensaje c={r} />
          <p className="coment-texto">{r.texto}</p>
        </div>
      ))}

      {c.resuelto && (
        <span className="coment-resuelto">
          <Icon name="checkCircle" size={14} />Resuelto{c.resueltoPor ? ` por ${c.resueltoPor}` : ''}{c.fechaResuelto ? ` · ${fechaHora(c.fechaResuelto)}` : ''}
        </span>
      )}

      {respondiendo ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <textarea className="textarea" style={{ minHeight: 64 }} autoFocus placeholder="Escribe tu respuesta" value={texto} onChange={e => setTexto(e.target.value)} aria-label="Respuesta" />
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <button className="btn btn-outline btn-sm" onClick={() => { setRespondiendo(false); setTexto('') }}>Cancelar</button>
            <button
              className="btn btn-primary btn-sm"
              disabled={enviando || !texto.trim()}
              onClick={async () => {
                if (await props.onResponder(texto.trim())) {
                  setTexto('')
                  setRespondiendo(false)
                }
              }}
            >
              Responder
            </button>
          </div>
        </div>
      ) : (
        <div className="coment-acciones">
          {puedeResponder && <button className="link-btn" onClick={() => setRespondiendo(true)}>Responder</button>}
          {esAutor && (
            <button className="link-btn" onClick={() => props.onResolver(!c.resuelto)}>{c.resuelto ? 'Reabrir' : 'Marcar como resuelto'}</button>
          )}
        </div>
      )}
    </div>
  )
}

function Mensaje({ c }: { c: Comentario }) {
  return (
    <div className="coment-autor">
      <span className="shell-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{(c.autor || '?').slice(0, 1).toUpperCase()}</span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
          <b>{c.autor || 'Sin nombre'}</b>
          <span className={`coment-rol ${c.lado}`}>{c.lado === 'docente' ? c.rol || 'Docente' : LADO_LABEL[c.lado]}</span>
        </span>
        <span className="coment-fecha">{fechaHora(c.fecha)}</span>
      </span>
    </div>
  )
}

/** Helper for pages: badge state + quotes of the open comments of one item. */
export function datosItem(comentarios: Comentario[], entidadId: string | null | undefined, campo: string) {
  if (!entidadId) return { estado: { lados: 0, abiertos: 0, resueltos: 0 }, citas: [] as string[] }
  return {
    estado: estadoComentarios(comentarios, entidadId, campo),
    citas: comentarios.filter(c => !c.padreId && !c.resuelto && c.entidadId === entidadId && c.campo === campo && c.cita).map(c => c.cita!),
  }
}

export { CAMPO_GENERAL }
