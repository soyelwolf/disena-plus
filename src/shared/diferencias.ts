// Word-level comparison between the IA proposal and the teacher's final text.

import { textoPlano } from './textoRico'

export interface Tramo {
  tipo: 'igual' | 'agregado' | 'quitado'
  texto: string
}

export interface Comparacion {
  tramos: Tramo[]
  /** Share of words that changed (0–100), relative to the longer version. */
  cambio: number
  identico: boolean
}

const palabras = (s: string) => textoPlano(s ?? '').split(/\s+/).filter(Boolean)

/** Longest-common-subsequence diff of the words of both texts. */
export function comparar(propuesta: string | null | undefined, final: string | null | undefined): Comparacion {
  const a = palabras(propuesta ?? '')
  const b = palabras(final ?? '')
  const n = a.length
  const m = b.length
  if (n * m > 6_000_000) {
    // Too long for a word diff: show both whole.
    return { tramos: [{ tipo: 'quitado', texto: a.join(' ') }, { tipo: 'agregado', texto: b.join(' ') }], cambio: 100, identico: false }
  }
  const lcs = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1))
  for (let i = n - 1; i >= 0; i--)
    for (let j = m - 1; j >= 0; j--) lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1])

  const tramos: Tramo[] = []
  const poner = (tipo: Tramo['tipo'], w: string) => {
    const ult = tramos[tramos.length - 1]
    if (ult && ult.tipo === tipo) ult.texto += ' ' + w
    else tramos.push({ tipo, texto: w })
  }
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      poner('igual', a[i])
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) poner('quitado', a[i++])
    else poner('agregado', b[j++])
  }
  while (i < n) poner('quitado', a[i++])
  while (j < m) poner('agregado', b[j++])

  const comunes = lcs[0][0]
  const mayor = Math.max(n, m)
  return { tramos, cambio: mayor ? Math.round(((mayor - comunes) / mayor) * 100) : 0, identico: n === m && comunes === n }
}
