import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import ComparadorIA from '../components/ComparadorIA'
import { MensajeFinalizado } from '../components/Aprobaciones'
import { BotonComentarios, CAMPO_GENERAL, PanelComentarios, ZonaComentable, datosItem, type FiltroComentarios } from '../components/Comentarios'
import TextoEnriquecido from '../components/TextoEnriquecido'
import DatosAdjuntos from '../components/DatosAdjuntos'
import { Link } from 'react-router-dom'
import {
  Breadcrumbs,
  Cargando,
  CursoHeader,
  ErrorPanel,
  Modal,
  ProgressBar,
  SavingOverlay,
  useToast,
} from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  CAMPOS_CONSIGNA,
  INSTRUMENTO_VALORES,
  finalizarInstrumento,
  getActivacion,
  getComentarios,
  getPropuestasIA,
  type PropuestaIA,
  getRubricasCurso,
  guardarConsigna,
  habilitarEdicion,
  instrumentosRequeridos,
  tipoInstrumento,
  validarConsigna,
  type Comentario,
  type ConsignaCampos,
  type Elemento,
} from '../shared/academico'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'

const INSTRUMENTOS: Array<{ tipo: ReturnType<typeof tipoInstrumento>; label: string; valor: string }> = [
  { tipo: 'rubrica', label: 'Rúbrica', valor: INSTRUMENTO_VALORES.rubrica },
  { tipo: 'matriz', label: 'Matriz', valor: INSTRUMENTO_VALORES.matrizSin },
  { tipo: 'lista', label: 'Lista de cotejo', valor: INSTRUMENTO_VALORES.lista },
  { tipo: 'escala', label: 'Escala de valoración', valor: INSTRUMENTO_VALORES.escala },
  { tipo: 'escala', label: 'Escala de valoración (administración)', valor: INSTRUMENTO_VALORES.escalaAdmin },
  { tipo: null, label: 'No aplica', valor: INSTRUMENTO_VALORES.noAplica },
]

type EstadoGuardado = 'idle' | 'guardando' | 'guardado' | 'error'

