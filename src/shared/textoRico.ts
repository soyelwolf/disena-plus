// src/shared/textoRico.ts
// Rich text is stored as a small, safe subset of HTML: paragraphs, bold,
// italic, underline, bullet and numbered lists (nested to any depth) and
// simple tables. Older content migrated from SharePoint is plain text with
// "- " / "1. " lines; it is converted on the fly when shown or edited, so both
// formats coexist in the database.

const ETIQUETAS_PERMITIDAS = new Set([
  'P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'DIV',
  'TABLE', 'THEAD', 'TBODY', 'TR', 'TD', 'TH',
])

export const esHtml = (v: string): boolean => /<\/?(p|ul|ol|li|strong|b|em|i|u|br|div|table)\b/i.test(v)

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Plain text → HTML. "- item" / "1. item" lines become lists; leading spaces
 * (two per level) nest them, as in the SharePoint exports.
 */
export function textoAHtml(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  const pila: Array<'ul' | 'ol'> = []
  const cerrarHasta = (n: number) => {
    while (pila.length > n) out.push(`</li></${pila.pop()}>`)
  }
  for (const cruda of lineas) {
    const sangria = Math.floor((/^\s*/.exec(cruda)?.[0].replace(/\t/g, '  ').length ?? 0) / 2)
    const linea = cruda.trim()
    const vineta = /^[-•*–]\s+(.*)$/.exec(linea)
    const numero = /^\d+[.)]\s+(.*)$/.exec(linea)
    if (vineta || numero) {
      const tipo = vineta ? 'ul' : 'ol'
      const nivel = Math.min(sangria, pila.length) + 1
      if (pila.length >= nivel) {
        cerrarHasta(nivel)
        if (pila[nivel - 1] !== tipo) {
          cerrarHasta(nivel - 1)
          out.push(`<${tipo}><li>`)
          pila.push(tipo)
        } else out.push('</li><li>')
      } else {
        out.push(`<${tipo}><li>`)
        pila.push(tipo)
      }
      out.push(escapar((vineta ?? numero)![1]))
    } else if (linea === '') {
      cerrarHasta(0)
    } else {
      cerrarHasta(0)
      out.push(`<p>${escapar(linea)}</p>`)
    }
  }
  cerrarHasta(0)
  return out.join('')
}

/** Keep only the allowed tags, drop every attribute (no styles, links or scripts). */
export function sanearHtml(html: string): string {
  if (typeof DOMParser === 'undefined') return html
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html')
  const limpiar = (nodo: Node): string => {
    let s = ''
    nodo.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) s += escapar(n.textContent ?? '')
      else if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as HTMLElement
        const tag = el.tagName
        const hijos = limpiar(el)
        if (!ETIQUETAS_PERMITIDAS.has(tag)) s += hijos
        else if (tag === 'BR') s += '<br>'
        else {
          const t = tag === 'B' ? 'strong' : tag === 'I' ? 'em' : tag === 'DIV' ? 'p' : tag.toLowerCase()
          s += `<${t}>${hijos}</${t}>`
        }
      }
    })
    return s
  }
  return limpiar(doc.body.firstChild as Node)
}

/** Any stored value → safe HTML ready to render or edit. */
export function aHtml(valor: string | null | undefined): string {
  const v = valor ?? ''
  if (!v.trim()) return ''
  return esHtml(v) ? sanearHtml(v) : textoAHtml(v)
}

/**
 * Any stored value → readable plain text: "- " bullets indented two spaces per
 * level, table rows as "a | b | c". Used for counts, search and Excel.
 */
export function textoPlano(valor: string | null | undefined): string {
  const v = valor ?? ''
  if (!esHtml(v) || typeof DOMParser === 'undefined') return v
  const doc = new DOMParser().parseFromString(`<div>${v}</div>`, 'text/html')
  const partes: string[] = []
  const recorrer = (nodo: Node, nivel = 0) => {
    nodo.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = (n.textContent ?? '').replace(/ /g, ' ')
        if (t.trim()) partes.push(t)
        return
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const el = n as HTMLElement
      const tag = el.tagName
      if (tag === 'LI') {
        const ol = el.parentElement?.tagName === 'OL'
        const i = [...(el.parentElement?.children ?? [])].indexOf(el) + 1
        partes.push('\n' + '  '.repeat(Math.max(0, nivel - 1)) + (ol ? `${i}. ` : '- '))
        recorrer(el, nivel)
      } else if (tag === 'UL' || tag === 'OL') {
        recorrer(el, nivel + 1)
      } else if (tag === 'TR') {
        partes.push('\n' + [...el.children].map(c => (c.textContent ?? '').trim()).join(' | '))
      } else if (['P', 'DIV', 'BR', 'TABLE'].includes(tag)) {
        partes.push('\n')
        recorrer(el, nivel)
      } else recorrer(el, nivel)
    })
  }
  recorrer(doc.body.firstChild as Node)
  return partes.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Visible character count (formatting doesn't count). */
export const longitud = (valor: string | null | undefined): number => textoPlano(valor).length

export const estaVacio = (valor: string | null | undefined): boolean => textoPlano(valor).trim() === ''
