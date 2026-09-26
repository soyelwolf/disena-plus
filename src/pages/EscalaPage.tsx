import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import ComparadorIA, { type SeccionComparada } from '../components/ComparadorIA'
import { MensajeFinalizado } from '../components/Aprobaciones'
import { BotonComentarios, CAMPO_GENERAL, PanelComentarios, ZonaComentable, datosItem, type FiltroComentarios } from '../components/Comentarios'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, ProgressBar, SavingOverlay, useToast } from '../components/ui'
import RecursosCurso from '../components/RecursosCurso'
import { useAuth } from '../shared/AuthContext'
import {
  PUNTAJE_OBJETIVO,
  finalizarInstrumento,
  registrarIncidencia,
  getActivacion,
  getComentarios,
  getPropuestasIA,
  habilitarEdicion,
  instrumentosRequeridos,
  type Comentario,
  type PropuestaIA,
} from '../shared/academico'
import {
  REGLAS_ESCALA,
  TIPOS_ESCALA,
  advertenciasEscala,
  agregarAEscalas,
  eliminarIndicadorEscala,
  getEscalasCurso,
  guardarTipoEscala,
  nivelesEscala,
  problemaEscala,
  quitarEscalaElemento,
  resumenNiveles,
  type EscalaElemento,
  type EscalasCurso,
  type IndicadorEscalaRow,
  type TipoEscala,
} from '../shared/escala'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'
import { AgregarCriterio, GenerarIA } from './RubricasPage'

