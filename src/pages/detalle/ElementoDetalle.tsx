import { useParams } from 'react-router-dom'
import ConsignaDetalle from './ConsignaDetalle'
import RubricaDetalle from './RubricaDetalle'
import MatrizDetalle from './MatrizDetalle'
import ListaCotejoDetalle from './ListaCotejoDetalle'
import EscalaDetalle from './EscalaDetalle'

export default function ElementoDetalle() {
  const { seccion } = useParams<{ seccion: string }>()

  switch (seccion) {
    case 'consignas':
      return <ConsignaDetalle />
    case 'rubricas':
      return <RubricaDetalle />
    case 'matriz':
      return <MatrizDetalle />
    case 'lista-cotejo':
      return <ListaCotejoDetalle />
    case 'escala':
      return <EscalaDetalle />
    default:
      return (
        <div className="container" style={{ paddingTop: 'var(--space-5)' }}>
          <p className="muted">Sección no reconocida.</p>
        </div>
      )
  }
}
