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
  type CursoContexto,
  type Elemento,
  type PropuestaIA,
} from '../shared/academico'
import {
  REGLAS_MATRIZ,
  advertenciasMatriz,
  agregarAMatrices,
  eliminarPregunta,
  estandarDe,
  getMatricesCurso,
  getTaxonomia,
  plataformaDe,
  problemaMatriz,
  quitarMatrizElemento,
  totalMatriz,
  type MatricesCurso,
  type MatrizElemento,
  type PreguntaRow,
  type TaxonomiaItem,
} from '../shared/matriz'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'
import { AgregarCriterio, GenerarIA } from './RubricasPage'

/** Columns of the matrix (Power Apps "Matriz"): Criterio only with rubric. */
/** resultado = the protagonist columns (filled by the IA or the teacher; what is exported). */
const COLUMNAS: Array<{ campo: keyof PreguntaRow; label: string; soloConRubrica?: boolean; ancho?: number; resultado?: boolean }> = [
  { campo: 'dpl_nombreunidad', label: 'Unidad', ancho: 150 },
  { campo: 'dpl_ejetematico', label: 'Eje temático', ancho: 170 },
  { campo: 'dpl_taxonomia', label: 'Nivel de taxonomía', ancho: 120 },
  { campo: 'dpl_tipoitem', label: 'Tipo de ítem', ancho: 150 },
  { campo: 'dpl_cantidaditems', label: 'Ítems', ancho: 70 },
  { campo: 'dpl_indicador', label: 'Indicador (acción + contenido + condición)', resultado: true },
  { campo: 'dpl_criterio', label: 'Criterio', soloConRubrica: true, ancho: 200, resultado: true },
  { campo: 'dpl_puntajeia', label: 'P. por ítem', ancho: 90, resultado: true },
  { campo: 'dpl_puntajeestandar', label: 'P. estándar esperado', ancho: 100, resultado: true },
]
const etiquetaCampo = (campo: string) => (campo === CAMPO_GENERAL ? 'General' : COLUMNAS.find(c => c.campo === campo)?.label ?? campo)
const fmt = (n: number) => String(n).replace('.', ',')

/** Logro de la unidad / del curso, Qué se evaluará, Sílabo and Formato de orientación. */
export function recursosMatriz(ctx: CursoContexto, e: Elemento) {
  return (
    <RecursosCurso
      cursoId={ctx.id}
      curso={ctx.nombre}
      elemento={e.nombre}
      queSeEvaluara={e.consigna?.dpl_queseevaluara}
      logros={{ unidad: e.logroUnidad, nombreUnidad: e.unidadNombre, curso: ctx.logroCurso }}
    />
  )
}

/** "Suma 20, correcto" / "Suma 12, falta 8 para llegar a 20" (the lock of the Power Apps screen). */
export function SumaMatriz({ total }: { total: number }) {
  const falta = Math.round((PUNTAJE_OBJETIVO - total) * 100) / 100
  const ok = falta === 0
  return (
    <span className={`suma-matriz ${ok ? 'ok' : 'mal'}`} title="El puntaje estándar esperado de todas las preguntas debe sumar 20">
      <Icon name={ok ? 'checkCircle' : 'lock'} size={16} />
      {ok ? `Suma ${PUNTAJE_OBJETIVO}, correcto` : falta > 0 ? `Suma ${fmt(total)}, falta ${fmt(falta)} para llegar a ${PUNTAJE_OBJETIVO}` : `Suma ${fmt(total)}, sobran ${fmt(-falta)} (debe ser ${PUNTAJE_OBJETIVO})`}
    </span>
  )
}

