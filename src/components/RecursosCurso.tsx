import { useEffect, useState } from 'react'
import Icon from './Icon'
import VisorPdf from './VisorPdf'
import { VistaRica } from './TextoEnriquecido'
import { Drawer } from './ui'
import { DOCUMENTOS, listarDocumentos, nombreDescarga, type DocumentoCurso, type TipoDocumento } from '../shared/documentosCurso'
import { estaVacio } from '../shared/textoRico'

// One load of the course PDFs shared by every screen (the list is small).
let cacheDocs: Promise<Map<string, DocumentoCurso>> | null = null
const cargarDocs = () => (cacheDocs ??= listarDocumentos().catch(() => new Map<string, DocumentoCurso>()))

/**
 * Reference material while working on an element: the course's Sílabo and Formato de
 * orientación (PDFs), and "Qué se evaluará" — the Formato de orientación broken down for
 * this element (QUE_SE_EVALUARA of its consigna). Shown on every instrument screen.
 */
export default function RecursosCurso(props: { cursoId: string; curso: string; elemento?: string; queSeEvaluara?: string | null; compacto?: boolean }) {
  const { cursoId, curso, elemento, queSeEvaluara, compacto } = props
  const [docs, setDocs] = useState<Map<string, DocumentoCurso> | null>(null)
  const [visor, setVisor] = useState<DocumentoCurso | null>(null)
  const [verQue, setVerQue] = useState(false)
  useEffect(() => {
    cargarDocs().then(setDocs)
  }, [])
  const clase = `btn btn-outline btn-sm${compacto ? ' recurso-compacto' : ''}`
  const hayQue = !estaVacio(queSeEvaluara ?? '')

  return (
    <span className="recursos-curso">
      {elemento !== undefined && (
        <button
          className={clase}
          disabled={!hayQue}
          title={hayQue ? 'Qué se evaluará en este elemento (Formato de orientación desagregado)' : 'Este elemento aún no tiene «Qué se evaluará» cargado'}
          onClick={() => setVerQue(true)}
        >
          <Icon name="target" size={15} />Qué se evaluará
        </button>
      )}
      {(['silabo', 'formato'] as TipoDocumento[]).map(t => {
        const doc = docs?.get(`${cursoId}|${t}`)
        return (
          <button
            key={t}
            className={clase}
            disabled={!doc}
            title={doc ? `Ver ${DOCUMENTOS[t].label}` : docs ? `Este curso aún no tiene ${DOCUMENTOS[t].label.toLowerCase()} cargado` : 'Cargando…'}
            onClick={() => doc && setVisor(doc)}
          >
            <Icon name="pdf" size={15} />{DOCUMENTOS[t].label}
          </button>
        )
      })}
      {visor && (
        <VisorPdf titulo={`${DOCUMENTOS[visor.tipo].label} · ${curso}`} url={visor.url} nombreArchivo={nombreDescarga(visor.tipo, curso)} onClose={() => setVisor(null)} />
      )}
      <Drawer
        open={verQue}
        className="drawer-ancho"
        onClose={() => setVerQue(false)}
        title={`Qué se evaluará · ${elemento ?? ''}`}
        footer={<button className="btn btn-primary" onClick={() => setVerQue(false)}>Cerrar</button>}
      >
        <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Formato de orientación desagregado para este elemento. Úsalo como guía al escribir la consigna y el instrumento.</p>
        <div className="readonly-box" style={{ whiteSpace: 'normal' }}>
          <VistaRica valor={queSeEvaluara} />
        </div>
      </Drawer>
    </span>
  )
}