export default function EscalaPage() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, rol)

  const [datos, setDatos] = useState<EscalasCurso | null>(null)
  const [errorDatos, setErrorDatos] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [intentoFinalizar, setIntentoFinalizar] = useState(false)
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia_pendiente'>(null)
  const [eliminar, setEliminar] = useState<IndicadorEscalaRow | null>(null)
  const [quitar, setQuitar] = useState<EscalaElemento | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [iaPara, setIaPara] = useState<EscalaElemento | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const [activada, setActivada] = useState<boolean | null>(null)
  const [propuestas, setPropuestas] = useState<Map<string, PropuestaIA>>(new Map())
  const [comparar, setComparar] = useState(false)
  // Same as Consignas and Lista de cotejo (same remembered choice).
  const [listaOculta, setListaOculta] = useState(() => {
    try {
      return localStorage.getItem('disena.consignas.listaOculta') === '1'
    } catch {
      return false
    }
  })
  const cambiarLista = (oculta: boolean) => {
    setListaOculta(oculta)
    try {
      localStorage.setItem('disena.consignas.listaOculta', oculta ? '1' : '0')
    } catch {
      // Storage blocked: the choice just isn't remembered.
    }
  }

  useEffect(() => {
    document.title = 'Escala de valoración — Diseña+'
  }, [])
  useEffect(() => {
    if (ctx) getActivacion(ctx).then(a => setActivada(a.escala.activado)).catch(() => setActivada(true))
  }, [ctx])

  const cargar = useCallback(async () => {
    if (!ctx) return
    try {
      setDatos(await getEscalasCurso(ctx))
      setErrorDatos(null)
    } catch (err) {
      setErrorDatos(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [ctx])
  useEffect(() => {
    cargar()
  }, [cargar])

  const cargarComentarios = useCallback(() => {
    if (cursoId) getComentarios(cursoId, 'escala').then(setComentarios).catch(() => setComentarios([]))
  }, [cursoId])
  useEffect(cargarComentarios, [cargarComentarios])

  const sesionesKey = datos?.elementos.map(x => x.elemento.sesionId).join(',') ?? ''
  useEffect(() => {
    if (sesionesKey) getPropuestasIA('escala', sesionesKey.split(',')).then(setPropuestas).catch(() => setPropuestas(new Map()))
  }, [sesionesKey])

  useEffect(() => {
    if (datos && !seleccion) setSeleccion(datos.elementos[0]?.elemento.sesionId ?? null)
  }, [datos, seleccion])

  const procesado = useRef(false)
  useEffect(() => {
    const st = location.state as { toast?: string; abrir?: string } | null
    if (!st || procesado.current || !datos) return
    procesado.current = true
    if (st.toast) toast(st.toast)
    if (st.abrir) setSeleccion(st.abrir)
    navigate(location.pathname, { replace: true, state: null })
  }, [location, datos, navigate, toast])

  if (loading) return <Cargando texto="Cargando escala de valoración" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (errorDatos) return <ErrorPanel mensaje={errorDatos} onRetry={cargar} />
  if (!datos) return <Cargando texto="Cargando escala de valoración" />
  const migas = [{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre, to: `/cursos/${ctx.id}` }, { label: 'Escala de valoración' }]
  if (activada === false) {
    return (
      <div className="page">
        <Breadcrumbs items={migas} />
        <div className="panel aviso-activar">
          <Icon name="sparkles" size={28} />
          <p style={{ fontWeight: 700, fontSize: 17 }}>Escala de valoración aún no está activada</p>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 520 }}>
            Primero elige el instrumento en todas las consignas del curso; luego activa Escala de valoración desde la página del curso para preparar sus elementos.
          </p>
          <Link className="btn btn-primary" to={`/cursos/${ctx.id}`}>Ir al curso</Link>
        </div>
      </div>
    )
  }

  const completos = datos.elementos.filter(x => problemaEscala(x) === null).length
  const todoCompleto = datos.elementos.length > 0 && completos === datos.elementos.length
  const actual = datos.elementos.find(x => x.elemento.sesionId === seleccion) ?? datos.elementos[0] ?? null
  const puedeHabilitar = rol.monitor && proceso.disponible && proceso.estado === 'aprobado'
  const puedeComentar = rol.revisor && proceso.estado !== 'aprobado'
  const puedeResponder = rol.revisor || rol.editar
  const pendientesDe = (x: EscalaElemento) => {
    const ids = new Set(x.indicadores.map(i => i.dpl_escalaindicadorid))
    return comentarios.filter(k => !k.padreId && !k.resuelto && ids.has(k.entidadId)).length
  }
  const observados = datos.elementos.filter(x => pendientesDe(x) > 0).length
  const buscarIndicador = (id: string) => {
    for (const x of datos.elementos) {
      const i = x.indicadores.find(k => k.dpl_escalaindicadorid === id)
      if (i) return { x, i }
    }
    return null
  }
  const etiquetaCampo = (x: EscalaElemento | undefined, campo: string) => {
    if (campo === 'dpl_indicador') return 'Indicador'
    if (campo === 'dpl_observaciones') return 'Observaciones'
    if (campo === CAMPO_GENERAL) return 'General'
    return (x && nivelesEscala(x.admin, x.tipo).niveles.find(n => n.campo === campo)?.label) || campo
  }
  const editar = (x: EscalaElemento, foco?: string) => navigate(`/cursos/${ctx.id}/escala/${x.elemento.sesionId}/editar`, { state: { foco } })

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
      const { enviado } = await finalizarInstrumento(ctx.id, 'escala', instrumentosRequeridos(ctx, null), proceso, user.correo)
      await recargar()
      setModal(enviado ? 'enviado' : 'finalizado')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo finalizar.', 'error')
    } finally {
      setTrabajando(false)
    }
  }
  const ejecutar = async (accion: () => Promise<unknown>, ok: string) => {
    setTrabajando(true)
    try {
      await accion()
      await cargar()
      toast(ok)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo completar la acción.', 'error')
    } finally {
      setTrabajando(false)
    }
  }
  // Removing deletes the content: it goes to the course history as an incident.
  const quitarYRegistrar = async (x: EscalaElemento) => {
    await quitarEscalaElemento(x)
    if (user) await registrarIncidencia(ctx.id, { accion: 'quitado', instrumento: 'escala', rol: rol.etiqueta, usuario: user.correo, comentario: `${x.elemento.nombre}: se eliminó su escala de valoración${x.indicadores.length ? ` con ${x.indicadores.length} indicadores` : ''} (la consigna ahora usa ${x.elemento.consigna?.dpl_instrumento ?? 'otro instrumento'}).` })
    await recargar()
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

  return (
    <div className="page">
      <Breadcrumbs items={migas} />
      <CursoHeader
        titulo="Escala de valoración"
        curso={ctx.nombre}
        tipoEnsenanza={ctx.tipoEnsenanza}
        programas={ctx.programas}
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

      {!puede && motivo && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
          <Icon name="info" size={16} />{motivo}
        </div>
      )}
      {datos.elementos.length > 0 && (
        <div className="alert-banner alert-info" style={{ padding: '10px 14px' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Icon name="comment" size={16} />
            {observados > 0
              ? `Tienes ${observados} ${observados === 1 ? 'elemento que fue observado' : 'elementos que fueron observados'}`
              : comentarios.length > 0 ? 'Todos los comentarios de la escala de valoración están resueltos' : 'Aún no hay comentarios de los revisores en la escala de valoración'}
          </span>
          <button className="link-btn" onClick={() => setFiltro({})}>Ver comentarios</button>
        </div>
      )}
      {datos.faltantes.length > 0 && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'space-between', padding: '12px 14px', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
            <Icon name="info" size={16} />
            Estos elementos ahora usan escala de valoración en su consigna: <b>{datos.faltantes.map(e => e.nombre).join(', ')}</b>
          </span>
          {puede && user && (
            <button className="btn btn-primary btn-sm" onClick={() => ejecutar(() => agregarAEscalas(ctx, datos.faltantes, user.correo), 'Se agregaron a Escala de valoración')}>
              <Icon name="plus" size={15} />Agregar a Escala de valoración
            </button>
          )}
        </div>
      )}

      {datos.elementos.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Ningún elemento quedó preparado para escala de valoración al activar. El instrumento se elige en cada consigna antes de activar Escala de valoración.
        </div>
      ) : (
        <div className="consignas-layout">
          {listaOculta ? (
            <div className="consignas-rail">
              <button className="nav-btn" aria-label="Mostrar elementos" title="Mostrar elementos" onClick={() => cambiarLista(false)}>
                <Icon name="chevronRight" size={20} strokeWidth={2} />
              </button>
              {datos.elementos.map((x, i) => {
                const ok = problemaEscala(x) === null
                const pendientes = pendientesDe(x)
                return (
                  <button
                    key={x.elemento.sesionId}
                    className={`rail-item${x === actual ? ' active' : ''}${ok ? ' completo' : ''}`}
                    title={`${x.elemento.nombre}${ok ? ' · completo' : ''}${pendientes ? ` · ${pendientes} comentarios pendientes` : ''}`}
                    aria-label={x.elemento.nombre}
                    onClick={() => setSeleccion(x.elemento.sesionId)}
                  >
                    {i + 1}
                    {pendientes > 0 && <span className="rail-dot" />}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="consignas-lista">
              <div className="row-between" style={{ padding: '0 4px', gap: 8 }}>
                <span style={{ fontSize: 15, fontWeight: 700 }}>Elementos ({datos.elementos.length})</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {todoCompleto ? (
                    <span className="chip chip-aprobado"><Icon name="checkCircle" size={14} />Completo</span>
                  ) : (
                    <span style={{ fontSize: 13, color: '#3d434a' }}>{completos} de {datos.elementos.length} completados</span>
                  )}
                  <button className="nav-btn" aria-label="Ocultar elementos" title="Ocultar elementos" onClick={() => cambiarLista(true)}>
                    <Icon name="chevronLeft" size={20} strokeWidth={2} />
                  </button>
                </span>
              </div>
              <div style={{ padding: '0 4px 6px' }}><ProgressBar value={(completos / datos.elementos.length) * 100} /></div>
              {datos.elementos.map(x => {
                const ok = problemaEscala(x) === null
                const pendientes = pendientesDe(x)
                return (
                  <button key={x.elemento.sesionId} className={`consigna-item${x === actual ? ' active' : ''}`} onClick={() => setSeleccion(x.elemento.sesionId)}>
                    <span style={{ flex: 1, textAlign: 'left' }}>{x.elemento.nombre}</span>
                    {pendientes > 0 && <span className="chip chip-pt" style={{ display: 'inline-flex', gap: 4 }} title={`${pendientes} comentarios pendientes`}><Icon name="comment" size={13} />{pendientes}</span>}
                    {ok ? (
                      <span style={{ color: 'var(--color-success)', display: 'flex' }} aria-label="Completo"><Icon name="checkCircle" size={18} strokeWidth={2} /></span>
                    ) : intentoFinalizar ? (
                      <span style={{ color: 'var(--color-danger)', display: 'flex' }} aria-label="Incompleto"><Icon name="alert" size={16} /></span>
                    ) : null}
                  </button>
                )
              })}
              <div className="ayuda-rapida">
                <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--color-primary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Icon name="info" size={15} />Ayuda rápida
                </span>
                <span style={{ fontSize: 13, lineHeight: 1.5, color: '#24433c' }}>
                  Elige el tipo de escala (salvo en administración), agrega hasta {REGLAS_ESCALA.maxIndicadores} indicadores y cuida que el primer nivel sume {PUNTAJE_OBJETIVO} pt.
                  En cada indicador los puntajes bajan de nivel en nivel sin repetirse; el último nivel vale 0.
                </span>
              </div>
            </div>
          )}

          {actual && (
            <EscalaDetalle
              key={actual.elemento.sesionId}
              recursos={<RecursosCurso cursoId={ctx.id} curso={ctx.nombre} elemento={actual.elemento.nombre} queSeEvaluara={actual.elemento.consigna?.dpl_queseevaluara} />}
              escala={actual}
              editable={puede}
              intentoFinalizar={intentoFinalizar}
              comentarios={comentarios}
              puedeComentar={puedeComentar}
              campoActivo={filtro}
              onComentarios={(entidadId, campo, cita) => setFiltro({ entidadId, campo, cita })}
              onTipo={tipo => user && ejecutar(() => guardarTipoEscala(ctx, actual.elemento, tipo, user.correo), tipo ? `Escala ${tipo.toLowerCase()}` : 'Tipo de escala quitado')}
              onManual={() => editar(actual)}
              onIA={() => setIaPara(actual)}
              onEditar={i => editar(actual, i.dpl_escalaindicadorid)}
              onEliminar={setEliminar}
              onComparar={propuestas.has(actual.elemento.sesionId) ? () => setComparar(true) : undefined}
            />
          )}
        </div>
      )}

      {datos.sobrantes.map(x => (
        <section key={x.elemento.sesionId} className="panel rubrica-card rubrica-sobrante">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{x.elemento.nombre}</h2>
              <span style={{ fontSize: 13, color: '#5c3a00' }}>
                La consigna ahora usa <b>{x.elemento.consigna?.dpl_instrumento}</b>: este elemento ya no necesita escala de valoración y no cuenta para finalizar.
                {x.indicadores.length > 0 ? ` Tiene ${x.indicadores.length} ${x.indicadores.length === 1 ? 'indicador' : 'indicadores'}.` : ''}
              </span>
            </span>
            {puede && (
              <button className="btn btn-outline btn-sm" onClick={() => (x.indicadores.length ? setQuitar(x) : ejecutar(() => quitarYRegistrar(x), `${x.elemento.nombre} se quitó de Escala de valoración`))}>
                <Icon name="trash" size={15} />Quitar de Escala de valoración
              </button>
            )}
          </div>
        </section>
      ))}

      <Modal
        open={modal === 'incompleto'}
        title="Debes crear la Escala de valoración completa de todos los elementos para poder finalizar con la edición"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cada elemento debe tener su tipo de escala (salvo administración), entre 1 y {REGLAS_ESCALA.maxIndicadores} indicadores con todos sus puntajes, el primer nivel debe sumar {PUNTAJE_OBJETIVO} pt
        y los demás niveles deben respetar sus topes. Los elementos con <Icon name="alert" size={13} /> tienen avisos en rojo.
      </Modal>
      <Modal
        open={modal === 'confirmar'}
        title="¿Finalizar edición general de Escala de valoración?"
        onClose={() => setModal(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={finalizar}>Sí, finalizar</button>
          </>
        }
      >
        Se avisará a los revisores que la escala de valoración está lista. Podrás seguir editando hasta que la aprueben el Monitor EA y DDA.
      </Modal>
      <Modal open={modal === 'enviado'} title="Se avisó a los aprobadores para que revisen la información" onClose={() => setModal(null)} actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}>
        Puedes seguir editando mientras revisan. Todo se congela solo cuando aprueben el Monitor EA y DDA.
      </Modal>
      <Modal open={modal === 'finalizado'} title="Escala de valoración finalizada: aún falta para avisar a los aprobadores" onClose={() => setModal(null)} actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}>
        <MensajeFinalizado parte="escala" requeridos={instrumentosRequeridos(ctx, null)} finalizado={proceso.finalizado} />
      </Modal>
      <Modal
        open={!!eliminar}
        title="¿Eliminar indicador?"
        onClose={() => setEliminar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setEliminar(null)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const i = eliminar
                setEliminar(null)
                if (i) ejecutar(() => eliminarIndicadorEscala(i), 'Se eliminó el indicador con éxito')
              }}
            >
              Sí, eliminar
            </button>
          </>
        }
      >
        {eliminar && <>Se eliminará el <b>Indicador N°{eliminar.dpl_orden ?? ''}</b> con sus comentarios. Los demás se volverán a numerar.</>}
      </Modal>
      <Modal
        open={!!quitar}
        title="¿Quitar este elemento de Escala de valoración?"
        onClose={() => setQuitar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitar(null)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const x = quitar
                setQuitar(null)
                if (x) ejecutar(() => quitarYRegistrar(x), `${x.elemento.nombre} se quitó de Escala de valoración`)
              }}
            >
              Sí, quitar
            </button>
          </>
        }
      >
        {quitar && <>Se eliminará la escala de <b>{quitar.elemento.nombre}</b> con sus <b>{quitar.indicadores.length} indicadores</b> y sus comentarios. No se puede deshacer.</>}
      </Modal>
      <Modal open={modal === 'ia_pendiente'} title="Generación con IA aún no disponible" onClose={() => setModal(null)} actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}>
        Muy pronto la IA podrá proponer los indicadores de la escala de valoración. Por ahora, usa «De forma manual».
      </Modal>

      <GenerarIA elemento={iaPara} onClose={() => setIaPara(null)} onGenerar={() => { setIaPara(null); setModal('ia_pendiente') }} />
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={filtro?.campo ? 'Comentarios' : filtro?.entidadId ? `Comentarios: Indicador N°${buscarIndicador(filtro.entidadId)?.i.dpl_orden ?? ''}` : 'Comentarios de la escala de valoración'}
        cursoId={ctx.id}
        instrumento="escala"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(id, campo) => {
          const b = buscarIndicador(id)
          return b ? `${b.x.elemento.nombre} · Indicador N°${b.i.dpl_orden ?? ''} · ${etiquetaCampo(b.x, campo)}` : etiquetaCampo(undefined, campo)
        }}
        valorItem={(id, campo) => {
          const b = buscarIndicador(id)
          if (!b || campo === CAMPO_GENERAL) return null
          const v = (b.i as unknown as Record<string, unknown>)[campo]
          return v === null || v === undefined ? '' : String(v)
        }}
        puedeComentar={puedeComentar}
        puedeResponder={puedeResponder}
        puedeResolver={rol.revisor}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
        onIrItem={(entidadId, campo) => {
          const b = buscarIndicador(entidadId)
          if (b) setSeleccion(b.x.elemento.sesionId)
          setFiltro({ entidadId, campo })
          setTimeout(() => document.getElementById(`item-${entidadId}-${campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
        }}
      />
      <SavingOverlay show={trabajando} />
      {comparar && actual && propuestas.get(actual.elemento.sesionId) && (() => {
        const p = propuestas.get(actual.elemento.sesionId)!
        const { niveles } = nivelesEscala(actual.admin, actual.tipo)
        const numeros = [...new Set([...p.filas.map(f => Number(f.dpl_orden)), ...actual.indicadores.map(i => Number(i.dpl_orden))])].sort((a, b) => a - b)
        const txt = (o: Record<string, unknown>, k: string) => (o[k] === null || o[k] === undefined ? '' : String(o[k]))
        const secciones: SeccionComparada[] = numeros.map(n => {
          const ia = (p.filas.find(f => Number(f.dpl_orden) === n) ?? {}) as Record<string, unknown>
          const fin = (actual.indicadores.find(i => Number(i.dpl_orden) === n) ?? {}) as unknown as Record<string, unknown>
          return {
            titulo: `Indicador N°${n}`,
            nota: !Object.keys(ia).length ? 'Indicador agregado por el docente (no estaba en la propuesta IA).' : !Object.keys(fin).length ? 'Indicador de la propuesta IA que el docente quitó.' : undefined,
            campos: [
              { label: 'Indicador', ia: txt(ia, 'dpl_indicador'), final: txt(fin, 'dpl_indicador') },
              ...niveles.map(l => ({ label: l.label, ia: txt(ia, l.campo), final: txt(fin, l.campo) })),
              { label: 'Observaciones', ia: txt(ia, 'dpl_observaciones'), final: txt(fin, 'dpl_observaciones') },
            ],
          }
        })
        return (
          <ComparadorIA
            open
            onClose={() => setComparar(false)}
            titulo={`Propuesta IA vs versión final · ${actual.elemento.nombre}`}
            detalle={`Propuesta IA del ${new Date(p.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}${p.modelo ? ` · ${p.modelo}` : ''}${p.herramienta ? ` (${p.herramienta})` : ''}`}
            secciones={secciones}
          />
        )
      })()}
    </div>
  )
}

// ── Pieces ───────────────────────────────────────────────────────────────────

/** "Siempre: 20 | Casi siempre: 14 | …" with ✓ / ⚠ per level, as in the Power Apps screen. */
export function ChipsNiveles({ indicadores, admin, tipo }: { indicadores: Array<Partial<Record<string, unknown>>>; admin: boolean; tipo: TipoEscala | null }) {
  const { niveles } = nivelesEscala(admin, tipo)
  return (
    <div className="regla-fila">
      {resumenNiveles(indicadores, niveles).map(r => (
        <span key={r.campo} className={`regla-chip ${r.ok ? 'ok' : 'mal'}`}>
          <Icon name={r.ok ? 'checkCircle' : 'alert'} size={14} />
          {r.label}: {String(r.suma).replace('.', ',')}{r.nota ? ` (${r.nota})` : ''}
        </span>
      ))}
    </div>
  )
}

/** Cualitativa / Cuantitativa / Mixta; administración has fixed levels. */
export function SelectorTipo({ admin, tipo, editable, onCambio }: { admin: boolean; tipo: TipoEscala | null; editable: boolean; onCambio: (t: TipoEscala | null) => void }) {
  if (admin) return <span className="chip chip-revision" title="Cursos DDA de administración, contabilidad y economía">Escala de administración</span>
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 700 }}>
      Tipo de escala
      <select
        value={tipo ?? ''}
        disabled={!editable}
        onChange={e => onCambio((e.target.value || null) as TipoEscala | null)}
        style={{ height: 38, borderColor: tipo ? 'var(--color-input-border)' : 'var(--color-warning)', borderRadius: 4, fontWeight: 400, minWidth: 190 }}
      >
        <option value="">Selecciona el tipo</option>
        {TIPOS_ESCALA.map(t => <option key={t} value={t}>{t}</option>)}
      </select>
    </label>
  )
}

interface DetalleProps {
  escala: EscalaElemento
  /** Sílabo, Formato de orientación and "Qué se evaluará". */
  recursos?: React.ReactNode
  editable: boolean
  intentoFinalizar: boolean
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: FiltroComentarios | null
  onComentarios: (entidadId: string, campo?: string, cita?: string) => void
  onTipo: (t: TipoEscala | null) => void
  onManual: () => void
  onIA: () => void
  onEditar: (i: IndicadorEscalaRow) => void
  onEliminar: (i: IndicadorEscalaRow) => void
  onComparar?: () => void
}

function EscalaDetalle(props: DetalleProps) {
  const { escala: x, editable, intentoFinalizar, comentarios, puedeComentar } = props
  const { niveles, cero } = nivelesEscala(x.admin, x.tipo)
  const avisos = advertenciasEscala(x.indicadores, x.admin, x.tipo)
  // Detalle takes the room; each level a narrow column; Observaciones is usually short.
  const columnas = `minmax(0, 3fr) repeat(${niveles.length + 1}, 104px) minmax(0, 1fr)`
  return (
    <section className="panel rubrica-card consigna-editor animate-in">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--color-border)', paddingBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Escala de valoración: {x.elemento.nombre}</h2>
        {props.recursos}
        <span style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {props.onComparar && (
            <button className="btn btn-outline btn-sm" onClick={props.onComparar}><Icon name="sparkles" size={14} />Comparar con propuesta IA</button>
          )}
          <SelectorTipo admin={x.admin} tipo={x.tipo} editable={editable} onCambio={props.onTipo} />
        </span>
      </div>

      {avisos.length > 0 && (
        <div className={`alert-banner ${intentoFinalizar ? 'alert-danger' : 'alert-warn'}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: '10px 14px' }}>
          <Icon name="alert" size={15} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>{avisos.map(a => <span key={a}>{a}</span>)}</span>
        </div>
      )}
      {intentoFinalizar && x.indicadores.length === 0 && (
        <div className="alert-banner alert-danger"><Icon name="alert" size={15} />Debes crear indicadores para este elemento</div>
      )}

      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 15 }}>Indicadores ({x.indicadores.length})</span>
        {x.indicadores.length > 0 && <ChipsNiveles indicadores={x.indicadores as unknown as Array<Record<string, unknown>>} admin={x.admin} tipo={x.tipo} />}
      </div>

      {x.indicadores.map(i => (
        <IndicadorEscalaCard
          key={i.dpl_escalaindicadorid}
          indicador={i}
          niveles={niveles}
          cero={cero}
          columnas={columnas}
          editable={editable}
          comentarios={comentarios}
          puedeComentar={puedeComentar}
          campoActivo={props.campoActivo?.entidadId === i.dpl_escalaindicadorid ? props.campoActivo.campo ?? null : null}
          onComentarios={(campo, cita) => props.onComentarios(i.dpl_escalaindicadorid, campo, cita)}
          onEditar={() => props.onEditar(i)}
          onEliminar={() => props.onEliminar(i)}
        />
      ))}

      {editable && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {x.indicadores.length < REGLAS_ESCALA.maxIndicadores ? (
            <AgregarCriterio label="Agregar indicador" onManual={props.onManual} onIA={props.onIA} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>Llegaste al máximo de {REGLAS_ESCALA.maxIndicadores} indicadores.</span>
          )}
          {x.indicadores.length > 0 && (
            <button className="btn btn-outline" style={{ height: 38 }} onClick={props.onManual}><Icon name="pencil" size={16} />Editar escala completa</button>
          )}
        </div>
      )}
    </section>
  )
}

