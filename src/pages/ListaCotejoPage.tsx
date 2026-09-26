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
  REGLAS_LISTA,
  advertenciasLista,
  agregarAListas,
  eliminarIndicador,
  getListasCurso,
  problemaLista,
  quitarListaElemento,
  totalLista,
  type IndicadorRow,
  type ListaElemento,
  type ListasCurso,
} from '../shared/listaCotejo'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'
import { AgregarCriterio, GenerarIA } from './RubricasPage'

const CAMPOS: Array<{ campo: 'dpl_indicador' | 'dpl_puntaje' | 'dpl_observaciones'; label: string }> = [
  { campo: 'dpl_indicador', label: 'Detalle' },
  { campo: 'dpl_puntaje', label: 'Puntaje' },
  { campo: 'dpl_observaciones', label: 'Observaciones' },
]
const etiquetaCampo = (campo: string) => (campo === CAMPO_GENERAL ? 'General' : CAMPOS.find(c => c.campo === campo)?.label ?? campo)

export default function ListaCotejoPage() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, rol)

  const [datos, setDatos] = useState<ListasCurso | null>(null)
  const [errorDatos, setErrorDatos] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [intentoFinalizar, setIntentoFinalizar] = useState(false)
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia_pendiente'>(null)
  const [eliminar, setEliminar] = useState<IndicadorRow | null>(null)
  const [quitarLista, setQuitarLista] = useState<ListaElemento | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [iaPara, setIaPara] = useState<ListaElemento | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const [activada, setActivada] = useState<boolean | null>(null)
  const [propuestas, setPropuestas] = useState<Map<string, PropuestaIA>>(new Map())
  const [comparar, setComparar] = useState(false)
  // Same as Consignas (and the same remembered choice): hide the elements list to give the checklist the whole width.
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
    document.title = 'Lista de cotejo — Diseña+'
  }, [])
  useEffect(() => {
    if (ctx) getActivacion(ctx).then(a => setActivada(a.lista.activado)).catch(() => setActivada(true))
  }, [ctx])

  const cargar = useCallback(async () => {
    if (!ctx) return
    try {
      setDatos(await getListasCurso(ctx))
      setErrorDatos(null)
    } catch (err) {
      setErrorDatos(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [ctx])
  useEffect(() => {
    cargar()
  }, [cargar])

  const cargarComentarios = useCallback(() => {
    if (cursoId) getComentarios(cursoId, 'lista').then(setComentarios).catch(() => setComentarios([]))
  }, [cursoId])
  useEffect(cargarComentarios, [cargarComentarios])

  // Initial IA proposal of each checklist (BACKUP list), to compare with the final version.
  const sesionesKey = datos?.elementos.map(l => l.elemento.sesionId).join(',') ?? ''
  useEffect(() => {
    if (sesionesKey) getPropuestasIA('lista', sesionesKey.split(',')).then(setPropuestas).catch(() => setPropuestas(new Map()))
  }, [sesionesKey])

  useEffect(() => {
    if (datos && !seleccion) setSeleccion(datos.elementos[0]?.elemento.sesionId ?? null)
  }, [datos, seleccion])

  // Coming back from "Agregar indicadores": toast + select that element.
  const procesado = useRef(false)
  useEffect(() => {
    const st = location.state as { toast?: string; abrir?: string } | null
    if (!st || procesado.current || !datos) return
    procesado.current = true
    if (st.toast) toast(st.toast)
    if (st.abrir) setSeleccion(st.abrir)
    navigate(location.pathname, { replace: true, state: null })
  }, [location, datos, navigate, toast])

  if (loading) return <Cargando texto="Cargando lista de cotejo" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (errorDatos) return <ErrorPanel mensaje={errorDatos} onRetry={cargar} />
  if (!datos) return <Cargando texto="Cargando lista de cotejo" />
  const migas = [{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre, to: `/cursos/${ctx.id}` }, { label: 'Lista de cotejo' }]
  if (activada === false) {
    return (
      <div className="page">
        <Breadcrumbs items={migas} />
        <div className="panel aviso-activar">
          <Icon name="sparkles" size={28} />
          <p style={{ fontWeight: 700, fontSize: 17 }}>Lista de cotejo aún no está activada</p>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 520 }}>
            Primero elige el instrumento en todas las consignas del curso; luego activa Lista de cotejo desde la página del curso para preparar sus elementos.
          </p>
          <Link className="btn btn-primary" to={`/cursos/${ctx.id}`}>Ir al curso</Link>
        </div>
      </div>
    )
  }

  const completos = datos.elementos.filter(l => problemaLista(l) === null).length
  const todoCompleto = datos.elementos.length > 0 && completos === datos.elementos.length
  const actual = datos.elementos.find(l => l.elemento.sesionId === seleccion) ?? datos.elementos[0] ?? null
  const puedeHabilitar = rol.monitor && proceso.disponible && proceso.estado === 'aprobado'
  const puedeComentar = rol.revisor && proceso.estado !== 'aprobado'
  const puedeResponder = rol.revisor || rol.editar
  const pendientesDe = (l: ListaElemento) => {
    const ids = new Set(l.indicadores.map(i => i.dpl_listacotejoindicadorid))
    return comentarios.filter(k => !k.padreId && !k.resuelto && ids.has(k.entidadId)).length
  }
  const observados = datos.elementos.filter(l => pendientesDe(l) > 0).length
  const buscarIndicador = (id: string) => {
    for (const l of datos.elementos) {
      const i = l.indicadores.find(x => x.dpl_listacotejoindicadorid === id)
      if (i) return { l, i }
    }
    return null
  }
  const editar = (l: ListaElemento, foco?: string) => navigate(`/cursos/${ctx.id}/lista/${l.elemento.sesionId}/editar`, { state: { foco } })

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
      const { enviado } = await finalizarInstrumento(ctx.id, 'lista', instrumentosRequeridos(ctx, null), proceso, user.correo)
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
  const quitarYRegistrar = async (l: ListaElemento) => {
    await quitarListaElemento(l)
    if (user) await registrarIncidencia(ctx.id, { accion: 'quitado', instrumento: 'lista', rol: rol.etiqueta, usuario: user.correo, comentario: `${l.elemento.nombre}: se eliminó su lista de cotejo${l.indicadores.length ? ` con ${l.indicadores.length} indicadores` : ''} (la consigna ahora usa ${l.elemento.consigna?.dpl_instrumento ?? 'otro instrumento'}).` })
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
        titulo="Lista de cotejo"
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
              : comentarios.length > 0 ? 'Todos los comentarios de la lista de cotejo están resueltos' : 'Aún no hay comentarios de los revisores en la lista de cotejo'}
          </span>
          <button className="link-btn" onClick={() => setFiltro({})}>Ver comentarios</button>
        </div>
      )}
      {datos.faltantes.length > 0 && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'space-between', padding: '12px 14px', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
            <Icon name="info" size={16} />
            Estos elementos ahora usan lista de cotejo en su consigna: <b>{datos.faltantes.map(e => e.nombre).join(', ')}</b>
          </span>
          {puede && user && (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => ejecutar(() => agregarAListas(ctx, datos.faltantes, user.correo), datos.faltantes.length > 1 ? 'Se agregaron a Lista de cotejo' : 'Se agregó a Lista de cotejo')}
            >
              <Icon name="plus" size={15} />Agregar a Lista de cotejo
            </button>
          )}
        </div>
      )}

      {datos.elementos.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Ningún elemento quedó preparado para lista de cotejo al activar. El instrumento se elige en cada consigna antes de activar Lista de cotejo.
        </div>
      ) : (
        <div className="consignas-layout">
          {listaOculta ? (
            <div className="consignas-rail">
              <button className="nav-btn" aria-label="Mostrar elementos" title="Mostrar elementos" onClick={() => cambiarLista(false)}>
                <Icon name="chevronRight" size={20} strokeWidth={2} />
              </button>
              {datos.elementos.map((l, i) => {
                const ok = problemaLista(l) === null
                const pendientes = pendientesDe(l)
                return (
                  <button
                    key={l.elemento.sesionId}
                    className={`rail-item${l === actual ? ' active' : ''}${ok ? ' completo' : ''}`}
                    title={`${l.elemento.nombre}${ok ? ' · completo' : ''}${pendientes ? ` · ${pendientes} comentarios pendientes` : ''}`}
                    aria-label={l.elemento.nombre}
                    onClick={() => setSeleccion(l.elemento.sesionId)}
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
            {datos.elementos.map(l => {
              const ok = problemaLista(l) === null
              const pendientes = pendientesDe(l)
              return (
                <button key={l.elemento.sesionId} className={`consigna-item${l === actual ? ' active' : ''}`} onClick={() => setSeleccion(l.elemento.sesionId)}>
                  <span style={{ flex: 1, textAlign: 'left' }}>{l.elemento.nombre}</span>
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
                Cada elemento necesita sus indicadores (hasta {REGLAS_LISTA.maxIndicadores}) y sus puntajes deben sumar {PUNTAJE_OBJETIVO} pt. Cuando todos tengan ✓, usa «Finalizar edición general».
              </span>
            </div>
          </div>
          )}

          {actual && (
            <ListaDetalle
              key={actual.elemento.sesionId}
              recursos={<RecursosCurso cursoId={ctx.id} curso={ctx.nombre} elemento={actual.elemento.nombre} queSeEvaluara={actual.elemento.consigna?.dpl_queseevaluara} />}
              lista={actual}
              editable={puede}
              intentoFinalizar={intentoFinalizar}
              comentarios={comentarios}
              puedeComentar={puedeComentar}
              campoActivo={filtro}
              onComentarios={(entidadId, campo, cita) => setFiltro({ entidadId, campo, cita })}
              onManual={() => editar(actual)}
              onIA={() => setIaPara(actual)}
              onEditar={i => editar(actual, i.dpl_listacotejoindicadorid)}
              onEliminar={setEliminar}
              onComparar={propuestas.has(actual.elemento.sesionId) ? () => setComparar(true) : undefined}
            />
          )}
        </div>
      )}

      {datos.sobrantes.map(l => (
        <section key={l.elemento.sesionId} className="panel rubrica-card rubrica-sobrante">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{l.elemento.nombre}</h2>
              <span style={{ fontSize: 13, color: '#5c3a00' }}>
                La consigna ahora usa <b>{l.elemento.consigna?.dpl_instrumento}</b>: este elemento ya no necesita lista de cotejo y no cuenta para finalizar.
                {l.indicadores.length > 0 ? ` Tiene ${l.indicadores.length} ${l.indicadores.length === 1 ? 'indicador' : 'indicadores'}.` : ''}
              </span>
            </span>
            {puede && (
              <button className="btn btn-outline btn-sm" onClick={() => (l.indicadores.length ? setQuitarLista(l) : ejecutar(() => quitarYRegistrar(l), `${l.elemento.nombre} se quitó de Lista de cotejo`))}>
                <Icon name="trash" size={15} />Quitar de Lista de cotejo
              </button>
            )}
          </div>
        </section>
      ))}

      <Modal
        open={modal === 'incompleto'}
        title="Debes crear la Lista de cotejo completa de todos los elementos para poder finalizar con la edición"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cada elemento debe tener entre 1 y {REGLAS_LISTA.maxIndicadores} indicadores completos (detalle y puntaje; las observaciones son opcionales) y sus puntajes deben sumar {PUNTAJE_OBJETIVO} pt.
        Los elementos con <Icon name="alert" size={13} /> tienen avisos en rojo.
      </Modal>
      <Modal
        open={modal === 'confirmar'}
        title="¿Finalizar edición general de Lista de cotejo?"
        onClose={() => setModal(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={finalizar}>Sí, finalizar</button>
          </>
        }
      >
        Se avisará a los revisores que la lista de cotejo está lista. Podrás seguir editando hasta que la aprueben el Monitor EA y DDA.
      </Modal>
      <Modal
        open={modal === 'enviado'}
        title="Se avisó a los aprobadores para que revisen la información"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Puedes seguir editando mientras revisan. Todo se congela solo cuando aprueben el Monitor EA y DDA.
      </Modal>
      <Modal
        open={modal === 'finalizado'}
        title="Lista de cotejo finalizada: aún falta para avisar a los aprobadores"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        <MensajeFinalizado parte="lista" requeridos={instrumentosRequeridos(ctx, null)} finalizado={proceso.finalizado} />
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
                if (i) ejecutar(() => eliminarIndicador(i), 'Se eliminó el indicador con éxito')
              }}
            >
              Sí, eliminar
            </button>
          </>
        }
      >
        {eliminar && (
          <>
            Se eliminará el <b>Indicador N°{eliminar.dpl_orden ?? ''}</b>
            {eliminar.dpl_puntaje !== null ? ` (${Number(eliminar.dpl_puntaje)} pt)` : ''} con sus comentarios. Los demás se volverán a numerar.
          </>
        )}
      </Modal>
      <Modal
        open={!!quitarLista}
        title="¿Quitar este elemento de Lista de cotejo?"
        onClose={() => setQuitarLista(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitarLista(null)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const l = quitarLista
                setQuitarLista(null)
                if (l) ejecutar(() => quitarYRegistrar(l), `${l.elemento.nombre} se quitó de Lista de cotejo`)
              }}
            >
              Sí, quitar
            </button>
          </>
        }
      >
        {quitarLista && (
          <>Se eliminará la lista de cotejo de <b>{quitarLista.elemento.nombre}</b> con sus <b>{quitarLista.indicadores.length} indicadores</b> y sus comentarios. No se puede deshacer.</>
        )}
      </Modal>
      <Modal
        open={modal === 'ia_pendiente'}
        title="Generación con IA aún no disponible"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Muy pronto la IA podrá proponer los indicadores de la lista de cotejo. Por ahora, usa «De forma manual».
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
        titulo={filtro?.campo ? 'Comentarios' : filtro?.entidadId ? `Comentarios: Indicador N°${buscarIndicador(filtro.entidadId)?.i.dpl_orden ?? ''}` : 'Comentarios de la lista de cotejo'}
        cursoId={ctx.id}
        instrumento="lista"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(id, campo) => {
          const x = buscarIndicador(id)
          return x ? `${x.l.elemento.nombre} · Indicador N°${x.i.dpl_orden ?? ''} · ${etiquetaCampo(campo)}` : etiquetaCampo(campo)
        }}
        valorItem={(id, campo) => {
          const x = buscarIndicador(id)
          if (!x || campo === CAMPO_GENERAL) return null
          const v = (x.i as unknown as Record<string, unknown>)[campo]
          return v === null || v === undefined ? '' : String(v)
        }}
        puedeComentar={puedeComentar}
        puedeResponder={puedeResponder}
        puedeResolver={rol.revisor}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
        onIrItem={(entidadId, campo) => {
          const x = buscarIndicador(entidadId)
          if (x) setSeleccion(x.l.elemento.sesionId)
          setFiltro({ entidadId, campo })
          setTimeout(() => document.getElementById(`item-${entidadId}-${campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
        }}
      />
      <SavingOverlay show={trabajando} />
      {comparar && actual && propuestas.get(actual.elemento.sesionId) && (() => {
        const p = propuestas.get(actual.elemento.sesionId)!
        // Indicators are matched by their number (N°).
        const numeros = [...new Set([...p.filas.map(f => Number(f.dpl_orden)), ...actual.indicadores.map(i => Number(i.dpl_orden))])].sort((a, b) => a - b)
        const txt = (o: Record<string, unknown>, k: string) => (o[k] === null || o[k] === undefined ? '' : String(o[k]))
        const secciones: SeccionComparada[] = numeros.map(n => {
          const ia = (p.filas.find(f => Number(f.dpl_orden) === n) ?? {}) as Record<string, unknown>
          const fin = (actual.indicadores.find(i => Number(i.dpl_orden) === n) ?? {}) as unknown as Record<string, unknown>
          return {
            titulo: `Indicador N°${n}`,
            nota: !Object.keys(ia).length ? 'Indicador agregado por el docente (no estaba en la propuesta IA).' : !Object.keys(fin).length ? 'Indicador de la propuesta IA que el docente quitó.' : undefined,
            campos: CAMPOS.map(c => ({ label: c.label, ia: txt(ia, c.campo), final: txt(fin, c.campo) })),
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

interface DetalleProps {
  lista: ListaElemento
  /** Sílabo, Formato de orientación and "Qué se evaluará". */
  recursos?: React.ReactNode
  editable: boolean
  intentoFinalizar: boolean
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: FiltroComentarios | null
  onComentarios: (entidadId: string, campo?: string, cita?: string) => void
  onManual: () => void
  onIA: () => void
  onEditar: (i: IndicadorRow) => void
  onEliminar: (i: IndicadorRow) => void
  onComparar?: () => void
}

/** Right panel: the checklist of the selected element (Figma "Lista de cotejo: <elemento>"). */
function ListaDetalle(props: DetalleProps) {
  const { lista: l, editable, intentoFinalizar, comentarios, puedeComentar } = props
  // Always visible while working; red after "Finalizar edición general" (as in Rúbricas).
  const avisos = advertenciasLista(l.indicadores)
  return (
    <section className="panel rubrica-card consigna-editor animate-in">
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--color-border)', paddingBottom: 14 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700 }}>Lista de cotejo: {l.elemento.nombre}</h2>
        {props.recursos}
        {props.onComparar && (
          <button className="btn btn-outline btn-sm" onClick={props.onComparar}>
            <Icon name="sparkles" size={14} />Comparar con propuesta IA
          </button>
        )}
      </div>

      {avisos.length > 0 && (
        <div className={`alert-banner ${intentoFinalizar ? 'alert-danger' : 'alert-warn'}`} style={{ justifyContent: 'flex-start', alignItems: 'flex-start', padding: '10px 14px' }}>
          <Icon name="alert" size={15} />
          <span style={{ display: 'flex', flexDirection: 'column', gap: 4, textAlign: 'left' }}>{avisos.map(a => <span key={a}>{a}</span>)}</span>
        </div>
      )}
      {intentoFinalizar && l.indicadores.length === 0 && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={15} />Debes crear indicadores para este elemento
        </div>
      )}

      <div className="row-between">
        <span style={{ fontSize: 15 }}>Indicadores ({l.indicadores.length})</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          <Icon name="clipboard" size={16} />Total:
          <span className="chip chip-pt">{totalLista(l.indicadores)} pt</span>
        </span>
      </div>

      {l.indicadores.map(i => (
        <IndicadorCard
          key={i.dpl_listacotejoindicadorid}
          indicador={i}
          editable={editable}
          comentarios={comentarios}
          puedeComentar={puedeComentar}
          campoActivo={props.campoActivo?.entidadId === i.dpl_listacotejoindicadorid ? props.campoActivo.campo ?? null : null}
          onComentarios={(campo, cita) => props.onComentarios(i.dpl_listacotejoindicadorid, campo, cita)}
          onEditar={() => props.onEditar(i)}
          onEliminar={() => props.onEliminar(i)}
        />
      ))}

      {editable && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {l.indicadores.length < REGLAS_LISTA.maxIndicadores ? (
            <AgregarCriterio label="Agregar indicador" onManual={props.onManual} onIA={props.onIA} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>Llegaste al máximo de {REGLAS_LISTA.maxIndicadores} indicadores.</span>
          )}
          {l.indicadores.length > 0 && (
            <button className="btn btn-outline" style={{ height: 38 }} onClick={props.onManual}>
              <Icon name="pencil" size={16} />Editar lista completa
            </button>
          )}
        </div>
      )}
    </section>
  )
}

interface IndicadorProps {
  indicador: IndicadorRow
  editable: boolean
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: string | null
  onComentarios: (campo?: string, cita?: string) => void
  onEditar: () => void
  onEliminar: () => void
}

function IndicadorCard(props: IndicadorProps) {
  const { indicador: i, editable, comentarios, puedeComentar, campoActivo } = props
  const id = i.dpl_listacotejoindicadorid
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
  const zona = (campo: string, hijos: ReactNode) => (
    <ZonaComentable citas={datosItem(comentarios, id, campo).citas} puedeComentar={puedeComentar} onComentar={cita => props.onComentarios(campo, cita)} className="nivel-zona">
      <div id={`item-${id}-${campo}`} className={campoActivo === campo ? 'coment-item-activo' : undefined}>{hijos}</div>
    </ZonaComentable>
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
      <div className="indicador-grid">
        {CAMPOS.map(c => (
          <div key={c.campo} className={c.campo === 'dpl_indicador' ? 'indicador-detalle' : undefined}>
            {zona(
              c.campo,
              <div className="nivel" style={{ height: '100%' }}>
                <div className="indicador-head coment-label">{c.label}{boton(c.campo, c.label)}</div>
                <div className="nivel-body">
                  {c.campo === 'dpl_puntaje' ? (
                    <span className="chip chip-pt" style={{ alignSelf: 'flex-start' }}>{i.dpl_puntaje === null ? '—' : `${Number(i.dpl_puntaje)} pt`}</span>
                  ) : (
                    <span style={{ whiteSpace: 'pre-wrap' }}>{i[c.campo] || '—'}</span>
                  )}
                </div>
              </div>,
            )}
          </div>
        ))}
      </div>
      {comentarios.some(k => !k.padreId && k.entidadId === id && k.campo === CAMPO_GENERAL) && (
        <div className="coment-label" style={{ justifyContent: 'flex-start', padding: '0 14px 10px' }}>
          <span style={{ fontSize: 13, fontWeight: 700 }}>Comentarios generales</span>
          {boton(CAMPO_GENERAL, 'Comentarios generales')}
        </div>
      )}
    </div>
  )
}
