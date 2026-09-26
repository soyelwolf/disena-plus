import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { CAMPO_GENERAL, PanelComentarios, type FiltroComentarios } from '../components/Comentarios'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, useToast } from '../components/ui'
import RecursosCurso from '../components/RecursosCurso'
import { useAuth } from '../shared/AuthContext'
import { PUNTAJE_OBJETIVO, getComentarios, type Comentario } from '../shared/academico'
import { REGLAS_LISTA, advertenciasLista, getIndicadoresDeElemento, guardarListaCompleta, totalLista, type IndicadorCampos } from '../shared/listaCotejo'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'

interface Fila {
  dpl_indicador: string
  dpl_puntaje: string
  dpl_observaciones: string
}
const VACIA: Fila = { dpl_indicador: '', dpl_puntaje: '', dpl_observaciones: '' }

interface FilaEditor {
  key: string
  id: string | null
  f: Fila
}

let contadorFilas = 0
const nuevaClave = () => `ind-${Date.now()}-${++contadorFilas}`
const filaVacia = (f: Fila) => !f.dpl_indicador.trim() && !f.dpl_puntaje.trim() && !f.dpl_observaciones.trim()

/** − / + buttons move the score in steps of 0.5 (never below 0). */
const PASO_PUNTAJE = 0.5
function moverPuntaje(v: string, dir: 1 | -1): string {
  const actual = Number(v) || 0
  const nuevo = Math.max(0, Math.round((actual + dir * PASO_PUNTAJE) * 100) / 100)
  return nuevo === 0 && dir < 0 ? '' : String(nuevo)
}

/** Scores accept only digits and one decimal point (a comma counts as the point). */
function soloNumero(v: string): string {
  const limpio = v.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const i = limpio.indexOf('.')
  return i < 0 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '')
}

const aCampos = (f: Fila): IndicadorCampos => ({
  dpl_indicador: f.dpl_indicador.trim(),
  dpl_puntaje: f.dpl_puntaje.trim() === '' ? null : Number(f.dpl_puntaje),
  dpl_observaciones: f.dpl_observaciones.trim(),
})

/** Field errors of a row: incomplete rows (Figma "Información de indicador incompleta") and too long texts. Observaciones is optional. */
function erroresFila(f: Fila): Partial<Record<keyof Fila, string>> {
  const e: Partial<Record<keyof Fila, string>> = {}
  if (!filaVacia(f)) for (const k of ['dpl_indicador', 'dpl_puntaje'] as const) if (!f[k].trim()) e[k] = 'Debes completar este campo'
  if (f.dpl_puntaje.trim() && !(Number(f.dpl_puntaje) > 0)) e.dpl_puntaje = 'Debe ser un número mayor que 0'
  if (f.dpl_indicador.length > REGLAS_LISTA.indicadorMax) e.dpl_indicador = 'Exceso de caracteres'
  if (f.dpl_observaciones.length > REGLAS_LISTA.observacionesMax) e.dpl_observaciones = 'Exceso de caracteres'
  return e
}

type EstadoGuardado = 'idle' | 'guardando' | 'guardado' | 'error'

/**
 * Indicators of one element's checklist, all at once, saved automatically like
 * the rubric editor. "Agregar indicador" opens it with a new empty row.
 */
