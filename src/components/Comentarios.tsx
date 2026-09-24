import { useState } from 'react'
import { ROLE_LABELS, useAuth, type UserRole } from '../shared/AuthContext'
import { agregarComentario, haceCuanto, type Comentario, type InstrumentoFlujo } from '../shared/academico'
import { Drawer, useToast } from './ui'

interface Props {
  open: boolean
  onClose: () => void
  titulo: string
  cursoId: string
  instrumento: InstrumentoFlujo
  entidadId: string
  comentarios: Comentario[]
  onNuevo: () => void
  /** Commenting is available to approvers while the process is under their review. */
  puedeComentar: boolean
}

export default function Comentarios(props: Props) {
  const { open, onClose, titulo, cursoId, instrumento, entidadId, comentarios, onNuevo, puedeComentar } = props
  const { user } = useAuth()
  const toast = useToast()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)
  const lista = comentarios.filter(c => c.entidadId === entidadId)
  const rolAprobador = user?.roles.find(r => r === 'monitor_ea' || r === 'dda') ?? user?.roles[0]

  const enviar = async () => {
    if (!user || !texto.trim()) return
    setEnviando(true)
    try {
      await agregarComentario({
        cursoId,
        instrumento,
        entidadId,
        autor: user.nombre,
        rol: rolAprobador ? ROLE_LABELS[rolAprobador as UserRole] : '',
        texto: texto.trim(),
      })
      setTexto('')
      onNuevo()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo enviar el comentario.', 'error')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Drawer open={open} onClose={onClose} title={titulo} footer={<button className="btn btn-primary" onClick={onClose}>Entendido</button>}>
      {lista.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Aún no hay comentarios.</p>}
      {lista.map(c => (
        <div key={c.id} className="panel" style={{ border: '1px solid var(--color-border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
            <span className="shell-avatar" style={{ width: 26, height: 26, fontSize: 11 }}>{c.autor.slice(0, 1).toUpperCase()}</span>
            <b>{c.rol || c.autor}</b>
            <span style={{ color: 'var(--color-text-muted)' }}>{haceCuanto(c.fecha)}</span>
          </span>
          <p style={{ fontSize: 14, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>{c.texto}</p>
        </div>
      ))}
      {puedeComentar && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
          <label className="field-label" htmlFor="nuevo-comentario" style={{ marginBottom: 0 }}>Nuevo comentario</label>
          <textarea id="nuevo-comentario" className="textarea" style={{ minHeight: 90 }} value={texto} onChange={e => setTexto(e.target.value)} />
          <button className="btn btn-outline" style={{ alignSelf: 'flex-end' }} disabled={enviando || !texto.trim()} onClick={enviar}>
            Comentar
          </button>
        </div>
      )}
    </Drawer>
  )
}
