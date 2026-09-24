import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import Comentarios from '../components/Comentarios'
import {
  Breadcrumbs,
  CampoTexto,
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
  LIMITES,
  finalizarInstrumento,
  getComentarios,
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
]

type EstadoGuardado = 'idle' | 'guardando' | 'guardado' | 'error'

export default function ConsignasPage() {
  const { cursoId } = useParams<{ cursoId: string }>()
  const { user, can } = useAuth()
  const toast = useToast()
  const { ctx, setCtx, proceso, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede, motivo } = usePuedeEditar(proceso, 'consignas')

  const [seleccion, setSeleccion] = useState<string | null>(null)
  const [mostrarErrores, setMostrarErrores] = useState(false)
  const [guardado, setGuardado] = useState<EstadoGuardado>('idle')
  const [modal, setModal] = useState<null | 'confirmar' | 'incompleto' | 'enviado' | 'finalizado' | 'ia'>(null)
  const [finalizando, setFinalizando] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [verComentarios, setVerComentarios] = useState(false)
  const pendientes = useRef(new Map<string, Partial<ConsignaCampos>>())
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    document.title = 'Consignas — Diseña+'
  }, [])

  const cargarComentarios = useCallback(() => {
    if (cursoId) getComentarios(cursoId, 'consignas').then(setComentarios).catch(() => setComentarios([]))
  }, [cursoId])
  useEffect(cargarComentarios, [cargarComentarios])

  useEffect(() => {
    if (ctx && !seleccion && ctx.elementos.length) setSeleccion(ctx.elementos[0].sesionId)
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

  if (loading) return <Cargando texto="Cargando consignas" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />

  const completos = ctx.elementos.filter(e => validaciones.get(e.sesionId)?.completa).length
  const todoCompleto = ctx.elementos.length > 0 && completos === ctx.elementos.length
  const el = ctx.elementos.find(e => e.sesionId === seleccion) ?? null
  const esMonitor = !!user?.roles.includes('monitor_ea')
  const puedeHabilitar = esMonitor && proceso.disponible && (proceso.estado !== 'en_edicion' || proceso.finalizado.consignas)
  const puedeComentar = can('aprobar_proceso') && proceso.estado.startsWith('revision')

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
      const { enviado } = await finalizarInstrumento(ctx.id, 'consignas', instrumentosRequeridos(ctx, rubricas), proceso, user.correo)
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
          <div className="consignas-lista">
            <div className="row-between" style={{ padding: '0 4px' }}>
              <span style={{ fontSize: 15, fontWeight: 700 }}>Elementos ({ctx.elementos.length})</span>
              {todoCompleto ? (
                <span className="chip chip-aprobado"><Icon name="checkCircle" size={14} />Completo</span>
              ) : (
                <span style={{ fontSize: 13, color: '#3d434a' }}>{completos} de {ctx.elementos.length} completados</span>
              )}
            </div>
            <div style={{ padding: '0 4px 6px' }}><ProgressBar value={(completos / ctx.elementos.length) * 100} /></div>
            {ctx.elementos.map(e => {
              const v = validaciones.get(e.sesionId)
              const conComentario = comentarios.some(c => c.entidadId === e.consigna?.dpl_consignaid)
              return (
                <button
                  key={e.sesionId}
                  className={`consigna-item${e.sesionId === seleccion ? ' active' : ''}`}
                  onClick={() => setSeleccion(e.sesionId)}
                >
                  <span style={{ flex: 1, textAlign: 'left' }}>{e.nombre}</span>
                  {conComentario && <span style={{ color: 'var(--color-primary)', display: 'flex' }} title="Tiene comentarios"><Icon name="comment" size={16} /></span>}
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
                Completa los campos de cada elemento. Cuando todos tengan ✓, usa «Finalizar edición general» para enviarlos a revisión.
              </span>
            </div>
          </div>

          {el && (
            <EditorConsigna
              key={el.sesionId}
              el={el}
              editable={puede}
              mostrarErrores={mostrarErrores}
              onChange={campos => editar(el, campos)}
              onIA={() => setModal('ia')}
              numComentarios={comentarios.filter(c => c.entidadId === el.consigna?.dpl_consignaid).length}
              onComentarios={() => setVerComentarios(true)}
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
        La información no se podrá volver a editar luego de finalizar.
      </Modal>
      <Modal
        open={modal === 'incompleto'}
        title="Hay elementos incompletos o incorrectos"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cada elemento debe tener el instrumento elegido y todos los campos obligatorios completos, sin exceder {LIMITES.consigna} caracteres.
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
        title="Consignas finalizadas"
        onClose={() => setModal(null)}
        actions={<button className="btn btn-primary" onClick={() => setModal(null)}>Entendido</button>}
      >
        Cuando finalices también las Rúbricas, se avisará a los aprobadores para que revisen todo el proceso.
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

      {el?.consigna?.dpl_consignaid && (
        <Comentarios
          open={verComentarios}
          onClose={() => setVerComentarios(false)}
          titulo={`Comentarios: ${el.nombre}`}
          cursoId={ctx.id}
          instrumento="consignas"
          entidadId={el.consigna.dpl_consignaid}
          comentarios={comentarios}
          onNuevo={cargarComentarios}
          puedeComentar={puedeComentar}
        />
      )}
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
  numComentarios: number
  onComentarios: () => void
}

function EditorConsigna({ el, editable, mostrarErrores, onChange, onIA, numComentarios, onComentarios }: EditorProps) {
  const c = el.consigna
  const tipo = tipoInstrumento(c?.dpl_instrumento)
  const { errores } = validarConsigna(c)
  const valor = (c?.dpl_instrumento ?? '').toLowerCase()

  return (
    <section className="panel consigna-editor">
      <div className="row-between" style={{ paddingBottom: 18, borderBottom: '1px solid var(--color-border)' }}>
        <h2 style={{ fontSize: 20, fontWeight: 700 }}>Consigna: {el.nombre}</h2>
        <div style={{ display: 'flex', gap: 10 }}>
          {numComentarios > 0 || c?.dpl_consignaid ? (
            <button className="btn btn-outline" style={{ height: 42 }} onClick={onComentarios}>
              <Icon name="comment" size={16} />Comentarios{numComentarios ? ` (${numComentarios})` : ''}
            </button>
          ) : null}
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

      <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: 10 }} disabled={!editable}>
        <legend className="field-label">Instrumento</legend>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap', fontSize: 14 }}>
          {INSTRUMENTOS.map(i => (
            <label key={i.label} className="radio">
              <input
                type="radio"
                name={`inst-${el.sesionId}`}
                checked={tipo === i.tipo}
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
        {tipo === 'escala' && (
          <div className="sub-opciones">
            <label className="radio"><input type="radio" name={`esc-${el.sesionId}`} checked={valor === INSTRUMENTO_VALORES.escala} onChange={() => onChange({ dpl_instrumento: INSTRUMENTO_VALORES.escala })} />Normal</label>
            <label className="radio"><input type="radio" name={`esc-${el.sesionId}`} checked={valor === INSTRUMENTO_VALORES.escalaAdmin} onChange={() => onChange({ dpl_instrumento: INSTRUMENTO_VALORES.escalaAdmin })} />Cursos DDA administración</label>
          </div>
        )}
        {mostrarErrores && errores.dpl_instrumento && (
          <span className="field-error"><Icon name="alert" size={14} />{errores.dpl_instrumento}</span>
        )}
      </fieldset>

      {CAMPOS_CONSIGNA.map(campo => (
        <CampoTexto
          key={campo.key}
          id={`${campo.key}-${el.sesionId}`}
          label={campo.label}
          value={c?.[campo.key] ?? ''}
          max={LIMITES.consigna}
          readOnly={!editable}
          error={mostrarErrores ? errores[campo.key] : undefined}
          onChange={v => onChange({ [campo.key]: v })}
        />
      ))}
    </section>
  )
}