export default function IndicadoresForm() {
  const { cursoId, sesionId } = useParams<{ cursoId: string; sesionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede } = usePuedeEditar(proceso, rol)
  const foco = (location.state as { foco?: string } | null)?.foco ?? null

  const [filas, setFilas] = useState<FilaEditor[]>([])
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoGuardado>('idle')
  const [quitar, setQuitar] = useState<number | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const cargarComentarios = () => {
    if (cursoId) getComentarios(cursoId, 'lista').then(setComentarios).catch(() => setComentarios([]))
  }
  useEffect(cargarComentarios, [cursoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave (same approach as the rubric editor) ──
  const filasRef = useRef(filas)
  filasRef.current = filas
  const idsRef = useRef(new Map<string, string>())
  const eliminadosRef = useRef<string[]>([])
  const sucioRef = useRef(false)
  const guardandoRef = useRef(false)
  const pendienteRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const elemento = ctx?.elementos.find(e => e.sesionId === sesionId) ?? null

  const flush = async (): Promise<void> => {
    clearTimeout(timer.current)
    if (!ctx || !elemento || !user || !sucioRef.current) return
    if (guardandoRef.current) {
      pendienteRef.current = true
      return
    }
    guardandoRef.current = true
    sucioRef.current = false
    setEstado('guardando')
    try {
      // Rows left completely empty are not saved yet.
      const actuales = filasRef.current
        .map(r => ({ ...r, id: r.id ?? idsRef.current.get(r.key) ?? null }))
        .filter(r => r.id || !filaVacia(r.f))
      const borrar = [...eliminadosRef.current]
      const ids = await guardarListaCompleta(ctx, elemento, actuales.map(r => ({ id: r.id, campos: aCampos(r.f) })), borrar, user.correo)
      eliminadosRef.current = eliminadosRef.current.filter(id => !borrar.includes(id))
      actuales.forEach((r, i) => idsRef.current.set(r.key, ids[i]))
      setFilas(prev => prev.map(r => (r.id ? r : idsRef.current.has(r.key) ? { ...r, id: idsRef.current.get(r.key)! } : r)))
      setEstado('guardado')
    } catch (err) {
      sucioRef.current = true
      setEstado('error')
      toast(err instanceof Error ? `No se guardó: ${err.message}` : 'No se guardó.', 'error')
    } finally {
      guardandoRef.current = false
      if (pendienteRef.current) {
        pendienteRef.current = false
        void flush()
      }
    }
  }
  const flushRef = useRef(flush)
  flushRef.current = flush
  const programar = () => {
    sucioRef.current = true
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void flushRef.current(), 1200)
  }
  useEffect(() => () => void flushRef.current(), [])

  useEffect(() => {
    document.title = 'Agregar indicadores — Diseña+'
    if (!sesionId) return
    getIndicadoresDeElemento(sesionId)
      .then(lista => {
        const cargadas: FilaEditor[] = lista.map(i => ({
          key: nuevaClave(),
          id: i.dpl_listacotejoindicadorid,
          f: { dpl_indicador: i.dpl_indicador ?? '', dpl_puntaje: i.dpl_puntaje === null ? '' : String(i.dpl_puntaje), dpl_observaciones: i.dpl_observaciones ?? '' },
        }))
        // "Agregar indicador" (no focus on an existing one) starts with a new row.
        if ((!foco && cargadas.length < REGLAS_LISTA.maxIndicadores) || cargadas.length === 0) cargadas.push({ key: nuevaClave(), id: null, f: { ...VACIA } })
        setFilas(cargadas)
      })
      .catch(err => toast(err instanceof Error ? err.message : 'No se pudo cargar la lista de cotejo.', 'error'))
      .finally(() => setCargando(false))
  }, [sesionId, foco, toast])

  useEffect(() => {
    if (cargando) return
    const destino = document.getElementById(foco ? `ind-${foco}` : 'ind-ultima')
    const t = setTimeout(() => destino?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => clearTimeout(t)
  }, [cargando, foco])

  if (loading || cargando) return <Cargando texto="Cargando" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (!elemento) return <ErrorPanel mensaje="El elemento no existe en este curso." />
  const rutaVolver = `/cursos/${ctx.id}/lista`
  if (!puede) return <Navigate to={rutaVolver} replace />

  const volver = async () => {
    setSaliendo(true)
    for (let k = 0; k < 40 && (guardandoRef.current || sucioRef.current || pendienteRef.current); k++) {
      if (!guardandoRef.current) await flush()
      else await new Promise(r => setTimeout(r, 150))
    }
    setSaliendo(false)
    if (sucioRef.current) return toast('Hay cambios que no se pudieron guardar. Revisa tu conexión e inténtalo de nuevo.', 'error')
    navigate(rutaVolver, { state: { abrir: elemento.sesionId } })
  }

  const setCampo = (i: number, key: keyof Fila, v: string) => {
    setFilas(prev => prev.map((r, j) => (j === i ? { ...r, f: { ...r.f, [key]: v } } : r)))
    programar()
  }
  const idDe = (r: FilaEditor) => r.id ?? idsRef.current.get(r.key) ?? null
  const quitarFila = (i: number) => {
    setQuitar(null)
    const r = filas[i]
    const id = idDe(r)
    const resto = filas.filter((_, j) => j !== i)
    const nuevas = resto.length ? resto : [{ key: nuevaClave(), id: null, f: { ...VACIA } }]
    filasRef.current = nuevas
    setFilas(nuevas)
    if (id) {
      eliminadosRef.current.push(id)
      sucioRef.current = true
      void flush()
    }
  }
  const pedirQuitar = (i: number) => (!idDe(filas[i]) && filaVacia(filas[i].f) ? quitarFila(i) : setQuitar(i))

  const conDatos = filas.filter(r => !filaVacia(r.f)).map(r => r.f)
  const total = totalLista(conDatos)
  const falta = Math.round((PUNTAJE_OBJETIVO - total) * 100) / 100
  const porIndicador = advertenciasLista(filas.map(r => r.f)).filter(a => a.startsWith('Indicador N°') && !a.includes('está vacío'))

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Lista de cotejo', to: rutaVolver },
          { label: 'Agregar indicador' },
        ]}
      />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Agregar indicadores</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IndicadorGuardado estado={estado} />
          <button className="btn btn-outline" style={{ height: 40 }} onClick={volver} disabled={saliendo}>
            <Icon name="chevronLeft" size={16} strokeWidth={2} />Volver a la lista
          </button>
        </span>
      </div>
      <CursoHeader
        titulo={elemento.nombre}
        curso={ctx.nombre}
        tipoEnsenanza={ctx.tipoEnsenanza}
        programas={ctx.programas}
        acciones={<RecursosCurso cursoId={ctx.id} curso={ctx.nombre} elemento={elemento.nombre} queSeEvaluara={elemento.consigna?.dpl_queseevaluara} />}
      />

      <div className="panel resumen-reglas">
        <div className="regla-fila">
          <span className={`regla-chip ${filas.length <= REGLAS_LISTA.maxIndicadores ? 'ok' : 'mal'}`}>
            <Icon name={filas.length <= REGLAS_LISTA.maxIndicadores ? 'checkCircle' : 'alert'} size={14} />
            {conDatos.length} {conDatos.length === 1 ? 'indicador' : 'indicadores'} (máximo {REGLAS_LISTA.maxIndicadores})
          </span>
          <span className={`regla-chip ${falta === 0 ? 'ok' : 'mal'}`}>
            <Icon name={falta === 0 ? 'checkCircle' : 'alert'} size={14} />
            Total: {total} / {PUNTAJE_OBJETIVO} pt{falta > 0 ? ` (te faltan ${falta})` : falta < 0 ? ` (sobran ${-falta})` : ''}
          </span>
        </div>
        <div className="regla-detalle">
          {porIndicador.length === 0 ? (
            <span className="regla-ok"><Icon name="checkCircle" size={14} />Indicadores completos</span>
          ) : (
            porIndicador.map(a => <span key={a} className="regla-mal"><Icon name="alert" size={14} />{a}</span>)
          )}
          <span style={{ color: 'var(--color-text-muted)' }}>Los cambios se guardan automáticamente.</span>
        </div>
      </div>

      <div className="panel criterio-form">
        <table className="indicadores-tabla">
          <thead>
            <tr>
              <th style={{ width: 80 }}>N°</th>
              <th>Indicador</th>
              <th style={{ width: 170 }}>Puntaje</th>
              <th style={{ width: '20%' }}>Observaciones <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(opcional)</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const id = idDe(r)
              const errores = erroresFila(r.f)
              const pendientes = id ? comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === id).length : 0
              return (
                <tr key={r.key} id={i === filas.length - 1 && !foco ? 'ind-ultima' : id ? `ind-${id}` : undefined} style={{ scrollMarginTop: 150 }}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                      <b>N°{i + 1}</b>
                      {pendientes > 0 && (
                        <button className="chip chip-pt" style={{ display: 'inline-flex', gap: 4, border: 'none', cursor: 'pointer' }} title="Ver comentarios pendientes" onClick={() => id && setFiltro({ entidadId: id })}>
                          <Icon name="comment" size={13} />{pendientes}
                        </button>
                      )}
                      <button className="icon-btn" aria-label={`Eliminar indicador ${i + 1}`} onClick={() => pedirQuitar(i)}>
                        <Icon name="trash" size={20} />
                      </button>
                    </div>
                  </td>
                  <td>
                    <Area value={r.f.dpl_indicador} max={REGLAS_LISTA.indicadorMax} error={errores.dpl_indicador} onChange={v => setCampo(i, 'dpl_indicador', v)} label={`Indicador ${i + 1}`} />
                  </td>
                  <td>
                    <div className={`puntaje-paso${errores.dpl_puntaje ? ' has-error' : ''}`}>
                      <button type="button" aria-label={`Bajar puntaje del indicador ${i + 1}`} disabled={!Number(r.f.dpl_puntaje)} onClick={() => setCampo(i, 'dpl_puntaje', moverPuntaje(r.f.dpl_puntaje, -1))}>
                        <Icon name="chevronDown" size={16} strokeWidth={2.4} />
                      </button>
                      <input
                        type="text"
                        inputMode="decimal"
                        placeholder="Ej. 5 o 4.5"
                        value={r.f.dpl_puntaje}
                        onChange={e => setCampo(i, 'dpl_puntaje', soloNumero(e.target.value))}
                        onKeyDown={e => {
                          // Arrow keys also move the score, like a number field.
                          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                            e.preventDefault()
                            setCampo(i, 'dpl_puntaje', moverPuntaje(r.f.dpl_puntaje, e.key === 'ArrowUp' ? 1 : -1))
                          }
                        }}
                        aria-label={`Puntaje del indicador ${i + 1}`}
                      />
                      <button type="button" aria-label={`Subir puntaje del indicador ${i + 1}`} onClick={() => setCampo(i, 'dpl_puntaje', moverPuntaje(r.f.dpl_puntaje, 1))}>
                        <Icon name="chevronUp" size={16} strokeWidth={2.4} />
                      </button>
                    </div>
                    {errores.dpl_puntaje && <span className="field-error"><Icon name="alert" size={13} />{errores.dpl_puntaje}</span>}
                  </td>
                  <td>
                    <Area value={r.f.dpl_observaciones} max={REGLAS_LISTA.observacionesMax} error={errores.dpl_observaciones} onChange={v => setCampo(i, 'dpl_observaciones', v)} label={`Observaciones del indicador ${i + 1}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filas.length < REGLAS_LISTA.maxIndicadores ? (
        <button className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 10px' }} onClick={() => setFilas(prev => [...prev, { key: nuevaClave(), id: null, f: { ...VACIA } }])}>
          <Icon name="plus" size={18} strokeWidth={2} />Agregar otro indicador
        </button>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Llegaste al máximo de {REGLAS_LISTA.maxIndicadores} indicadores por elemento.</span>
      )}

      <div className="form-footer">
        <IndicadorGuardado estado={estado} />
        <button className="btn btn-primary" style={{ height: 44, padding: '0 24px' }} onClick={volver} disabled={saliendo}>
          {saliendo ? 'Guardando…' : 'Volver a la lista'}
        </button>
      </div>

      <Modal
        open={quitar !== null}
        title="¿Eliminar indicador?"
        onClose={() => setQuitar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitar(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={() => quitar !== null && quitarFila(quitar)}>Sí, eliminar</button>
          </>
        }
      >
        {quitar !== null && filas[quitar] && (
          <>
            Se eliminará el <b>Indicador N°{quitar + 1}</b>{filas[quitar].f.dpl_puntaje ? ` (${filas[quitar].f.dpl_puntaje} pt)` : ''}. Los demás se volverán a numerar.
          </>
        )}
      </Modal>
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={`Comentarios: Indicador N°${filtro?.entidadId ? filas.findIndex(r => idDe(r) === filtro.entidadId) + 1 : ''}`}
        cursoId={ctx.id}
        instrumento="lista"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(_, campo) => (campo === 'dpl_indicador' ? 'Detalle' : campo === 'dpl_puntaje' ? 'Puntaje' : campo === 'dpl_observaciones' ? 'Observaciones' : campo === CAMPO_GENERAL ? 'General' : campo)}
        valorItem={(id, campo) => {
          const r = filas.find(x => idDe(x) === id)
          return !r || campo === CAMPO_GENERAL ? null : r.f[campo as keyof Fila] ?? null
        }}
        puedeComentar={false}
        puedeResponder
        puedeResolver={rol.revisor}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
      />
    </div>
  )
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

function Area(props: { value: string; max: number; error?: string; onChange: (v: string) => void; label: string }) {
  const { value, max, error, onChange, label } = props
  const excedido = value.length > max
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        className={`textarea indicador-area${error ? ' has-error' : ''}`}
        placeholder="Ingresar información"
        value={value}
        aria-label={label}
        onChange={e => onChange(e.target.value)}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
        <span className="field-error" style={{ margin: 0, visibility: error ? 'visible' : 'hidden' }}><Icon name="alert" size={13} />{error ?? '.'}</span>
        <span style={{ color: excedido ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{value.length}/{max}</span>
      </div>
    </div>
  )
}