export default function MatrizPage() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, rol)

  const [datos, setDatos] = useState<MatricesCurso | null>(null)
  const [taxonomia, setTaxonomia] = useState<TaxonomiaItem[]>([])
  const [errorDatos, setErrorDatos] = useState<string | null>(null)
  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [intentoFinalizar, setIntentoFinalizar] = useState(false)
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia_pendiente'>(null)
  const [eliminar, setEliminar] = useState<PreguntaRow | null>(null)
  const [quitarMatriz, setQuitarMatriz] = useState<MatrizElemento | null>(null)
  const [trabajando, setTrabajando] = useState(false)
  const [iaPara, setIaPara] = useState<MatrizElemento | null>(null)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const [activada, setActivada] = useState<boolean | null>(null)
  const [propuestas, setPropuestas] = useState<Map<string, PropuestaIA>>(new Map())
  const [comparar, setComparar] = useState(false)
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
    document.title = 'Matriz — Diseña+'
    getTaxonomia().then(setTaxonomia).catch(() => setTaxonomia([]))
  }, [])
  useEffect(() => {
    if (ctx) getActivacion(ctx).then(a => setActivada(a.matriz.activado)).catch(() => setActivada(true))
  }, [ctx])

  const cargar = useCallback(async () => {
    if (!ctx) return
    try {
      setDatos(await getMatricesCurso(ctx))
      setErrorDatos(null)
    } catch (err) {
      setErrorDatos(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [ctx])
  useEffect(() => {
    cargar()
  }, [cargar])

  const cargarComentarios = useCallback(() => {
    if (cursoId) getComentarios(cursoId, 'matriz').then(setComentarios).catch(() => setComentarios([]))
  }, [cursoId])
  useEffect(cargarComentarios, [cargarComentarios])

  const sesionesKey = datos?.elementos.map(m => m.elemento.sesionId).join(',') ?? ''
  useEffect(() => {
    if (sesionesKey) getPropuestasIA('matriz', sesionesKey.split(',')).then(setPropuestas).catch(() => setPropuestas(new Map()))
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

  if (loading) return <Cargando texto="Cargando matriz" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (errorDatos) return <ErrorPanel mensaje={errorDatos} onRetry={cargar} />
  if (!datos) return <Cargando texto="Cargando matriz" />
  const migas = [{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre, to: `/cursos/${ctx.id}` }, { label: 'Matriz' }]
  if (activada === false) {
    return (
      <div className="page">
        <Breadcrumbs items={migas} />
        <div className="panel aviso-activar">
          <Icon name="sparkles" size={28} />
          <p style={{ fontWeight: 700, fontSize: 17 }}>Matriz aún no está activada</p>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 520 }}>
            Primero elige el instrumento en todas las consignas del curso; luego activa Matriz desde la página del curso para preparar sus elementos.
          </p>
          <Link className="btn btn-primary" to={`/cursos/${ctx.id}`}>Ir al curso</Link>
        </div>
      </div>
    )
  }

  const problema = (m: MatrizElemento) => problemaMatriz(m, taxonomia)
  const completos = datos.elementos.filter(m => problema(m) === null).length
  const todoCompleto = datos.elementos.length > 0 && completos === datos.elementos.length
  const actual = datos.elementos.find(m => m.elemento.sesionId === seleccion) ?? datos.elementos[0] ?? null
  const puedeHabilitar = rol.monitor && proceso.disponible && proceso.estado === 'aprobado'
  const puedeComentar = rol.revisor && proceso.estado !== 'aprobado'
  const puedeResponder = rol.revisor || rol.editar
  const pendientesDe = (m: MatrizElemento) => {
    const ids = new Set(m.preguntas.map(p => p.dpl_matrizpreguntaid))
    return comentarios.filter(k => !k.padreId && !k.resuelto && ids.has(k.entidadId)).length
  }
  const observados = datos.elementos.filter(m => pendientesDe(m) > 0).length
  const buscarPregunta = (id: string) => {
    for (const m of datos.elementos) {
      const k = m.preguntas.findIndex(x => x.dpl_matrizpreguntaid === id)
      if (k >= 0) return { m, p: { ...m.preguntas[k], dpl_orden: k + 1 } }
    }
    return null
  }
  const editar = (m: MatrizElemento, foco?: string, nueva?: boolean) => navigate(`/cursos/${ctx.id}/matriz/${m.elemento.sesionId}/editar`, { state: { foco, nueva } })

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
      const { enviado } = await finalizarInstrumento(ctx.id, 'matriz', instrumentosRequeridos(ctx, null), proceso, user.correo)
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
  const quitarYRegistrar = async (m: MatrizElemento) => {
    await quitarMatrizElemento(m)
    if (user) await registrarIncidencia(ctx.id, { accion: 'quitado', instrumento: 'matriz', rol: rol.etiqueta, usuario: user.correo, comentario: `${m.elemento.nombre}: se eliminó su matriz${m.preguntas.length ? ` con ${m.preguntas.length} preguntas` : ''} (la consigna ahora usa ${m.elemento.consigna?.dpl_instrumento ?? 'otro instrumento'}).` })
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
        titulo="Matriz"
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
              : comentarios.length > 0 ? 'Todos los comentarios de la matriz están resueltos' : 'Aún no hay comentarios de los revisores en la matriz'}
          </span>
          <button className="link-btn" onClick={() => setFiltro({})}>Ver comentarios</button>
        </div>
      )}
      {datos.faltantes.length > 0 && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'space-between', padding: '12px 14px', flexWrap: 'wrap', gap: 10 }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8, textAlign: 'left' }}>
            <Icon name="info" size={16} />
            Estos elementos ahora usan matriz en su consigna: <b>{datos.faltantes.map(e => e.nombre).join(', ')}</b>
          </span>
          {puede && user && (
            <button className="btn btn-primary btn-sm" onClick={() => ejecutar(() => agregarAMatrices(datos.faltantes, user.correo), datos.faltantes.length > 1 ? 'Se agregaron a Matriz' : 'Se agregó a Matriz')}>
              <Icon name="plus" size={15} />Agregar a Matriz
            </button>
          )}
        </div>
      )}

      {datos.elementos.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Ningún elemento quedó preparado para matriz al activar. El instrumento («matriz con rúbrica» o «matriz sin rúbrica») se elige en cada consigna antes de activar Matriz.
        </div>
      ) : (
        <div className="consignas-layout">
          {listaOculta ? (
            <div className="consignas-rail">
              <button className="nav-btn" aria-label="Mostrar elementos" title="Mostrar elementos" onClick={() => cambiarLista(false)}>
                <Icon name="chevronRight" size={20} strokeWidth={2} />
              </button>
              {datos.elementos.map((m, i) => {
                const ok = problema(m) === null
                const pendientes = pendientesDe(m)
                return (
                  <button
                    key={m.elemento.sesionId}
                    className={`rail-item${m === actual ? ' active' : ''}${ok ? ' completo' : ''}`}
                    title={`${m.elemento.nombre}${ok ? ' · completo' : ''}${pendientes ? ` · ${pendientes} comentarios pendientes` : ''}`}
                    aria-label={m.elemento.nombre}
                    onClick={() => setSeleccion(m.elemento.sesionId)}
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
              {datos.elementos.map(m => {
                const ok = problema(m) === null
                const pendientes = pendientesDe(m)
                return (
                  <button key={m.elemento.sesionId} className={`consigna-item${m === actual ? ' active' : ''}`} onClick={() => setSeleccion(m.elemento.sesionId)}>
                    <span style={{ flex: 1, textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {m.elemento.nombre}
                      <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{m.conRubrica ? 'Con rúbrica' : 'Sin rúbrica'}</span>
                    </span>
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
                  Cada elemento necesita de 1 a {REGLAS_MATRIZ.maxPreguntas} indicadores y su puntaje estándar esperado (puntaje por ítem × ítems) debe sumar {PUNTAJE_OBJETIVO} pt. Cuando todos tengan ✓, usa «Finalizar edición general».
                </span>
              </div>
            </div>
          )}

          {actual && (
            <MatrizDetalle
              key={actual.elemento.sesionId}
              recursos={recursosMatriz(ctx, actual.elemento)}
              matriz={actual}
              taxonomia={taxonomia}
              editable={puede}
              intentoFinalizar={intentoFinalizar}
              comentarios={comentarios}
              puedeComentar={puedeComentar}
              campoActivo={filtro}
              onComentarios={(entidadId, campo, cita) => setFiltro({ entidadId, campo, cita })}
              onManual={() => editar(actual, undefined, true)}
              onEditarTodo={() => editar(actual)}
              onIA={() => setIaPara(actual)}
              onEditar={p => editar(actual, p.dpl_matrizpreguntaid)}
              onEliminar={p => setEliminar({ ...p, dpl_orden: actual.preguntas.indexOf(p) + 1 })}
              onComparar={propuestas.has(actual.elemento.sesionId) ? () => setComparar(true) : undefined}
            />
          )}
        </div>
      )}

      {datos.sobrantes.map(m => (
        <section key={m.elemento.sesionId} className="panel rubrica-card rubrica-sobrante">
          <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <h2 style={{ fontSize: 18, fontWeight: 700 }}>{m.elemento.nombre}</h2>
              <span style={{ fontSize: 13, color: '#5c3a00' }}>
                La consigna ahora usa <b>{m.elemento.consigna?.dpl_instrumento}</b>: este elemento ya no necesita matriz y no cuenta para finalizar.
                {m.preguntas.length > 0 ? ` Tiene ${m.preguntas.length} ${m.preguntas.length === 1 ? 'pregunta' : 'preguntas'}.` : ''}
              </span>
            </span>
            {puede && (
              <button className="btn btn-outline btn-sm" onClick={() => (m.preguntas.length ? setQuitarMatriz(m) : ejecutar(() => quitarYRegistrar(m), `${m.elemento.nombre} se quitó de Matriz`))}>
                <Icon name="trash" size={15} />Quitar de Matriz
              </button>
            )}
          </div>
        </section>
      ))}

      <Modal
        open={modal === 'incompleto'}
        title="Debes completar la Matriz de todos los elementos para poder finalizar con la edición"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cada elemento debe tener entre 1 y {REGLAS_MATRIZ.maxPreguntas} indicadores completos (unidad, eje temático, taxonomía, tipo de ítem, indicador y puntaje por ítem; con rúbrica, también el criterio) y su puntaje estándar esperado debe sumar {PUNTAJE_OBJETIVO} pt.
        Los elementos con <Icon name="alert" size={13} /> tienen avisos en rojo.
      </Modal>
      <Modal
        open={modal === 'confirmar'}
        title="¿Finalizar edición general de Matriz?"
        onClose={() => setModal(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={finalizar}>Sí, finalizar</button>
          </>
        }
      >
        Se avisará a los revisores que la matriz está lista. Podrás seguir editando hasta que la aprueben el Monitor EA y DDA.
      </Modal>
      <Modal open={modal === 'enviado'} title="Se avisó a los aprobadores para que revisen la información" onClose={() => setModal(null)} actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}>
        Puedes seguir editando mientras revisan. Todo se congela solo cuando aprueben el Monitor EA y DDA.
      </Modal>
      <Modal open={modal === 'finalizado'} title="Matriz finalizada: aún falta para avisar a los aprobadores" onClose={() => setModal(null)} actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}>
        <MensajeFinalizado parte="matriz" requeridos={instrumentosRequeridos(ctx, null)} finalizado={proceso.finalizado} />
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
                const p = eliminar
                setEliminar(null)
                if (p) ejecutar(() => eliminarPregunta(p), 'Se eliminó el indicador con éxito')
              }}
            >
              Sí, eliminar
            </button>
          </>
        }
      >
        {eliminar && <>Se eliminará el <b>Indicador N°{eliminar.dpl_orden ?? ''}</b> ({fmt(estandarDe(eliminar))} pt) con sus comentarios. Los demás se volverán a numerar.</>}
      </Modal>
      <Modal
        open={!!quitarMatriz}
        title="¿Quitar este elemento de Matriz?"
        onClose={() => setQuitarMatriz(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitarMatriz(null)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const m = quitarMatriz
                setQuitarMatriz(null)
                if (m) ejecutar(() => quitarYRegistrar(m), `${m.elemento.nombre} se quitó de Matriz`)
              }}
            >
              Sí, quitar
            </button>
          </>
        }
      >
        {quitarMatriz && <>Se eliminará la matriz de <b>{quitarMatriz.elemento.nombre}</b> con sus <b>{quitarMatriz.preguntas.length} preguntas</b> y sus comentarios. No se puede deshacer.</>}
      </Modal>
      <Modal open={modal === 'ia_pendiente'} title="Generación con IA aún no disponible" onClose={() => setModal(null)} actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}>
        Muy pronto la IA podrá generar el indicador{actual?.conRubrica ? ', el criterio' : ''} y los puntajes a partir de los datos que elijas. Por ahora, usa «De forma manual».
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
        titulo={filtro?.campo ? 'Comentarios' : filtro?.entidadId ? `Comentarios: Indicador N°${buscarPregunta(filtro.entidadId)?.p.dpl_orden ?? ''}` : 'Comentarios de la matriz'}
        cursoId={ctx.id}
        instrumento="matriz"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(id, campo) => {
          const x = buscarPregunta(id)
          return x ? `${x.m.elemento.nombre} · Indicador N°${x.p.dpl_orden ?? ''} · ${etiquetaCampo(campo)}` : etiquetaCampo(campo)
        }}
        valorItem={(id, campo) => {
          const x = buscarPregunta(id)
          if (!x || campo === CAMPO_GENERAL) return null
          const v = (x.p as unknown as Record<string, unknown>)[campo]
          return v === null || v === undefined ? '' : String(v)
        }}
        puedeComentar={puedeComentar}
        puedeResponder={puedeResponder}
        puedeResolver={rol.revisor}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
        onIrItem={(entidadId, campo) => {
          const x = buscarPregunta(entidadId)
          if (x) setSeleccion(x.m.elemento.sesionId)
          setFiltro({ entidadId, campo })
          setTimeout(() => document.getElementById(`item-${entidadId}-${campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
        }}
      />
      <SavingOverlay show={trabajando} />
      {comparar && actual && propuestas.get(actual.elemento.sesionId) && (() => {
        const p = propuestas.get(actual.elemento.sesionId)!
        const numeros = [...new Set([...p.filas.map(f => Number(f.dpl_orden)), ...actual.preguntas.map(q => Number(q.dpl_orden))])].sort((a, b) => a - b)
        const txt = (o: Record<string, unknown>, k: string) => (o[k] === null || o[k] === undefined ? '' : String(o[k]))
        const columnas = COLUMNAS.filter(c => actual.conRubrica || !c.soloConRubrica)
        const secciones: SeccionComparada[] = numeros.map(n => {
          const ia = (p.filas.find(f => Number(f.dpl_orden) === n) ?? {}) as Record<string, unknown>
          const fin = (actual.preguntas.find(q => Number(q.dpl_orden) === n) ?? {}) as unknown as Record<string, unknown>
          return {
            titulo: `Indicador N°${n}`,
            nota: !Object.keys(ia).length ? 'Indicador agregado por el docente (no estaba en la propuesta IA).' : !Object.keys(fin).length ? 'Indicador de la propuesta IA que el docente quitó.' : undefined,
            campos: columnas.map(c => ({ label: c.label, ia: txt(ia, c.campo), final: txt(fin, c.campo) })),
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
  matriz: MatrizElemento
  recursos?: ReactNode
  taxonomia: TaxonomiaItem[]
  editable: boolean
  intentoFinalizar: boolean
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: FiltroComentarios | null
  onComentarios: (entidadId: string, campo?: string, cita?: string) => void
  onManual: () => void
  onEditarTodo: () => void
  onIA: () => void
  onEditar: (p: PreguntaRow) => void
  onEliminar: (p: PreguntaRow) => void
  onComparar?: () => void
}

/** Right panel: the matrix of the selected element as the Power Apps table. */
function MatrizDetalle(props: DetalleProps) {
  const { matriz: m, taxonomia, editable, intentoFinalizar, comentarios, puedeComentar } = props
  const avisos = advertenciasMatriz(m.preguntas, m.conRubrica, taxonomia)
  const columnas = COLUMNAS.filter(c => m.conRubrica || !c.soloConRubrica)
  return (
    <section className="panel rubrica-card consigna-editor animate-in" style={{ minWidth: 0 }}>
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10, borderBottom: '1px solid var(--color-border)', paddingBottom: 14 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700 }}>Matriz: {m.elemento.nombre}</h2>
          <span className={`chip ${m.conRubrica ? 'chip-pt' : 'chip-gris'}`} style={{ alignSelf: 'flex-start' }}>{m.conRubrica ? 'Matriz con rúbrica' : 'Matriz sin rúbrica'}</span>
        </span>
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
      {intentoFinalizar && m.preguntas.length === 0 && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={15} />Debes crear indicadores para este elemento
        </div>
      )}

      <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
        <span style={{ fontSize: 15 }}>Indicadores ({m.preguntas.length} de {REGLAS_MATRIZ.maxPreguntas})</span>
        <SumaMatriz total={totalMatriz(m.preguntas)} />
      </div>

      {m.preguntas.length > 0 && (
        <div className="matriz-scroll">
          <table className="matriz-tabla">
            <thead>
              <tr className="matriz-grupos">
                <th />
                <th colSpan={columnas.filter(c => !c.resultado).length}>Datos para generar</th>
                <th colSpan={columnas.filter(c => c.resultado).length} className="col-resultado">
                  {m.conRubrica ? 'Indicador, criterio y puntajes' : 'Indicador y puntajes'}
                </th>
                {editable && <th />}
              </tr>
              <tr>
                <th style={{ width: 56 }}>N°</th>
                {columnas.map(c => <th key={c.campo} className={c.resultado ? 'col-resultado' : undefined} style={c.ancho ? { width: c.ancho } : undefined}>{c.label}</th>)}
                {editable && <th style={{ width: 48 }} aria-label="Acciones" />}
              </tr>
            </thead>
            <tbody>
              {m.preguntas.map((p, i) => (
                <FilaPregunta
                  key={p.dpl_matrizpreguntaid}
                  numero={i + 1}
                  pregunta={p}
                  columnas={columnas}
                  plataforma={p.dpl_plataforma || plataformaDe(taxonomia, p.dpl_tipoitem)}
                  editable={editable}
                  comentarios={comentarios}
                  puedeComentar={puedeComentar}
                  campoActivo={props.campoActivo?.entidadId === p.dpl_matrizpreguntaid ? props.campoActivo.campo ?? null : null}
                  onComentarios={(campo, cita) => props.onComentarios(p.dpl_matrizpreguntaid, campo, cita)}
                  onEditar={() => props.onEditar(p)}
                  onEliminar={() => props.onEliminar(p)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          {m.preguntas.length < REGLAS_MATRIZ.maxPreguntas ? (
            <AgregarCriterio label="Agregar indicador" onManual={props.onManual} onIA={props.onIA} />
          ) : (
            <span style={{ fontSize: 13, color: 'var(--color-text-muted)', alignSelf: 'center' }}>Llegaste al máximo de {REGLAS_MATRIZ.maxPreguntas} indicadores.</span>
          )}
          {m.preguntas.length > 0 && (
            <button className="btn btn-outline" style={{ height: 38 }} onClick={props.onEditarTodo}>
              <Icon name="pencil" size={16} />Editar matriz completa
            </button>
          )}
        </div>
      )}
    </section>
  )
}

interface FilaProps {
  /** Position in the matrix (the saved N° may have gaps from old imports; saving renumbers). */
  numero: number
  pregunta: PreguntaRow
  columnas: typeof COLUMNAS
  plataforma: string
  editable: boolean
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: string | null
  onComentarios: (campo?: string, cita?: string) => void
  onEditar: () => void
  onEliminar: () => void
}

function FilaPregunta(props: FilaProps) {
  const { pregunta: p, columnas, plataforma, editable, comentarios, puedeComentar, campoActivo } = props
  const id = p.dpl_matrizpreguntaid
  const [menu, setMenu] = useState(false)
  const ref = useRef<HTMLTableCellElement>(null)
  useEffect(() => {
    if (!menu) return
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setMenu(false)
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menu])
  const valor = (campo: keyof PreguntaRow): ReactNode => {
    if (campo === 'dpl_puntajeestandar') return <span className="chip chip-pt">{fmt(estandarDe(p))} pt</span>
    if (campo === 'dpl_puntajeia') return p.dpl_puntajeia === null ? '—' : `${fmt(Number(p.dpl_puntajeia))} pt`
    if (campo === 'dpl_cantidaditems') return p.dpl_cantidaditems ?? 1
    if (campo === 'dpl_tipoitem')
      return (
        <span style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {p.dpl_tipoitem || '—'}
          {plataforma && <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>En plataforma: {plataforma}</span>}
        </span>
      )
    const v = p[campo]
    return v === null || v === undefined || String(v).trim() === '' ? '—' : String(v)
  }
  return (
    <tr id={`pregunta-${id}`}>
      <td style={{ textAlign: 'center', fontWeight: 700 }}>{props.numero}</td>
      {columnas.map(c => (
        <td key={c.campo} className={c.resultado ? 'col-resultado' : 'col-datos'}>
          <ZonaComentable citas={datosItem(comentarios, id, c.campo).citas} puedeComentar={puedeComentar} onComentar={cita => props.onComentarios(c.campo, cita)} className="nivel-zona">
            <div id={`item-${id}-${c.campo}`} className={`matriz-celda${campoActivo === c.campo ? ' coment-item-activo' : ''}`}>
              <span style={{ whiteSpace: 'pre-wrap', flex: 1 }}>{valor(c.campo)}</span>
              <BotonComentarios estado={datosItem(comentarios, id, c.campo).estado} puedeComentar={puedeComentar} activo={campoActivo === c.campo} label={c.label} onClick={() => props.onComentarios(c.campo)} />
            </div>
          </ZonaComentable>
        </td>
      ))}
      {editable && (
        <td ref={ref} style={{ position: 'relative' }}>
          <button className="icon-btn" aria-label="Más opciones" onClick={() => setMenu(o => !o)}>
            <Icon name="dots" size={20} strokeWidth={2.4} />
          </button>
          {menu && (
            <div className="menu">
              <button onClick={() => { setMenu(false); props.onEditar() }}>Editar</button>
              <button onClick={() => { setMenu(false); props.onEliminar() }}>Eliminar</button>
            </div>
          )}
        </td>
      )}
    </tr>
  )
}