interface IndicadorProps {
  indicador: IndicadorEscalaRow
  niveles: ReturnType<typeof nivelesEscala>['niveles']
  cero: string
  columnas: string
  editable: boolean
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: string | null
  onComentarios: (campo?: string, cita?: string) => void
  onEditar: () => void
  onEliminar: () => void
}

function IndicadorEscalaCard(props: IndicadorProps) {
  const { indicador: i, niveles, cero, columnas, editable, comentarios, puedeComentar, campoActivo } = props
  const id = i.dpl_escalaindicadorid
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])
  const boton = (campo: string, label: string) => (
    <BotonComentarios estado={datosItem(comentarios, id, campo).estado} puedeComentar={puedeComentar} activo={campoActivo === campo} label={label} onClick={() => props.onComentarios(campo)} />
  )
  const celda = (campo: string, label: string, contenido: ReactNode, clase?: string) => (
    <div key={campo} className={clase}>
      <ZonaComentable citas={datosItem(comentarios, id, campo).citas} puedeComentar={puedeComentar} onComentar={cita => props.onComentarios(campo, cita)} className="nivel-zona">
        <div id={`item-${id}-${campo}`} className={campoActivo === campo ? 'coment-item-activo' : undefined}>
          <div className="nivel" style={{ height: '100%' }}>
            <div className="indicador-head coment-label">{label}{boton(campo, label)}</div>
            <div className="nivel-body">{contenido}</div>
          </div>
        </div>
      </ZonaComentable>
    </div>
  )
  // Level columns are narrow: the name alone on top, the score with its comment button below.
  const nivel = (campo: string, label: string, v: number | null) => (
    <div key={campo} className="escala-nivel">
      <ZonaComentable citas={datosItem(comentarios, id, campo).citas} puedeComentar={puedeComentar} onComentar={cita => props.onComentarios(campo, cita)} className="nivel-zona">
        <div id={`item-${id}-${campo}`} className={campoActivo === campo ? 'coment-item-activo' : undefined}>
          <div className="nivel" style={{ height: '100%' }}>
            <div className="indicador-head">{label}</div>
            <div className="escala-nivel-valor">
              <span className="chip chip-pt">{v === null ? '—' : `${Number(v)} pt`}</span>
              {boton(campo, label)}
            </div>
          </div>
        </div>
      </ZonaComentable>
    </div>
  )

  return (
    <div className="criterio" id={`indicador-${id}`}>
      <div className="criterio-head" style={{ padding: '10px 8px 6px 14px' }}>
        <span style={{ flex: 1, fontSize: 14, fontWeight: 700 }}>Indicador n°{i.dpl_orden ?? ''}</span>
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
      </div>
      <div className="indicador-grid escala-grid" style={{ gridTemplateColumns: columnas }}>
        {celda('dpl_indicador', 'Indicador', <span style={{ whiteSpace: 'pre-wrap' }}>{i.dpl_indicador || '—'}</span>, 'indicador-detalle')}
        {niveles.map(n => nivel(n.campo, n.label, i[n.campo]))}
        <div className="escala-nivel escala-cero">
          <div className="indicador-head">{cero}</div>
          <div className="escala-nivel-valor"><span className="chip" style={{ background: '#e3e7e9' }}>0 pt</span></div>
        </div>
        {celda('dpl_observaciones', 'Observaciones', <span style={{ whiteSpace: 'pre-wrap' }}>{i.dpl_observaciones || '—'}</span>)}
      </div>
    </div>
  )
}