export default function ConsignasPage() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const { user } = useAuth()
  const toast = useToast()
  const { ctx, setCtx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, rol)

  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [mostrarErrores, setMostrarErrores] = useState(false)
  const [guardado, setGuardado] = useState<EstadoGuardado>('idle')
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia'>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [requeridos, setRequeridos] = useState<string[]>(['consignas'])
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const [activada, setActivada] = useState<boolean | null>(null)
  // The elements list can be hidden to give the consigna the whole width (remembered per browser).
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
  const pendientes = useRef(new Map<string, Partial<ConsignaCampos>>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    document.title = 'Consignas — Diseña+'
  }, [])

  const cargarComentarios = useCallback(() => {
    if (cursoId) getComentarios(cursoId, 'consignas').then(setComentarios).catch(() => setComentarios([]))
  }, [cursoId])
  useEffect(cargarComentarios, [cargarComentarios])

  // Initial IA proposal of each consigna (BACKUP list), to compare with the final version.
  const [propuestas, setPropuestas] = useState<Map<string, PropuestaIA>>(new Map())
  const [comparar, setComparar] = useState(false)
  const sesionesKey = ctx?.elementos.map(e => e.sesionId).join(',') ?? ''
  useEffect(() => {
    if (sesionesKey) getPropuestasIA('consignas', sesionesKey.split(',')).then(setPropuestas).catch(() => setPropuestas(new Map()))
  }, [sesionesKey])

  useEffect(() => {
    // Also when moving to another course: the previous selection does not belong to it.
    if (ctx && ctx.elementos.length && !ctx.elementos.some(e => e.sesionId === seleccion)) setSeleccion(ctx.elementos[0].sesionId)
  }, [ctx, seleccion])

  // Autosave: edits are applied locally at once and flushed to the database
  // after a short pause, so typing never waits on the network.
  const flush = useCallback(async () => {
    if (!ctx || !user) return
    const lote = [...pendientes.current.entries()]
    pendientes.current.clear()
    if (!lote.length) return
    setGuardado('guardando')
    try {
      for (const [sesionId, campos] of lote) {
        const el = ctx.elementos.find(e => e.sesionId === sesionId)
        if (!el) continue
        const row = await guardarConsigna(el, ctx.idCursoText, campos, user.correo)
        setCtx(prev =>
          prev && {
            ...prev,
            elementos: prev.elementos.map(e =>
              e.sesionId === sesionId ? { ...e, consigna: { ...row, ...(e.consigna ? pickCampos(e.consigna) : {}) } } : e,
            ),
          },
        )
      }
      setGuardado('guardado')
    } catch (err) {
      setGuardado('error')
      toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
    }
  }, [ctx, user, setCtx, toast])

  useEffect(() => () => clearTimeout(timer.current), [])

  const editar = (el: Elemento, campos: Partial<ConsignaCampos>) => {
    setCtx(prev =>
      prev && {
        ...prev,
        elementos: prev.elementos.map(e =>
          e.sesionId === el.sesionId
            ? {
                ...e,
                consigna: {
                  ...(e.consigna ?? {
                    dpl_consignaid: '',
                    dpl_idconsignatext: null,
                    dpl_indicaciongeneral: null,
                    dpl_indicacionesespecificas: null,
                    dpl_recomendaciones: null,
                    dpl_anexo: null,
                    dpl_instrumento: null,
                    dpl_sesionid: e.sesionId,
                  }),
                  ...campos,
                },
              }
            : e,
        ),
      },
    )
    pendientes.current.set(el.sesionId, { ...pendientes.current.get(el.sesionId), ...campos })
    setGuardado('guardando')
    clearTimeout(timer.current)
    timer.current = setTimeout(flush, 900)
  }

  const validaciones = useMemo(
    () => new Map((ctx?.elementos ?? []).map(e => [e.sesionId, validarConsigna(e.consigna)])),
    [ctx],
  )

  useEffect(() => {
    if (ctx) getActivacion(ctx).then(a => setActivada(a.consignas.activado)).catch(() => setActivada(true))
  }, [ctx])

  if (loading) return <Cargando texto="Cargando consignas" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />

  const completos = ctx.elementos.filter(e => validaciones.get(e.sesionId)?.completa).length
  const todoCompleto = ctx.elementos.length > 0 && completos === ctx.elementos.length
  const el = ctx.elementos.find(e => e.sesionId === seleccion) ?? null
  const esMonitor = rol.monitor
  const puedeHabilitar = esMonitor && proceso.disponible && proceso.estado === 'aprobado'
  // Everything depends on the person's role in THIS course (LISTADO_CURSOS_PARA_IA):
  // Monitor EA / DDA open and resolve comments; the teaching team replies; all can read.
  const puedeComentar = (rol.monitor || rol.dda) && proceso.estado !== 'aprobado'
  const puedeResponder = rol.monitor || rol.dda || rol.editar
  const campoLabel = (campo: string) =>
    campo === 'dpl_instrumento' ? 'Instrumento' : campo === 'adjuntos' ? 'Datos adjuntos' : campo === CAMPO_GENERAL ? 'General' : CAMPOS_CONSIGNA.find(c => c.key === campo)?.label.replace(' (Opcional)', '') ?? campo
  const elDeConsigna = (id: string) => ctx.elementos.find(e => e.consigna?.dpl_consignaid === id)
  const irItem = (entidadId: string, campo: string) => {
    const destino = elDeConsigna(entidadId)
    if (destino) setSeleccion(destino.sesionId)
    setFiltro({ entidadId, campo })
    setTimeout(() => document.getElementById(`item-${campo}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
  }

  const pedirFinalizar = async () => {
    clearTimeout(timer.current)
    await flush()
    if (!todoCompleto) {
      setMostrarErrores(true)
      setModal('incompleto')
    } else setModal('confirmar')
  }

  const finalizar = async () => {
    if (!user) return
    setModal(null)
    setFinalizando(true)
    try {
      const rubricas = await getRubricasCurso(ctx)
      const req = instrumentosRequeridos(ctx, rubricas)
      setRequeridos(req)
      const { enviado } = await finalizarInstrumento(ctx.id, 'consignas', req, proceso, user.correo)
      await recargar()
      setModal(enviado ? 'enviado' : 'finalizado')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo finalizar.', 'error')
    } finally {
      setFinalizando(false)
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

  if (activada === false) {
    return (
      <div className="page">
        <Breadcrumbs items={[{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre, to: `/cursos/${ctx.id}` }, { label: 'Consignas' }]} />
        <div className="panel aviso-activar">
          <Icon name="sparkles" size={28} />
          <p style={{ fontWeight: 700, fontSize: 17 }}>Consignas aún no está activado</p>
          <p style={{ color: 'var(--color-text-muted)', maxWidth: 480 }}>Actívalo desde la página del curso para preparar los elementos de evaluación.</p>
          <Link className="btn btn-primary" to={`/cursos/${ctx.id}`}>Ir al curso</Link>
        </div>
      </div>
    )
  }

  return (
    <div className="page">
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Consignas' },
        ]}
      />
      <CursoHeader
        titulo="Consignas"
        curso={ctx.nombre}
        tipoEnsenanza={ctx.tipoEnsenanza}
        programas={ctx.programas}
        acciones={
          <>
            <IndicadorGuardado estado={guardado} />
            {puedeHabilitar ? (
              <button className="btn btn-primary" style={{ height: 44 }} onClick={habilitar}>Habilitar edición</button>
            ) : (
              <button
                className="btn btn-primary"
                style={{ height: 44 }}
                disabled={!puede || !proceso.disponible}
                title={!proceso.disponible ? 'Falta ejecutar supabase/schema-flujo.sql' : motivo || undefined}
                onClick={pedirFinalizar}
              >
                Finalizar edición general
              </button>
            )}
          </>
        }
      />

      {!puede && motivo && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
          <Icon name="info" size={16} />{motivo}
        </div>
      )}

      {ctx.elementos.length === 0 ? (
        <div className="panel" style={{ padding: 48, textAlign: 'center', color: 'var(--color-text-muted)' }}>
          Este curso aún no tiene elementos de evaluación cargados en su sílabo.
        </div>
      ) : (
        <div className="consignas-layout">
          {listaOculta ? (
            <div className="consignas-rail">
              <button className="nav-btn" aria-label="Mostrar elementos" title="Mostrar elementos" onClick={() => cambiarLista(false)}>
                <Icon name="chevronRight" size={20} strokeWidth={2} />
              </button>
              {ctx.elementos.map((e, i) => {
                const v = validaciones.get(e.sesionId)
                const pendientesEl = comentarios.filter(c => !c.padreId && !c.resuelto && c.entidadId === e.consigna?.dpl_consignaid).length
                return (
                  <button
                    key={e.sesionId}
                    className={`rail-item${e.sesionId === seleccion ? ' active' : ''}${v?.completa ? ' completo' : ''}`}
                    title={`${e.nombre}${v?.completa ? ' · completo' : ''}${pendientesEl ? ` · ${pendientesEl} comentarios pendientes` : ''}`}
                    aria-label={e.nombre}
                    onClick={() => setSeleccion(e.sesionId)}
                  >
                    {i + 1}
                    {pendientesEl > 0 && <span className="rail-dot" />}
                  </button>
                )
              })}
            </div>
          ) : (
          <div className="consignas-lista">
            <div className="row-between" style={{ padding: '0 4px', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Elementos ({ctx.elementos.length})</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {todoCompleto ? (
                  <span className="chip chip-aprobado"><Icon name="checkCircle" size={14} />Completo</span>
                ) : (
                  <span style={{ fontSize: 13, color: '#3d434a' }}>{completos} de {ctx.elementos.length} completados</span>
                )}
                <button className="nav-btn" aria-label="Ocultar elementos" title="Ocultar elementos" onClick={() => cambiarLista(true)}>
                  <Icon name="chevronLeft" size={20} strokeWidth={2} />
                </button>
              </span>
            </div>
            <div style={{ padding: '0 4px 6px' }}><ProgressBar value={(completos / ctx.elementos.length) * 100} /></div>
            {ctx.elementos.map(e => {
              const v = validaciones.get(e.sesionId)
              const pendientesEl = comentarios.filter(c => !c.padreId && !c.resuelto && c.entidadId === e.consigna?.dpl_consignaid).length
              return (
                <button
                  key={e.sesionId}
                  className={`consigna-item${e.sesionId === seleccion ? ' active' : ''}`}
                  onClick={() => setSeleccion(e.sesionId)}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>{e.nombre}</span>
                  {pendientesEl > 0 && <span className="chip chip-pt" style={{ display: 'inline-flex', gap: 4 }} title={`${pendientesEl} comentarios pendientes`}><Icon name="comment" size={13} />{pendientesEl}</span>}
                  {v?.completa ? (
                    <span style={{ color: 'var(--color-success)', display: 'flex' }} aria-label="Completo"><Icon name="checkCircle" size={18} strokeWidth={2} /></span>
                  ) : mostrarErrores ? (
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
                Completa los campos de cada elemento. Cuando todos tengan ✓, usa «Finalizar edición general» para avisar al Monitor EA y DDA que pueden revisar. Podrás seguir editando hasta que aprueben el Monitor EA y DDA.
              </span>
            </div>
          </div>
          )}

          {el && (
            <EditorConsigna
              key={el.sesionId}
              el={el}
              editable={puede}
              mostrarErrores={mostrarErrores}
              onChange={campos => editar(el, campos)}
              onIA={() => setModal('ia')}
              onComparar={propuestas.has(el.sesionId) ? () => setComparar(true) : undefined}
              comentarios={comentarios}
              puedeComentar={puedeComentar}
              campoActivo={filtro?.entidadId && filtro.entidadId === el.consigna?.dpl_consignaid ? filtro.campo ?? null : null}
              onComentarios={(campo, cita) => el.consigna?.dpl_consignaid && setFiltro({ entidadId: el.consigna.dpl_consignaid, campo, cita })}
            />
          )}
        </div>
      )}

      <Modal
        open={modal === 'confirmar'}
        title="¿Finalizar edición general de consignas?"
        onClose={() => setModal(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setModal(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={finalizar}>Sí, finalizar</button>
          </>
        }
      >
        Se avisará al Monitor EA y DDA que las consignas están listas para revisar. Podrás seguir editando hasta que las aprueben.
      </Modal>
      <Modal
        open={modal === 'incompleto'}
        title="Hay elementos incompletos o incorrectos"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cada elemento debe tener el instrumento elegido y todos los campos obligatorios completos, sin exceder el límite de caracteres de cada campo.
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
        title="Consignas finalizadas: aún falta para avisar a los aprobadores"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        <MensajeFinalizado parte="consignas" requeridos={requeridos} finalizado={proceso.finalizado} />
      </Modal>
      <Modal
        open={modal === 'ia'}
        title="Generación con IA aún no disponible"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Muy pronto podrás generar una propuesta automática de la consigna a partir de la información del curso. Por ahora, completa los campos manualmente.
      </Modal>
      <SavingOverlay show={finalizando} />
      {el && propuestas.get(el.sesionId) && (() => {
        const p = propuestas.get(el.sesionId)!
        const ia = p.filas[0] ?? {}
        const c = (el.consigna ?? {}) as unknown as Record<string, unknown>
        return (
          <ComparadorIA
            open={comparar}
            onClose={() => setComparar(false)}
            titulo={`Propuesta IA vs versión final · ${el.nombre}`}
            detalle={`Propuesta IA del ${new Date(p.fecha).toLocaleString('es-PE', { dateStyle: 'short', timeStyle: 'short' })}${p.modelo ? ` · ${p.modelo}` : ''}${p.herramienta ? ` (${p.herramienta})` : ''}`}
            secciones={[
              {
                titulo: 'Consigna',
                campos: [
                  { label: 'Instrumento', ia: String(ia.dpl_instrumento ?? ''), final: String(c.dpl_instrumento ?? '') },
                  ...CAMPOS_CONSIGNA.map(k => ({ label: k.label.replace(' (Opcional)', ''), ia: String(ia[k.key] ?? ''), final: String(c[k.key] ?? '') })),
                ],
              },
            ]}
          />
        )
      })()}

      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={filtro?.campo ? 'Comentarios' : `Comentarios: ${filtro?.entidadId ? elDeConsigna(filtro.entidadId)?.nombre ?? '' : 'todas las consignas'}`}
        cursoId={ctx.id}
        instrumento="consignas"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(id, campo) => `${elDeConsigna(id)?.nombre ?? 'Consigna'} · ${campoLabel(campo)}`}
        valorItem={(id, campo) => {
          const c = elDeConsigna(id)?.consigna
          if (!c || campo === 'adjuntos' || campo === CAMPO_GENERAL) return null
          return String((c as unknown as Record<string, unknown>)[campo] ?? '')
        }}
        puedeComentar={puedeComentar}
        puedeResponder={puedeResponder}
        puedeResolver={rol.monitor || rol.dda}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
        onIrItem={irItem}
      />
    </div>
  )
}

function pickCampos(c: ConsignaCampos): ConsignaCampos {
  return {
    dpl_indicaciongeneral: c.dpl_indicaciongeneral,
    dpl_indicacionesespecificas: c.dpl_indicacionesespecificas,
    dpl_recomendaciones: c.dpl_recomendaciones,
    dpl_anexo: c.dpl_anexo,
    dpl_instrumento: c.dpl_instrumento,
  }
}

function IndicadorGuardado({ estado }: { estado: EstadoGuardado }) {
  if (estado === 'idle') return null
  return (
    <span style={{ fontSize: 13, color: estado === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
      {estado === 'guardando' && <>Guardando información <span className="spinner" style={{ display: 'flex' }}><Icon name="spinner" size={14} strokeWidth={2.4} /></span></>}
      {estado === 'guardado' && <><Icon name="check" size={14} strokeWidth={2.4} />Cambios guardados</>}
      {estado === 'error' && <><Icon name="alert" size={14} />No se guardó</>}
    </span>
  )
}

interface EditorProps {
  el: Elemento
  editable: boolean
  mostrarErrores: boolean
  onChange: (campos: Partial<ConsignaCampos>) => void
  onIA: () => void
  onComparar?: () => void
  comentarios: Comentario[]
  puedeComentar: boolean
  campoActivo: string | null
  /** campo undefined = every comment of this consigna. */
  onComentarios: (campo?: string, cita?: string) => void
}

function EditorConsigna({ el, editable, mostrarErrores, onChange, onIA, onComparar, comentarios, puedeComentar, campoActivo, onComentarios }: EditorProps) {
  const consignaId = el.consigna?.dpl_consignaid
  const pendientes = comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === consignaId).length
  const boton = (campo: string, label: string) =>
    consignaId ? (
      <BotonComentarios estado={datosItem(comentarios, consignaId, campo).estado} puedeComentar={puedeComentar} activo={campoActivo === campo} label={label} onClick={() => onComentarios(campo)} />
    ) : null
  const c = el.consigna
  const tipo = tipoInstrumento(c?.dpl_instrumento)
  const { errores } = validarConsigna(c)
  const valor = (c?.dpl_instrumento ?? '').toLowerCase()

  return (
    <section className="panel consigna-editor">
      <div className="row-between" style={{ paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Consigna: {el.nombre}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {consignaId ? (
            <button className="btn btn-outline" style={{ height: 42 }} onClick={() => onComentarios()}>
              <Icon name="comment" size={16} />{pendientes ? `Comentarios pendientes (${pendientes})` : 'Comentarios'}
            </button>
          ) : null}
          {onComparar && (
            <button className="btn btn-outline" style={{ height: 42 }} onClick={onComparar}>
              <Icon name="sparkles" size={16} />Comparar con propuesta IA
            </button>
          )}
          {editable && (
            <button className="btn btn-outline" style={{ height: 42 }} onClick={onIA}>
              <Icon name="sparkles" size={16} />Generar contenido
            </button>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <span className="field-label" style={{ marginBottom: 0 }}>Logro a evaluar</span>
        <p className="readonly-box">{el.logroUnidad || 'La unidad aún no tiene un logro específico cargado.'}</p>
      </div>

      <div id="item-dpl_instrumento" className={campoActivo === 'dpl_instrumento' ? 'coment-item-activo' : undefined} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div className="coment-label"><span className="field-label" style={{ marginBottom: 0 }}>Instrumento</span>{boton('dpl_instrumento', 'Instrumento')}</div>
      <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: 10 }} disabled={!editable}>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
          {INSTRUMENTOS.map(i => (
            <label key={i.label} className="radio">
              <input
                type="radio"
                name={`inst-${el.sesionId}`}
                checked={i.tipo === 'escala' || i.tipo === null ? valor === i.valor : tipo === i.tipo}
                onChange={() => onChange({ dpl_instrumento: i.valor })}
              />
              {i.label}
            </label>
          ))}
        </div>
        {tipo === 'matriz' && (
          <div className="sub-opciones">
            <label className="radio"><input type="radio" name={`mat-${el.sesionId}`} checked={valor === INSTRUMENTO_VALORES.matrizCon} onChange={() => onChange({ dpl_instrumento: INSTRUMENTO_VALORES.matrizCon })} />Con rúbrica</label>
            <label className="radio"><input type="radio" name={`mat-${el.sesionId}`} checked={valor === INSTRUMENTO_VALORES.matrizSin} onChange={() => onChange({ dpl_instrumento: INSTRUMENTO_VALORES.matrizSin })} />Sin rúbrica</label>
          </div>
        )}
        {mostrarErrores && errores.dpl_instrumento && (
          <span className="field-error"><Icon name="alert" size={14} />{errores.dpl_instrumento}</span>
        )}
      </fieldset>
      </div>

      {valor === INSTRUMENTO_VALORES.noAplica && (
        <div className="alert-banner alert-info" style={{ justifyContent: 'flex-start', padding: '10px 14px' }}>
          <Icon name="info" size={16} />Este elemento no usa instrumento de evaluación; no aparecerá en Rúbricas, Matriz, Lista ni Escala.
        </div>
      )}
      {CAMPOS_CONSIGNA.map(campo => (
        <ZonaComentable
          key={campo.key}
          citas={datosItem(comentarios, consignaId, campo.key).citas}
          puedeComentar={puedeComentar && !!consignaId}
          onComentar={cita => onComentarios(campo.key, cita)}
        >
          <div id={`item-${campo.key}`} className={campoActivo === campo.key ? 'coment-item-activo' : undefined}>
            <TextoEnriquecido
              id={`${campo.key}-${el.sesionId}`}
              label={campo.label}
              value={c?.[campo.key] ?? ''}
              max={campo.max}
              readOnly={!editable}
              error={mostrarErrores ? errores[campo.key] : undefined}
              onChange={v => onChange({ [campo.key]: v })}
              accion={boton(campo.key, campo.label)}
            />
          </div>
        </ZonaComentable>
      ))}
      <div id="item-adjuntos" className={campoActivo === 'adjuntos' ? 'coment-item-activo' : undefined}>
        <DatosAdjuntos consignaId={c?.dpl_consignaid || null} editable={editable} titulo={el.nombre} accion={boton('adjuntos', 'Datos adjuntos')} />
      </div>
      {consignaId && comentarios.some(k => !k.padreId && k.entidadId === consignaId && k.campo === CAMPO_GENERAL) && (
        <div className="coment-label" id="item-general">
          <span className="field-label" style={{ marginBottom: 0 }}>Comentarios generales (anteriores)</span>
          {boton(CAMPO_GENERAL, 'Comentarios generales')}
        </div>
      )}
    </section>
  )
}
