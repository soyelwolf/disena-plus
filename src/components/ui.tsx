// Shared Figma-style building blocks: modal, side drawer, toasts, saving
// overlay, breadcrumbs, the course header and progress bars.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Link } from 'react-router-dom'
import Icon from './Icon'
import type { Programa } from '../shared/academico'

// ── Modal ────────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean
  title: string
  children?: ReactNode
  actions: ReactNode
  onClose?: () => void
}

export function Modal({ open, title, children, actions, onClose }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    ref.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose?.()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose?.()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title" tabIndex={-1} ref={ref}>
        <h2 id="modal-title" className="modal-title">{title}</h2>
        {children && <div className="modal-body">{children}</div>}
        <div className="modal-actions">{actions}</div>
      </div>
    </div>
  )
}

// ── Drawer (right side panel) ────────────────────────────────────────────────

interface DrawerProps {
  open: boolean
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
}

export function Drawer({ open, title, children, footer, onClose, className }: DrawerProps & { className?: string }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="overlay overlay-drawer" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <aside className={`drawer${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer-head">
          <h2 style={{ fontSize: 20, fontWeight: 700 }}>{title}</h2>
          <button className="icon-btn" aria-label="Cerrar" onClick={onClose}>
            <Icon name="close" size={22} />
          </button>
        </div>
        <div className="drawer-body">{children}</div>
        {footer && <div className="drawer-foot">{footer}</div>}
      </aside>
    </div>
  )
}

// ── Saving overlay ───────────────────────────────────────────────────────────

export function SavingOverlay({ show, label = 'Guardando información…' }: { show: boolean; label?: string }) {
  if (!show) return null
  return (
    <div className="overlay" aria-live="polite">
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: '#fff' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{label}</span>
        <Spinner />
      </div>
    </div>
  )
}

export function Spinner() {
  return (
    <span className="spinner-card">
      <span className="spinner" style={{ display: 'flex', color: 'var(--color-text)' }}>
        <Icon name="spinner" size={28} strokeWidth={2.4} />
      </span>
    </span>
  )
}

export function Cargando({ texto = 'Buscando resultados' }: { texto?: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '96px 0' }}>
      <span style={{ fontSize: 14, fontWeight: 700 }}>{texto}</span>
      <Spinner />
    </div>
  )
}

export function ErrorPanel({ mensaje, onRetry }: { mensaje: string; onRetry?: () => void }) {
  return (
    <div className="panel" style={{ padding: '48px 24px', textAlign: 'center', display: 'flex', flexDirection: 'column', gap: 12, alignItems: 'center' }}>
      <span style={{ color: 'var(--color-danger)', display: 'flex' }}><Icon name="alert" size={28} /></span>
      <p style={{ fontWeight: 700 }}>No se pudo cargar la información</p>
      <p style={{ color: 'var(--color-text-muted)', maxWidth: 520 }}>{mensaje}</p>
      {onRetry && <button className="btn btn-outline" onClick={onRetry}>Reintentar</button>}
    </div>
  )
}

// ── Toasts ───────────────────────────────────────────────────────────────────

interface ToastItem {
  id: number
  texto: string
  tipo: 'ok' | 'error'
}

const ToastContext = createContext<(texto: string, tipo?: ToastItem['tipo']) => void>(() => {})

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const push = useCallback((texto: string, tipo: ToastItem['tipo'] = 'ok') => {
    const id = Date.now() + Math.random()
    setItems(prev => [...prev, { id, texto, tipo }])
    setTimeout(() => setItems(prev => prev.filter(t => t.id !== id)), 4500)
  }, [])
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <Icon name={t.tipo === 'ok' ? 'check' : 'alert'} size={18} strokeWidth={2.2} />
            <span style={{ flex: 1 }}>{t.texto}</span>
            <button aria-label="Cerrar aviso" onClick={() => setItems(prev => prev.filter(x => x.id !== t.id))}>
              <Icon name="close" size={16} strokeWidth={2.2} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)

// ── Breadcrumbs ──────────────────────────────────────────────────────────────

export function Breadcrumbs({ items }: { items: Array<{ label: string; to?: string }> }) {
  return (
    <nav aria-label="Ruta" className="breadcrumbs">
      {items.map((it, i) => (
        <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          {i > 0 && <Icon name="chevronRight" size={13} strokeWidth={2} />}
          {it.to ? <Link to={it.to}>{it.label}</Link> : <span style={{ fontWeight: 700, color: 'var(--color-text)' }}>{it.label}</span>}
        </span>
      ))}
    </nav>
  )
}

// ── Course header (title + Curso + Enseñanza + Programas) ────────────────────

interface CursoHeaderProps {
  titulo: string
  curso?: string
  tipoEnsenanza: string
  programas: Programa[]
  acciones?: ReactNode
}

export function CursoHeader({ titulo, curso, tipoEnsenanza, programas, acciones }: CursoHeaderProps) {
  const [verTodos, setVerTodos] = useState(false)
  const visibles = programas.slice(0, 2).map(p => p.nombre).join(', ')
  return (
    <div className="row-between" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{titulo}</h1>
        {curso && <span style={{ fontSize: 16, fontWeight: 700, color: '#3d434a' }}>Curso: {curso}</span>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontSize: 14, color: '#3d434a', flexWrap: 'wrap' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Icon name="video" size={16} />Enseñanza: {tipoEnsenanza || '—'}
          </span>
          {programas.length > 0 && (
            <>
              <span style={{ width: 1, height: 16, background: '#c9ced2' }} />
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                <Icon name="soporte" size={16} />
                {programas.length > 2 ? `Programa (${programas.length}): ${visibles}` : `Programa: ${visibles}`}
                {programas.length > 2 && (
                  <button className="link-btn" onClick={() => setVerTodos(true)}>
                    <Icon name="eye" size={15} /> Ver todo
                  </button>
                )}
              </span>
            </>
          )}
        </div>
      </div>
      {acciones && <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>{acciones}</div>}
      <Modal
        open={verTodos}
        title="Programas donde se encuentra el curso:"
        onClose={() => setVerTodos(false)}
        actions={<button className="btn btn-primary" onClick={() => setVerTodos(false)}>Entendido</button>}
      >
        {programas.map(p => p.nombre).join(', ')}.
      </Modal>
    </div>
  )
}

// ── Progress ─────────────────────────────────────────────────────────────────

export function ProgressBar({ value, muted }: { value: number; muted?: boolean }) {
  const pct = Math.max(0, Math.min(100, Math.round(value)))
  return (
    <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      {!muted && <div className="progress-fill" style={{ width: `${pct}%` }} />}
    </div>
  )
}

/** Textarea with the Figma's "0/1000" counter and inline error. */
export function CampoTexto(props: {
  id: string
  label?: string
  value: string
  onChange?: (v: string) => void
  max: number
  error?: string
  readOnly?: boolean
  rows?: number
  placeholder?: string
}) {
  const { id, label, value, onChange, max, error, readOnly, rows = 5, placeholder = 'Ingresa la información' } = props
  const excedido = value.length > max
  const mensaje = error ?? (excedido ? 'Excediste el número de caracteres' : undefined)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && <label className="field-label" htmlFor={id} style={{ marginBottom: 0 }}>{label}</label>}
      {readOnly ? (
        <div className="readonly-box" id={id}>{value || '—'}</div>
      ) : (
        <textarea
          id={id}
          className={`textarea${mensaje ? ' has-error' : ''}`}
          rows={rows}
          value={value}
          placeholder={placeholder}
          onChange={e => onChange?.(e.target.value)}
          aria-invalid={!!mensaje}
        />
      )}
      {!readOnly && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
          <span className="field-error" style={{ margin: 0, visibility: mensaje ? 'visible' : 'hidden' }}>
            <Icon name="alert" size={14} />{mensaje ?? '.'}
          </span>
          <span style={{ color: excedido ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {excedido ? `-${value.length - max}` : value.length}/{max}
          </span>
        </div>
      )}
    </div>
  )
}
