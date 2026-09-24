// Rich text field used everywhere content is written (consignas, criteria…):
// bold / italic / underline, bullet and numbered lists nested with Tab /
// Shift+Tab, simple tables, clean paste; grows with its content and counts
// visible characters only. Stores the safe HTML subset from shared/textoRico.

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import Icon from './Icon'
import { aHtml, estaVacio, longitud, sanearHtml, textoAHtml } from '../shared/textoRico'

interface Props {
  id: string
  label?: string
  value: string
  onChange?: (html: string) => void
  max?: number
  error?: string
  readOnly?: boolean
  minHeight?: number
  placeholder?: string
  /** Compact toolbar for narrow cells (criteria grid). */
  compacto?: boolean
}

const COMANDOS = ['bold', 'italic', 'underline', 'insertUnorderedList', 'insertOrderedList'] as const
type Comando = (typeof COMANDOS)[number]

const TABLA_NUEVA =
  '<table><tbody>' +
  '<tr><th><br></th><th><br></th><th><br></th></tr>' +
  '<tr><td><br></td><td><br></td><td><br></td></tr>' +
  '<tr><td><br></td><td><br></td><td><br></td></tr>' +
  '</tbody></table><p><br></p>'

export default function TextoEnriquecido(props: Props) {
  const { id, label, value, onChange, max, error, readOnly, minHeight = 120, placeholder = 'Ingresa la información', compacto } = props
  const ref = useRef<HTMLDivElement>(null)
  const ultimo = useRef<string | null>(null)
  const [activos, setActivos] = useState<Set<Comando>>(new Set())
  const [enTabla, setEnTabla] = useState(false)
  const [foco, setFoco] = useState(false)

  // Push the stored value into the editor only when it changes from outside
  // (never while typing — that would fight the caret).
  useEffect(() => {
    const el = ref.current
    if (!el || value === ultimo.current) return
    el.innerHTML = aHtml(value)
    ultimo.current = value
  }, [value, readOnly])

  const celdaActual = (): HTMLTableCellElement | null => {
    const nodo = window.getSelection()?.anchorNode
    const el = nodo instanceof Element ? nodo : nodo?.parentElement
    const celda = el?.closest('td, th') as HTMLTableCellElement | null
    return celda && ref.current?.contains(celda) ? celda : null
  }

  const refrescarEstado = () => {
    setActivos(new Set(COMANDOS.filter(c => document.queryCommandState(c))))
    setEnTabla(!!celdaActual())
  }

  useEffect(() => {
    if (!foco) return
    document.addEventListener('selectionchange', refrescarEstado)
    return () => document.removeEventListener('selectionchange', refrescarEstado)
  })

  const emitir = () => {
    const el = ref.current
    if (!el) return
    const html = estaVacio(el.innerHTML) && !el.querySelector('table') ? '' : sanearHtml(el.innerHTML)
    ultimo.current = html
    onChange?.(html)
  }

  const aplicar = (c: string, arg?: string) => {
    ref.current?.focus()
    document.execCommand(c, false, arg)
    emitir()
    refrescarEstado()
  }

  const colocarEn = (celda: Element | null) => {
    if (!celda) return
    const r = document.createRange()
    r.selectNodeContents(celda)
    r.collapse(true)
    const sel = window.getSelection()
    sel?.removeAllRanges()
    sel?.addRange(r)
  }

  // ── Table operations (on the cell holding the caret) ──
  const agregarFila = () => {
    const celda = celdaActual()
    const fila = celda?.closest('tr')
    if (!fila) return
    const nueva = document.createElement('tr')
    for (let i = 0; i < fila.children.length; i++) nueva.appendChild(Object.assign(document.createElement('td'), { innerHTML: '<br>' }))
    fila.after(nueva)
    colocarEn(nueva.firstElementChild)
    emitir()
  }
  const agregarColumna = () => {
    const celda = celdaActual()
    const tabla = celda?.closest('table')
    if (!celda || !tabla) return
    const idx = celda.cellIndex
    tabla.querySelectorAll('tr').forEach(tr => {
      const tipo = tr.children[0]?.tagName === 'TH' ? 'th' : 'td'
      const nueva = Object.assign(document.createElement(tipo), { innerHTML: '<br>' })
      tr.children[idx]?.after(nueva)
    })
    emitir()
  }
  const quitarFila = () => {
    const fila = celdaActual()?.closest('tr')
    const tabla = fila?.closest('table')
    if (!fila || !tabla) return
    if (tabla.querySelectorAll('tr').length <= 1) tabla.remove()
    else fila.remove()
    emitir()
  }
  const quitarColumna = () => {
    const celda = celdaActual()
    const tabla = celda?.closest('table')
    if (!celda || !tabla) return
    const idx = celda.cellIndex
    const filas = [...tabla.querySelectorAll('tr')]
    if ((filas[0]?.children.length ?? 0) <= 1) tabla.remove()
    else filas.forEach(tr => tr.children[idx]?.remove())
    emitir()
  }
  const quitarTabla = () => {
    celdaActual()?.closest('table')?.remove()
    emitir()
    setEnTabla(false)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return
    e.preventDefault()
    const celda = celdaActual()
    if (celda) {
      // Tab moves between cells; Tab on the last cell adds a row.
      const celdas = [...(celda.closest('table')?.querySelectorAll('td, th') ?? [])]
      const i = celdas.indexOf(celda)
      if (e.shiftKey) colocarEn(celdas[i - 1] ?? celda)
      else if (i === celdas.length - 1) agregarFila()
      else colocarEn(celdas[i + 1])
      return
    }
    const nodo = window.getSelection()?.anchorNode
    const el = nodo instanceof Element ? nodo : nodo?.parentElement
    if (el?.closest('li')) aplicar(e.shiftKey ? 'outdent' : 'indent')
    else if (!e.shiftKey) aplicar('insertText', '    ')
  }

  const n = longitud(value)
  const excedido = max !== undefined && n > max
  const mensaje = error ?? (excedido ? 'Excediste el número de caracteres' : undefined)

  if (readOnly) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {label && <span className="field-label" style={{ marginBottom: 0 }}>{label}</span>}
        <div className="readonly-box rte-view" dangerouslySetInnerHTML={{ __html: aHtml(value) || '—' }} />
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {label && (
        <label className="field-label" htmlFor={id} style={{ marginBottom: 0 }} onClick={() => ref.current?.focus()}>
          {label}
        </label>
      )}
      <div className={`rte${mensaje ? ' has-error' : ''}${foco ? ' focused' : ''}`}>
        <div className="rte-toolbar" role="toolbar" aria-label={`Formato${label ? ` de ${label}` : ''}`}>
          <Boton label="Negrita (Ctrl+B)" activo={activos.has('bold')} onClick={() => aplicar('bold')}><b>B</b></Boton>
          <Boton label="Cursiva (Ctrl+I)" activo={activos.has('italic')} onClick={() => aplicar('italic')}><i>I</i></Boton>
          <Boton label="Subrayado (Ctrl+U)" activo={activos.has('underline')} onClick={() => aplicar('underline')}><u>U</u></Boton>
          <span className="rte-sep" />
          <Boton label="Lista con viñetas" activo={activos.has('insertUnorderedList')} onClick={() => aplicar('insertUnorderedList')}>
            <Icon name="listaVinetas" size={16} strokeWidth={2} />
          </Boton>
          <Boton label="Lista numerada" activo={activos.has('insertOrderedList')} onClick={() => aplicar('insertOrderedList')}>
            <Icon name="listaNumerada" size={16} strokeWidth={2} />
          </Boton>
          <Boton label="Disminuir nivel (Shift+Tab)" onClick={() => aplicar('outdent')}><Icon name="outdent" size={16} strokeWidth={2} /></Boton>
          <Boton label="Aumentar nivel (Tab)" onClick={() => aplicar('indent')}><Icon name="indent" size={16} strokeWidth={2} /></Boton>
          <span className="rte-sep" />
          <Boton label="Insertar tabla" onClick={() => aplicar('insertHTML', TABLA_NUEVA)}><Icon name="tabla" size={16} strokeWidth={2} /></Boton>
          {enTabla && (
            <>
              <Boton label="Agregar fila debajo" onClick={agregarFila}><span className="rte-txt">+ Fila</span></Boton>
              <Boton label="Agregar columna a la derecha" onClick={agregarColumna}><span className="rte-txt">+ Col</span></Boton>
              <Boton label="Quitar fila" onClick={quitarFila}><span className="rte-txt">− Fila</span></Boton>
              <Boton label="Quitar columna" onClick={quitarColumna}><span className="rte-txt">− Col</span></Boton>
              <Boton label="Eliminar tabla" onClick={quitarTabla}><Icon name="trash" size={15} strokeWidth={2} /></Boton>
            </>
          )}
          {!compacto && (
            <>
              <span className="rte-sep" />
              <Boton label="Quitar formato" onClick={() => aplicar('removeFormat')}><Icon name="borrarFormato" size={16} strokeWidth={2} /></Boton>
            </>
          )}
        </div>
        <div
          id={id}
          ref={ref}
          className="rte-area"
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label={label}
          aria-invalid={!!mensaje}
          data-placeholder={placeholder}
          style={{ minHeight }}
          onInput={emitir}
          onKeyDown={onKeyDown}
          onFocus={() => setFoco(true)}
          onBlur={() => setFoco(false)}
          onPaste={e => {
            // Keep structure (lists, bold, tables) but drop Word/web styles and links.
            e.preventDefault()
            const html = e.clipboardData.getData('text/html')
            const texto = e.clipboardData.getData('text/plain')
            document.execCommand('insertHTML', false, html ? sanearHtml(html) : textoAHtml(texto))
            emitir()
          }}
        />
      </div>
      {max !== undefined && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12 }}>
          <span className="field-error" style={{ margin: 0, visibility: mensaje ? 'visible' : 'hidden' }}>
            <Icon name="alert" size={14} />{mensaje ?? '.'}
          </span>
          <span style={{ color: excedido ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
            {excedido ? `-${n - max}` : n}/{max}
          </span>
        </div>
      )}
      {max === undefined && mensaje && <span className="field-error"><Icon name="alert" size={14} />{mensaje}</span>}
    </div>
  )
}

function Boton({ label, activo, onClick, children }: { label: string; activo?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={`rte-btn${activo ? ' active' : ''}`}
      aria-label={label}
      aria-pressed={activo}
      title={label}
      onMouseDown={e => e.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

/** Read-only rendering of stored rich text (or legacy plain text). */
export function VistaRica({ valor, className }: { valor: string | null | undefined; className?: string }) {
  return <div className={`rte-view ${className ?? ''}`} dangerouslySetInnerHTML={{ __html: aHtml(valor) || '—' }} />
}
