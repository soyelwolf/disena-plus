import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import Comentarios from '../components/Comentarios'
import { Breadcrumbs, Cargando, CursoHeader, Drawer, ErrorPanel, Modal, SavingOverlay, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  NIVELES,
  PUNTAJE_OBJETIVO,
  eliminarCriterio,
  finalizarInstrumento,
  getComentarios,
  getRubricasCurso,
  habilitarEdicion,
  instrumentosRequeridos,
  marcarCompetencia,
  problemaElemento,
  totalEstandar,
  type Comentario,
  type CompetenciaCurso,
  type CriterioRow,
  type RubricaElemento,
  type RubricasCurso,
} from '../shared/academico'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'

interface EstadoNavegacion {
  toast?: string
  abrir?: string
}

export default function RubricasPage() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user, can } = useAuth()
  const { ctx, proceso, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, 'rubricas')

  const [datos, setDatos] = useState<RubricasCurso | null>(null)
  const [errorDatos, setErrorDatos] = useState<string | null>(null)
  const [programa, setPrograma] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [intentoFinalizar, setIntentoFinalizar] = useState(false)
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia_pendiente'>(null)
  const [eliminar, setEliminar] = useState<CriterioRow | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [iaPara, setIaPara] = useState<RubricaElemento | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [comentariosDe, setComentariosDe] = useState<{ id: string; titulo: string } | null>(null)

  useEffect(() => {
    document.title = 'Rúbricas — Diseña+'
  }, [])

  const cargar = useCallback(async () => {
    if (!ctx) return
    try {
      setDatos(await getRubricasCurso(ctx))
      setErrorDatos(null)
    } catch (err) {
      setErrorDatos(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [ctx])
  useEffect(() => {
    cargar()
  }, [cargar])

  const cargarComentarios = useCallback(() => {
    if (cursoId) getComentarios(cursoId, 'rubricas').then(setComentarios).catch(() => setComentarios([]))
  }, [cursoId])
  useEffect(cargarComentarios, [cargarComentarios])

  useEffect(() => {
    if (ctx && !programa) setPrograma(ctx.programas[0]?.id ?? '')
  }, [ctx, programa])

  // Coming back from "Agregar/Editar criterio": toast + open that criterion.
  const procesado = useRef(false)
  useEffect(() => {
    const st = location.state as EstadoNavegacion | null
    if (!st || procesado.current || !datos) return
    procesado.current = true
    if (st.toast) toast(st.toast)
    if (st.abrir) {
      setAbiertos(new Set([st.abrir]))
      setTimeout(() => document.getElementById(`criterio-${st.abrir}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    }
    navigate(location.pathname, { replace: true, state: null })
  }, [location, datos, navigate, toast])

  if (loading) return <Cargando texto="Cargando rúbricas" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (errorDatos) return <ErrorPanel mensaje={errorDatos} onRetry={cargar} />
  if (!datos) return <Cargando texto="Cargando rúbricas" />

  const problemas = datos.elementos.map(problemaElemento)
  const todoCompleto = datos.elementos.length > 0 && problemas.every(p => p === null)
  const esMonitor = !!user?.roles.includes('monitor_ea')
  const puedeHabilitar = esMonitor && proceso.disponible && (proceso.estado !== 'en_edicion' || proceso.finalizado.rubricas)
  const puedeComentar = can('aprobar_proceso') && proceso.estado.startsWith('revision')
  const elementosConComentario = datos.elementos.filter(r =>
    r.criterios.some(c => comentarios.some(k => k.entidadId === c.dpl_rubricacriterioid)),
  ).length

  const pedirFinalizar = () => {
    if (!todoCompleto) {
      setIntentoFinalizar(true)
      setModal('incompleto')
    } else setModal('confirmar')
  }

  const finalizar = async () => {
    if (!user) return
    setModal(null)
    setTrabajando(true)
    try {
      const { enviado } = await finalizarInstrumento(ctx.id, 'rubricas', instrumentosRequeridos(ctx, datos), proceso, user.correo)
      await recargar()
      setModal(enviado ? 'enviado' : 'finalizado')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo finalizar.', 'error')
    } finally {
      setTrabajando(false)
    }
  }

  const confirmarEliminar = async () => {
    if (!eliminar) return
    const c = eliminar
    setEliminar(null)
    setTrabajando(true)
    try {
      await eliminarCriterio(c)
      await cargar()
      toast('Se eliminó el criterio con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error')
    } finally {
      setTrabajando(false)
    }
  }

  const toggleCompetencia = async (criterio: CriterioRow, comp: CompetenciaCurso, marcado: boolean) => {
    const existente = datos.selecciones.find(
      s =>
        s.criterioId === criterio.dpl_rubricacriterioid &&
        s.competenciaId === comp.competenciaId &&
        (s.programaId === comp.programaId || s.programaId === null),
    )
    try {
      await marcarCompetencia({
        criterioId: criterio.dpl_rubricacriterioid,
        competencia: comp,
        marcado,
        existente,
        porPrograma: datos.seleccionPorPrograma,
      })
      await cargar()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar la competencia.', 'error')
    }
  }

  const habilitar = async () => {
    if (!user) return
    try {
      await habilitarEdicion(ctx.id, user.correo)
      toast('Edición habilitada.')
      await recargar()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo habilitar la edición.', 'error')
    }
  }

  const competenciasPrograma = datos.competencias.filter(c => !programa || c.programaId === programa)

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Rúbrica' },
        ]}
      />
      <CursoHeader
        titulo="Rúbrica"
        curso={ctx.nombre}
        tipoEnsenanza={ctx.tipoEnsenanza}
        programas={[]}
        acciones={
          puedeHabilitar ? (
            <button className="btn btn-primary" style={{ height: 44 }} onClick={habilitar}>Habilitar edición</button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ height: 44 }}
              disabled={!puede || !proceso.disponible || datos.elementos.length === 0}
              title={!proceso.disponible ? 'Falta ejecutar supabase/schema-flujo.sql' : motivo || undefined}
              onClick={pedirFinalizar}
            >
              Finalizar edición general
            </button>
          )
        }
      />

      {ctx.programas.length > 0 && (
        <div className="tabs" role="tablist">
          {ctx.programas.map(p => (
            <button
              key={p.id}
              role="tab"
              aria-selected={programa === p.id}
              className={`tab${programa === p.id ? ' active' : ''}`}
              onClick={() => setPrograma(p.id)}
            >
              {p.nombre}
              {intentoFinalizar && !todoCompleto ? (
                <span className="tab-warn" title="Toda la información de los elementos de evaluación debe completarse">
                  <Icon name="alert" size={12} strokeWidth={2.4} />
                </span>
              ) : todoCompleto ? (
                <span style={{ color: 'var(--color-success)', display: 'flex' }}><Icon name="checkCircle" size={16} strokeWidth={2.2} /></span>
              ) : null}
            </button>
          ))}
        </div>
      )}

      {!puede && motivo && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
          <Icon name="info" size={16} />{motivo}
        </div>
      )}
      {elementosConComentario > 0 && (
        <div className="alert-banner alert-info" style={{ padding: '10px 14px' }}>
          <Icon name="info" size={16} />Tienes comentarios en {elementosConComentario} {elementosConComentario === 1 ? 'elemento' : 'elementos'}
        </div>
      )}

      {datos.elementos.length === 0 && (
        <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Ningún elemento de este curso usa rúbrica. El instrumento se elige en cada consigna.
        </div>
      )}

      {datos.elementos.map((r, i) => (
        <section key={r.elemento.sesionId} className="panel rubrica-card animate-in">
          <div className="row-between">
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{r.elemento.nombre}</h2>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <Icon name="clipboard" size={16} />Total:
              <span className="chip chip-pt">{totalEstandar(r.criterios)} pt</span>
            </span>
          </div>

          {intentoFinalizar && problemas[i] === 'suma' && (
            <div className="alert-banner alert-danger">
              <Icon name="alert" size={15} />La suma del estándar esperado de los criterios, en cada elemento de evaluación debe ser igual a {PUNTAJE_OBJETIVO} pts.
            </div>
          )}

          {r.criterios.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
              <span style={{ fontSize: 14 }}>Criterios:</span>
              {r.criterios.map(c => (
                <CriterioAcordeon
                  key={c.dpl_rubricacriterioid}
                  criterio={c}
                  abierto={abiertos.has(c.dpl_rubricacriterioid)}
                  onToggle={() =>
                    setAbiertos(prev => {
                      const next = new Set(prev)
                      if (next.has(c.dpl_rubricacriterioid)) next.delete(c.dpl_rubricacriterioid)
                      else next.add(c.dpl_rubricacriterioid)
                      return next
                    })
                  }
                  editable={puede}
                  competencias={competenciasPrograma}
                  seleccionadas={
                    new Set(
                      datos.selecciones
                        .filter(s => s.criterioId === c.dpl_rubricacriterioid && (s.programaId === programa || s.programaId === null || !programa))
                        .map(s => s.competenciaId),
                    )
                  }
                  onCompetencia={(comp, marcado) => toggleCompetencia(c, comp, marcado)}
                  numComentarios={comentarios.filter(k => k.entidadId === c.dpl_rubricacriterioid).length}
                  puedeComentar={puedeComentar}
                  onComentarios={() => setComentariosDe({ id: c.dpl_rubricacriterioid, titulo: `Comentarios: Criterio N°${c.dpl_orden ?? ''}` })}
                  onEditar={() => navigate(`/cursos/${ctx.id}/rubricas/${r.elemento.sesionId}/criterio/${c.dpl_rubricacriterioid}`)}
                  onEliminar={() => setEliminar(c)}
                />
              ))}
            </div>
          )}

          {puede && (
            <AgregarCriterio
              onManual={() => navigate(`/cursos/${ctx.id}/rubricas/${r.elemento.sesionId}/criterio`)}
              onIA={() => setIaPara(r)}
            />
          )}

          {intentoFinalizar && problemas[i] === 'sin_criterios' && (
            <div className="alert-banner alert-danger">
              <Icon name="alert" size={15} />Debes crear criterios para este elemento
            </div>
          )}
        </section>
      ))}

      <Modal
        open={modal === 'incompleto'}
        title="Debes crear la rúbrica en todos los programas para poder finalizar con la edición"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        La suma del estándar esperado de los criterios, en cada elemento de evaluación debe ser igual a {PUNTAJE_OBJETIVO} pts.
      </Modal>
      <Modal
        open={modal === 'confirmar'}
        title="¿Finalizar edición general de rúbrica?"
        onClose={() => setModal(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={finalizar}>Sí, finalizar</button>
          </>
        }
      >
        La información no se podrá volver a editar luego de finalizar.
      </Modal>
      <Modal
        open={modal === 'enviado'}
        title="Se avisó a los aprobadores para que revisen la información."
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        La edición estará deshabilitada para que pueda ser revisada de forma correcta.
      </Modal>
      <Modal
        open={modal === 'finalizado'}
        title="Rúbricas finalizadas"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cuando finalices también las Consignas, se avisará a los aprobadores para que revisen todo el proceso.
      </Modal>
      <Modal
        open={!!eliminar}
        title="¿Eliminar criterio?"
        onClose={() => setEliminar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setEliminar(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={confirmarEliminar}>Sí, eliminar</button>
          </>
        }
      >
        El criterio se eliminará de la lista actual.
      </Modal>
      <Modal
        open={modal === 'ia_pendiente'}
        title="Generación con IA aún no disponible"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Muy pronto la IA podrá proponer los criterios de la rúbrica. Por ahora, usa «De forma manual».
      </Modal>

      <GenerarIA
        elemento={iaPara}
        onClose={() => setIaPara(null)}
        onGenerar={() => {
          setIaPara(null)
          setModal('ia_pendiente')
        }}
      />
      {comentariosDe && (
        <Comentarios
          open
          onClose={() => setComentariosDe(null)}
          titulo={comentariosDe.titulo}
          cursoId={ctx.id}
          instrumento="rubricas"
          entidadId={comentariosDe.id}
          comentarios={comentarios}
          onNuevo={cargarComentarios}
          puedeComentar={puedeComentar}
        />
      )}
      <SavingOverlay show={trabajando} />
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

function AgregarCriterio({ onManual, onIA }: { onManual: () => void; onIA: () => void }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])
  return (
    <div style={{ position: 'relative', alignSelf: 'flex-start' }} ref={ref}>
      <button className="btn btn-outline" style={{ height: 38 }} aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <Icon name={open ? 'chevronUp' : 'chevronDown'} size={16} strokeWidth={2} />Agregar criterio
      </button>
      {open && (
        <div className="menu" style={{ left: 0, right: 'auto' }}>
          <button onClick={() => { setOpen(false); onIA() }}>Con uso de IA</button>
          <button onClick={() => { setOpen(false); onManual() }}>De forma manual</button>
        </div>
      )}
    </div>
  )
}

interface CriterioProps {
  criterio: CriterioRow
  abierto: boolean
  onToggle: () => void
  editable: boolean
  competencias: CompetenciaCurso[]
  seleccionadas: Set<string>
  onCompetencia: (c: CompetenciaCurso, marcado: boolean) => void
  numComentarios: number
  puedeComentar: boolean
  onComentarios: () => void
  onEditar: () => void
  onEliminar: () => void
}

function CriterioAcordeon(props: CriterioProps) {
  const { criterio: c, abierto, onToggle, editable, competencias, seleccionadas } = props
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])

  return (
    <div className="criterio" id={`criterio-${c.dpl_rubricacriterioid}`}>
      <div className="criterio-head">
        <button className="criterio-toggle" aria-expanded={abierto} onClick={onToggle}>
          <span className="criterio-num">N°{c.dpl_orden ?? ''}</span>
          <span style={{ flex: 1, textAlign: 'left', fontSize: 14, fontWeight: 700 }}>{c.dpl_criterio || 'Criterio sin nombre'}</span>
        </button>
        {(props.numComentarios > 0 || props.puedeComentar) && (
          <button className="icon-btn" aria-label="Ver comentarios" title="Comentarios" onClick={props.onComentarios}>
            <Icon name="comment" size={18} />
          </button>
        )}
        {editable && (
          <div style={{ position: 'relative' }} ref={ref}>
            <button className="icon-btn" aria-label="Más opciones" onClick={() => setMenu(m => !m)}>
              <Icon name="dots" size={20} strokeWidth={2.4} />
            </button>
            {menu && (
              <div className="menu">
                <button onClick={() => { setMenu(false); props.onEditar() }}>Editar</button>
                <button onClick={() => { setMenu(false); props.onEliminar() }}>Eliminar</button>
              </div>
            )}
          </div>
        )}
        <button className="icon-btn" aria-label={abierto ? 'Contraer' : 'Expandir'} onClick={onToggle}>
          <Icon name={abierto ? 'chevronUp' : 'chevronDown'} size={20} strokeWidth={2} />
        </button>
      </div>

      {abierto && (
        <div className="criterio-body">
          <div>
            <p style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Descripción del criterio</p>
            <p style={{ fontSize: 13, lineHeight: 1.55 }}>{c.dpl_definicioncriterio || '—'}</p>
          </div>
          <div className="niveles">
            {NIVELES.map(n => (
              <div key={n.texto} className="nivel">
                <div className="nivel-head">{n.label}</div>
                <div className="nivel-body">
                  <span className="chip chip-pt" style={{ alignSelf: 'flex-start' }}>{Number(c[n.puntaje] ?? 0)} pt</span>
                  <span style={{ whiteSpace: 'pre-wrap' }}>{(c[n.texto] as string) || '—'}</span>
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontSize: 14 }}>Competencias relacionadas al criterio:</p>
            {competencias.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>
                Este programa aún no tiene competencias cargadas para el curso.
              </p>
            )}
            {competencias.map(comp => {
              const marcado = seleccionadas.has(comp.competenciaId)
              return (
                <label key={`${comp.programaId}-${comp.competenciaId}`} className={`competencia${marcado ? ' marcada' : ''}`}>
                  <input
                    type="checkbox"
                    checked={marcado}
                    disabled={!editable}
                    onChange={e => props.onCompetencia(comp, e.target.checked)}
                  />
                  <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{comp.tipo}</span>
                    <b style={{ fontSize: 13 }}>{comp.nombre}</b>
                    <span style={{ fontSize: 13, fontWeight: 400 }}>{comp.descripcion}</span>
                    <span style={{ fontSize: 12, color: 'var(--color-text-muted)', display: 'flex', gap: 18, fontWeight: 400 }}>
                      <span>Nivel: {comp.nivel ?? '—'}</span>
                      <span>Curso evidencia: {comp.cursoEvidencia ? 'Sí' : 'No'}</span>
                      <span>Competencia evidencia: {comp.competenciaEvidencia ? 'Sí' : 'No'}</span>
                    </span>
                  </span>
                </label>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

function GenerarIA({ elemento, onClose, onGenerar }: { elemento: RubricaElemento | null; onClose: () => void; onGenerar: () => void }) {
  const [modo, setModo] = useState<'auto' | 'contexto' | null>(null)
  const [texto, setTexto] = useState('')
  useEffect(() => {
    if (elemento) {
      setModo(null)
      setTexto('')
    }
  }, [elemento])
  return (
    <Drawer
      open={!!elemento}
      onClose={onClose}
      title="Generar contenido con IA"
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={!modo || (modo === 'contexto' && !texto.trim())} onClick={onGenerar}>Generar</button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 24, fontSize: 14 }}>
        <label className="radio"><input type="radio" name="modo-ia" checked={modo === 'auto'} onChange={() => setModo('auto')} />Automático</label>
        <label className="radio"><input type="radio" name="modo-ia" checked={modo === 'contexto'} onChange={() => setModo('contexto')} />Con contexto</label>
      </div>
      {modo === 'auto' && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'flex-start', padding: '12px 14px' }}>
          <Icon name="info" size={16} />La IA creará una propuesta base del contenido
        </div>
      )}
      {modo === 'contexto' && (
        <>
          <div className="alert-banner alert-info" style={{ justifyContent: 'flex-start', padding: '12px 14px', alignItems: 'flex-start' }}>
            <Icon name="info" size={16} />
            La IA generará una propuesta usando la información del curso y los lineamientos que ya tenemos. Debes ingresar indicaciones adicionales; mientras más claras sean, mejor será el resultado.
          </div>
          <textarea className="textarea" value={texto} onChange={e => setTexto(e.target.value)} placeholder="Indicaciones adicionales" />
        </>
      )}
    </Drawer>
  )
}
