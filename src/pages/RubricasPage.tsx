import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import ComparadorIA, { type SeccionComparada } from '../components/ComparadorIA'
import { MensajeFinalizado } from '../components/Aprobaciones'
import { BotonComentarios, CAMPO_GENERAL, PanelComentarios, ZonaComentable, datosItem, type FiltroComentarios } from '../components/Comentarios'
import { VistaRica } from '../components/TextoEnriquecido'
import { Link } from 'react-router-dom'
import { Breadcrumbs, Cargando, CursoHeader, Drawer, ErrorPanel, Modal, SavingOverlay, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  NIVELES,
  PUNTAJE_OBJETIVO,
  eliminarCriterio,
  finalizarInstrumento,
  getActivacion,
  getComentarios,
  getPropuestasIA,
  type PropuestaIA,
  getRubricasCurso,
  habilitarEdicion,
  instrumentosRequeridos,
  marcarCompetencia,
  REGLAS_RUBRICA,
  advertenciasRubrica,
  agregarARubricas,
  quitarRubricaElemento,
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
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, rol)

  const [datos, setDatos] = useState<RubricasCurso | null>(null)
  const [errorDatos, setErrorDatos] = useState<string | null>(null)
  const [programa, setPrograma] = useState<string | null>(null)
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set())
  const [intentoFinalizar, setIntentoFinalizar] = useState(false)
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia_pendiente'>(null)
  const [eliminar, setEliminar] = useState<CriterioRow | null>(null)
  const [quitarRubrica, setQuitarRubrica] = useState<RubricaElemento | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [iaPara, setIaPara] = useState<RubricaElemento | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const [activada, setActivada] = useState<boolean | null>(null)
  useEffect(() => {
    if (ctx) getActivacion(ctx).then(a => setActivada(a.rubrica.activado)).catch(() => setActivada(true))
  }, [ctx])

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

  // Initial IA proposal of each rubric (BACKUP list), to compare with the final version.
  const [propuestas, setPropuestas] = useState<Map<string, PropuestaIA>>(new Map())
  const [compararDe, setCompararDe] = useState<RubricaElemento | null>(null)
  const sesionesKey = datos?.elementos.map(r => r.elemento.sesionId).join(',') ?? ''
  useEffect(() => {
    if (sesionesKey) getPropuestasIA('rubricas', sesionesKey.split(',')).then(setPropuestas).catch(() => setPropuestas(new Map()))
  }, [sesionesKey])

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
  if (activada === false) {
    return (
      <div className="page">
        <Breadcrumbs items={[{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre, to: `/cursos/${ctx.id}` }, { label: 'Rúbrica' }]} />
        <div className="panel aviso-activar">
          <Icon name="sparkles" size={28} />
          <p style={{ fontWeight: 700, fontSize: 17 }}>Rúbricas aún no está activado</p>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 520 }}>
            Primero elige el instrumento en todas las consignas del curso; luego activa Rúbricas desde la página del curso para preparar sus elementos.
          </p>
          <Link className="btn btn-primary" to={`/cursos/${ctx.id}`}>Ir al curso</Link>
        </div>
      </div>
    )
  }

  const problemas = datos.elementos.map(problemaElemento)
  const todoCompleto = datos.elementos.length > 0 && problemas.every(p => p === null)
  const esMonitor = rol.monitor
  const puedeHabilitar = esMonitor && proceso.disponible && proceso.estado === 'aprobado'
  // Everything depends on the person's role in THIS course (LISTADO_CURSOS_PARA_IA):
  // Monitor EA / DDA open and resolve comments; the teaching team replies; all can read.
  const puedeComentar = (rol.monitor || rol.dda) && proceso.estado !== 'aprobado'
  const puedeResponder = rol.monitor || rol.dda || rol.editar
  const pendientesRubrica = comentarios.filter(k => !k.padreId && !k.resuelto).length
  const buscarCriterio = (id: string) => {
    for (const r of datos.elementos) {
      const c = r.criterios.find(x => x.dpl_rubricacriterioid === id)
      if (c) return { r, c }
    }
    return null
  }
  const etiquetaCampo = (campo: string) =>
    campo === 'dpl_criterio' ? 'Nombre del criterio' : campo === 'dpl_definicioncriterio' ? 'Descripción del criterio' : campo === CAMPO_GENERAL ? 'General' : NIVELES.find(n => n.texto === campo)?.label ?? campo
  const irItem = (entidadId: string, campo: string) => {
    setAbiertos(prev => new Set(prev).add(entidadId))
    setFiltro({ entidadId, campo })
    setTimeout(() => document.getElementById(`item-${entidadId}-${campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
  }

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

  const quitar = async (r: RubricaElemento) => {
    setQuitarRubrica(null)
    setTrabajando(true)
    try {
      await quitarRubricaElemento(r)
      await cargar()
      toast(`${r.elemento.nombre} se quitó de Rúbricas`)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo quitar.', 'error')
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
      {datos.elementos.length > 0 && (
        <div className="alert-banner alert-info" style={{ padding: '10px 14px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="comment" size={16} />
            {pendientesRubrica > 0 ? `Hay ${pendientesRubrica} ${pendientesRubrica === 1 ? 'comentario pendiente' : 'comentarios pendientes'} en la rúbrica` : comentarios.length > 0 ? 'Todos los comentarios de la rúbrica están resueltos' : 'Aún no hay comentarios del Monitor EA ni DDA en la rúbrica'}
          </span>
          <button className="link-btn" onClick={() => setFiltro({})}>Ver comentarios</button>
        </div>
      )}

      {datos.faltantes.length > 0 && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'space-between', padding: '12px 14px', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
            <Icon name="info" size={16} />
            Estos elementos ahora usan rúbrica en su consigna: <b>{datos.faltantes.map(e => e.nombre).join(', ')}</b>
          </span>
          {puede && (
            <button
              className="btn btn-primary btn-sm"
              onClick={async () => {
                if (!user) return
                setTrabajando(true)
                try {
                  await agregarARubricas(datos.faltantes, user.correo)
                  await cargar()
                  toast(datos.faltantes.length > 1 ? 'Se agregaron a Rúbricas' : 'Se agregó a Rúbricas')
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'No se pudo agregar.', 'error')
                } finally {
                  setTrabajando(false)
                }
              }}
            >
              <Icon name="plus" size={15} />Agregar a Rúbricas
            </button>
          )}
        </div>
      )}

      {datos.elementos.length === 0 && (
        <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Ningún elemento quedó preparado para rúbrica al activar. El instrumento se elige en cada consigna antes de activar Rúbricas.
        </div>
      )}

      {datos.elementos.map((r, i) => (
        <section key={r.elemento.sesionId} className="panel rubrica-card animate-in">
          <div className="row-between">
            <h2 style={{ fontSize: 18, fontWeight: 700 }}>{r.elemento.nombre}</h2>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              {propuestas.has(r.elemento.sesionId) && (
                <button className="btn btn-outline btn-sm" style={{ marginRight: 8 }} onClick={() => setCompararDe(r)}>
                  <Icon name="sparkles" size={14} />Comparar con propuesta IA
                </button>
              )}
              <Icon name="clipboard" size={16} />Total:
              <span className="chip chip-pt">{totalEstandar(r.criterios)} pt</span>
            </span>
          </div>

          {(() => {
            // Always visible while working; after "Finalizar" the red banner below takes over the 20 pt rule.
            const avisos = advertenciasRubrica(r.criterios)
            return avisos.length > 0 ? (
              <div className={`alert-banner ${intentoFinalizar ? 'alert-danger' : 'alert-warn'}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: '10px 14px' }}>
                <Icon name="alert" size={15} />
                <span style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>{avisos.map(a => <span key={a}>{a}</span>)}</span>
              </div>
            ) : null
          })()}


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
                  comentarios={comentarios}
                  puedeComentar={puedeComentar}
                  campoActivo={filtro?.entidadId === c.dpl_rubricacriterioid ? filtro.campo ?? null : null}
                  onComentarios={(campo, cita) => setFiltro({ entidadId: c.dpl_rubricacriterioid, campo, cita })}
                  onEditar={() => navigate(`/cursos/${ctx.id}/rubricas/${r.elemento.sesionId}/editar`, { state: { foco: c.dpl_rubricacriterioid } })}
                  onEliminar={() => setEliminar(c)}
                />
              ))}
            </div>
          )}

          {puede && (
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {r.criterios.length < REGLAS_RUBRICA.maxCriterios ? (
                <AgregarCriterio
                  onManual={() => navigate(`/cursos/${ctx.id}/rubricas/${r.elemento.sesionId}/criterio`)}
                  onIA={() => setIaPara(r)}
                />
              ) : (
                <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>Llegaste al máximo de {REGLAS_RUBRICA.maxCriterios} criterios.</span>
              )}
              {r.criterios.length > 0 && (
                <button className="btn btn-outline" style={{ height: 38 }} onClick={() => navigate(`/cursos/${ctx.id}/rubricas/${r.elemento.sesionId}/editar`)}>
                  <Icon name="pencil" size={16} />Editar rúbrica completa
                </button>
              )}
            </div>
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
        Cada elemento debe cumplir las reglas de la rúbrica: entre {REGLAS_RUBRICA.minCriterios} y {REGLAS_RUBRICA.maxCriterios} criterios, estándar esperado que sume {PUNTAJE_OBJETIVO} pt,
        Inicial que sume entre {REGLAS_RUBRICA.inicialMin} y {REGLAS_RUBRICA.inicialMax} pt, y en cada criterio puntajes completos que bajen de nivel en nivel sin repetirse.
        Revisa los avisos en rojo de cada elemento.
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
        Se avisará al Monitor EA y DDA que la rúbrica está lista para revisar. Podrás seguir editando hasta que la aprueben.
      </Modal>
      <Modal
        open={modal === 'enviado'}
        title="Todo finalizado: se avisó al Monitor EA y DDA"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Puedes seguir editando mientras revisan. Todo se congela solo cuando aprueben el Monitor EA y DDA.
      </Modal>
      <Modal
        open={modal === 'finalizado'}
        title="Rúbricas finalizadas: aún falta para avisar a los aprobadores"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        <MensajeFinalizado parte="rubricas" requeridos={instrumentosRequeridos(ctx, datos)} finalizado={proceso.finalizado} />
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
        {eliminar && (
          <>
            Se eliminará el criterio <b>N°{eliminar.dpl_orden ?? ''} · {eliminar.dpl_criterio || 'Sin nombre'}</b>
            {' '}({Number(eliminar.dpl_puntajeestandar ?? 0)} pt en estándar esperado). Los demás se volverán a numerar.
          </>
        )}
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
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={filtro?.campo ? 'Comentarios' : filtro?.entidadId ? `Comentarios: Criterio N°${buscarCriterio(filtro.entidadId)?.c.dpl_orden ?? ''}` : 'Comentarios de la rúbrica'}
        cursoId={ctx.id}
        instrumento="rubricas"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(id, campo) => {
          const x = buscarCriterio(id)
          return x ? `${x.r.elemento.nombre} · Criterio N°${x.c.dpl_orden ?? ''} · ${etiquetaCampo(campo)}` : etiquetaCampo(campo)
        }}
        valorItem={(id, campo) => {
          const x = buscarCriterio(id)
          if (!x || campo === CAMPO_GENERAL) return null
          const v = (x.c as unknown as Record<string, unknown>)[campo]
          const n = NIVELES.find(k => k.texto === campo)
          return `${v ?? ''}${n ? ` ${x.c[n.puntaje] ?? ''}` : ''}`
        }}
        puedeComentar={puedeComentar}
        puedeResponder={puedeResponder}
        puedeResolver={rol.monitor || rol.dda}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
        onIrItem={irItem}
      />
      {datos.sobrantes.map(r => (
        <section key={r.elemento.sesionId} className="panel rubrica-card rubrica-sobrante">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{r.elemento.nombre}</h2>
              <span style={{ fontSize: 13, color: '#5c3a00' }}>
                La consigna ahora usa <b>{r.elemento.consigna?.dpl_instrumento}</b>: este elemento ya no necesita rúbrica y no cuenta para finalizar.
                {r.criterios.length > 0 ? ` Tiene ${r.criterios.length} ${r.criterios.length === 1 ? 'criterio' : 'criterios'}.` : ''}
              </span>
            </span>
            {puede && (
              <button className="btn btn-outline btn-sm" onClick={() => (r.criterios.length ? setQuitarRubrica(r) : quitar(r))}>
                <Icon name="trash" size={15} />Quitar de Rúbricas
              </button>
            )}
          </div>
        </section>
      ))}
      <Modal
        open={!!quitarRubrica}
        title="¿Quitar este elemento de Rúbricas?"
        onClose={() => setQuitarRubrica(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitarRubrica(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={() => quitarRubrica && quitar(quitarRubrica)}>Sí, quitar</button>
          </>
        }
      >
        {quitarRubrica && (
          <>
            Se eliminará la rúbrica de <b>{quitarRubrica.elemento.nombre}</b> con sus <b>{quitarRubrica.criterios.length} criterios</b>, las competencias marcadas y sus comentarios. No se puede deshacer.
          </>
        )}
      </Modal>
      <SavingOverlay show={trabajando} />
      {compararDe && propuestas.get(compararDe.elemento.sesionId) && (() => {
        const p = propuestas.get(compararDe.elemento.sesionId)!
        // Criteria are matched by their number (N°).
        const numeros = [...new Set([...p.filas.map(f => Number(f.dpl_orden)), ...compararDe.criterios.map(c => Number(c.dpl_orden))])].sort((a, b) => a - b)
        const secciones: SeccionComparada[] = numeros.map(n => {
          const ia = (p.filas.find(f => Number(f.dpl_orden) === n) ?? {}) as Record<string, unknown>
          const fin = (compararDe.criterios.find(c => Number(c.dpl_orden) === n) ?? {}) as unknown as Record<string, unknown>
          const enIA = Object.keys(ia).length > 0
          const enFinal = Object.keys(fin).length > 0
          const txt = (o: Record<string, unknown>, k: string) => (o[k] === null || o[k] === undefined ? '' : String(o[k]))
          return {
            titulo: `Criterio N°${n}${txt(fin, 'dpl_criterio') || txt(ia, 'dpl_criterio') ? ` · ${txt(fin, 'dpl_criterio') || txt(ia, 'dpl_criterio')}` : ''}`,
            nota: !enIA ? 'Criterio agregado por el docente (no estaba en la propuesta IA).' : !enFinal ? 'Criterio de la propuesta IA que el docente quitó.' : undefined,
            campos: [
              { label: 'Nombre del criterio', ia: txt(ia, 'dpl_criterio'), final: txt(fin, 'dpl_criterio') },
              { label: 'Descripción del criterio', ia: txt(ia, 'dpl_definicioncriterio'), final: txt(fin, 'dpl_definicioncriterio') },
              ...NIVELES.flatMap(l => [
                { label: l.label, ia: txt(ia, l.texto), final: txt(fin, l.texto) },
                { label: `Puntaje · ${l.label}`, ia: txt(ia, l.puntaje), final: txt(fin, l.puntaje) },
              ]),
            ],
          }
        })
        return (
          <ComparadorIA
            open
            onClose={() => setCompararDe(null)}
            titulo={`Propuesta IA vs versión final · ${compararDe.elemento.nombre}`}
            detalle={`Propuesta IA del ${new Date(p.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}${p.modelo ? ` · ${p.modelo}` : ''}${p.herramienta ? ` (${p.herramienta})` : ''}`}
            secciones={secciones}
          />
        )
      })()}
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
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: string | null
  onComentarios: (campo?: string, cita?: string) => void
  onEditar: () => void
  onEliminar: () => void
}

function CriterioAcordeon(props: CriterioProps) {
  const { criterio: c, abierto, onToggle, editable, competencias, seleccionadas, comentarios, puedeComentar, campoActivo } = props
  const id = c.dpl_rubricacriterioid
  const pendientes = comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === id).length
  const boton = (campo: string, label: string) => (
    <BotonComentarios estado={datosItem(comentarios, id, campo).estado} puedeComentar={puedeComentar} activo={campoActivo === campo} label={label} onClick={() => props.onComentarios(campo)} />
  )
  const zona = (campo: string, hijos: ReactNode, className?: string) => (
    <ZonaComentable citas={datosItem(comentarios, id, campo).citas} puedeComentar={puedeComentar} onComentar={cita => props.onComentarios(campo, cita)} className={className}>
      <div id={`item-${id}-${campo}`} className={campoActivo === campo ? 'coment-item-activo' : undefined}>{hijos}</div>
    </ZonaComentable>
  )
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
          {!abierto && pendientes > 0 && (
            <span className="chip chip-pt" style={{ display: 'inline-flex', gap: 4 }} title={`${pendientes} comentarios pendientes`}><Icon name="comment" size={13} />{pendientes}</span>
          )}
        </button>
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
          {zona(
            'dpl_criterio',
            <div>
              <div className="coment-label" style={{ marginBottom: 4 }}><p style={{ fontSize: 13, fontWeight: 700 }}>Nombre del criterio</p>{boton('dpl_criterio', 'Nombre del criterio')}</div>
              <p style={{ fontSize: 14 }}>{c.dpl_criterio || '—'}</p>
            </div>,
          )}
          {zona(
            'dpl_definicioncriterio',
            <div>
              <div className="coment-label" style={{ marginBottom: 4 }}><p style={{ fontSize: 13, fontWeight: 700 }}>Descripción del criterio</p>{boton('dpl_definicioncriterio', 'Descripción del criterio')}</div>
              <VistaRica valor={c.dpl_definicioncriterio} className="rte-small" />
            </div>,
          )}
          <div className="niveles">
            {NIVELES.map(n => (
              <div key={n.texto}>
                {zona(
                  n.texto,
                  <div className="nivel" style={{ height: '100%' }}>
                    <div className="nivel-head coment-label">{n.label}{boton(n.texto, n.label)}</div>
                    <div className="nivel-body">
                      <span className="chip chip-pt" style={{ alignSelf: 'flex-start' }}>{Number(c[n.puntaje] ?? 0)} pt</span>
                      <VistaRica valor={c[n.texto] as string} className="rte-small" />
                    </div>
                  </div>,
                  'nivel-zona',
                )}
              </div>
            ))}
          </div>
          {comentarios.some(k => !k.padreId && k.entidadId === id && k.campo === CAMPO_GENERAL) && (
            <div className="coment-label" style={{ justifyContent: 'flex-start' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>Comentarios generales (anteriores)</span>
              {boton(CAMPO_GENERAL, 'Comentarios generales')}
            </div>
          )}

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
