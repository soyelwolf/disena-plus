// src/shared/textoRico.ts
// Rich text is stored as a small, safe subset of HTML (paragraphs, bold,
// italic, underline, bullet and numbered lists). Older content migrated from
// SharePoint is plain text with "- " / "1. " lines; it is converted on the fly
// when shown or edited, so both formats coexist in the database.

const ETIQUETAS_PERMITIDAS = new Set(['P', 'BR', 'UL', 'OL', 'LI', 'STRONG', 'B', 'EM', 'I', 'U', 'DIV'])

export const esHtml = (v: string): boolean => /<\/?(p|ul|ol|li|strong|b|em|i|u|br|div)\b/i.test(v)

const escapar = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Plain text (with "- item" / "1. item" lines) → HTML paragraphs and lists. */
export function textoAHtml(texto: string): string {
  const lineas = texto.replace(/\r\n?/g, '\n').split('\n')
  const out: string[] = []
  let lista: 'ul' | 'ol' | null = null
  const cerrar = () => {
    if (lista) out.push(`</${lista}>`)
    lista = null
  }
  for (const cruda of lineas) {
    const linea = cruda.trim()
    const vineta = /^[-•*–]\s+(.*)$/.exec(linea)
    const numero = /^\d+[.)]\s+(.*)$/.exec(linea)
    if (vineta || numero) {
      const tipo = vineta ? 'ul' : 'ol'
      if (lista !== tipo) {
        cerrar()
        out.push(`<${tipo}>`)
        lista = tipo
      }
      out.push(`<li>${escapar((vineta ?? numero)![1])}</li>`)
    } else if (linea === '') {
      cerrar()
    } else {
      cerrar()
      out.push(`<p>${escapar(linea)}</p>`)
    }
  }
  cerrar()
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

/** Any stored value → readable plain text ("- " for bullets). Used for counts, search and Excel. */
export function textoPlano(valor: string | null | undefined): string {
  const v = valor ?? ''
  if (!esHtml(v) || typeof DOMParser === 'undefined') return v
  const doc = new DOMParser().parseFromString(`<div>${v}</div>`, 'text/html')
  const partes: string[] = []
  const recorrer = (nodo: Node, prefijo = '') => {
    nodo.childNodes.forEach(n => {
      if (n.nodeType === Node.TEXT_NODE) {
        const t = n.textContent ?? ''
        if (t.trim()) partes.push(prefijo + t)
        prefijo = ''
        return
      }
      if (n.nodeType !== Node.ELEMENT_NODE) return
      const el = n as HTMLElement
      if (el.tagName === 'LI') {
        const ol = el.parentElement?.tagName === 'OL'
        const i = [...(el.parentElement?.children ?? [])].indexOf(el) + 1
        partes.push('\n' + (ol ? `${i}. ` : '- '))
        recorrer(el)
      } else if (['P', 'DIV', 'UL', 'OL', 'BR'].includes(el.tagName)) {
        partes.push('\n')
        recorrer(el)
      } else recorrer(el)
    })
  }
  recorrer(doc.body.firstChild as Node)
  return partes.join('').replace(/\n{3,}/g, '\n\n').trim()
}

/** Visible character count (formatting doesn't count). */
export const longitud = (valor: string | null | undefined): number => textoPlano(valor).length

export const estaVacio = (valor: string | null | undefined): boolean => textoPlano(valor).trim() === ''
