import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { CAMPO_GENERAL, PanelComentarios, type FiltroComentarios } from '../components/Comentarios'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, useToast } from '../components/ui'
import RecursosCurso from '../components/RecursosCurso'
import { useAuth } from '../shared/AuthContext'
import { getComentarios, type Comentario } from '../shared/academico'
import {
  REGLAS_ESCALA,
  advertenciasEscala,
  esEscalaAdmin,
  getEscalaDeElemento,
  guardarEscalaCompleta,
  guardarTipoEscala,
  nivelesEscala,
  type CampoNivel,
  type IndicadorEscalaCampos,
  type TipoEscala,
} from '../shared/escala'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'
import { ChipsNiveles, SelectorTipo } from './EscalaPage'

type Fila = { dpl_indicador: string; dpl_observaciones: string } & Record<CampoNivel, string>
const VACIA: Fila = {
  dpl_indicador: '',
  dpl_observaciones: '',
  dpl_puntajeconsolidado: '',
  dpl_puntajeendesarrollo: '',
  dpl_puntajeeninicio: '',
  dpl_puntajeconerrores: '',
}

interface FilaEditor {
  key: string
  id: string | null
  f: Fila
}

let contadorFilas = 0
const nuevaClave = () => `esc-${Date.now()}-${++contadorFilas}`
const filaVacia = (f: Fila) => Object.values(f).every(v => !v.trim())

const PASO_PUNTAJE = 0.5
function moverPuntaje(v: string, dir: 1 | -1): string {
  const nuevo = Math.max(0, Math.round(((Number(v) || 0) + dir * PASO_PUNTAJE) * 100) / 100)
  return nuevo === 0 && dir < 0 ? '' : String(nuevo)
}
function soloNumero(v: string): string {
  const limpio = v.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const i = limpio.indexOf('.')
  return i < 0 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '')
}

type EstadoGuardado = 'idle' | 'guardando' | 'guardado' | 'error'

/** Indicators of one element's rating scale, saved automatically (like Lista de cotejo). */
export default function IndicadoresEscalaForm() {
  const { cursoId, sesionId } = useParams<{ cursoId: string; sesionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede } = usePuedeEditar(proceso, rol)
  const foco = (location.state as { foco?: string } | null)?.foco ?? null

  const [filas, setFilas] = useState<FilaEditor[]>([])
  const [tipo, setTipo] = useState<TipoEscala | null>(null)
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoGuardado>('idle')
  const [quitar, setQuitar] = useState<number | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const cargarComentarios = () => {
    if (cursoId) getComentarios(cursoId, 'escala').then(setComentarios).catch(() => setComentarios([]))
  }
  useEffect(cargarComentarios, [cursoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filasRef = useRef(filas)
  filasRef.current = filas
  const idsRef = useRef(new Map<string, string>())
  const eliminadosRef = useRef<string[]>([])
  const sucioRef = useRef(false)
  const guardandoRef = useRef(false)
  const pendienteRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const elemento = ctx?.elementos.find(e => e.sesionId === sesionId) ?? null
  const admin = elemento ? esEscalaAdmin(elemento) : false
  const { niveles, cero } = nivelesEscala(admin, tipo)

  const aCampos = (f: Fila): IndicadorEscalaCampos => {
    const n = (s: string) => (s.trim() === '' ? null : Number(s))
    return {
      dpl_indicador: f.dpl_indicador.trim(),
      dpl_observaciones: f.dpl_observaciones.trim(),
      dpl_puntajeconsolidado: n(f.dpl_puntajeconsolidado),
      dpl_puntajeendesarrollo: n(f.dpl_puntajeendesarrollo),
      dpl_puntajeeninicio: n(f.dpl_puntajeeninicio),
      // Only the administración scale has "Con varios errores".
      dpl_puntajeconerrores: admin ? n(f.dpl_puntajeconerrores) : null,
    }
  }

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
      const actuales = filasRef.current.map(r => ({ ...r, id: r.id ?? idsRef.current.get(r.key) ?? null })).filter(r => r.id || !filaVacia(r.f))
      const borrar = [...eliminadosRef.current]
      const ids = await guardarEscalaCompleta(ctx, elemento, actuales.map(r => ({ id: r.id, campos: aCampos(r.f) })), borrar, user.correo)
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
    getEscalaDeElemento(sesionId)
      .then(({ tipo: t, indicadores }) => {
        setTipo(t)
        const txt = (v: unknown) => (v === null || v === undefined ? '' : String(v))
        const cargadas: FilaEditor[] = indicadores.map(i => ({
          key: nuevaClave(),
          id: i.dpl_escalaindicadorid,
          f: {
            dpl_indicador: txt(i.dpl_indicador),
            dpl_observaciones: txt(i.dpl_observaciones),
            dpl_puntajeconsolidado: txt(i.dpl_puntajeconsolidado),
            dpl_puntajeendesarrollo: txt(i.dpl_puntajeendesarrollo),
            dpl_puntajeeninicio: txt(i.dpl_puntajeeninicio),
            dpl_puntajeconerrores: txt(i.dpl_puntajeconerrores),
          },
        }))
        if ((!foco && cargadas.length < REGLAS_ESCALA.maxIndicadores) || cargadas.length === 0) cargadas.push({ key: nuevaClave(), id: null, f: { ...VACIA } })
        setFilas(cargadas)
      })
      .catch(err => toast(err instanceof Error ? err.message : 'No se pudo cargar la escala.', 'error'))
      .finally(() => setCargando(false))
  }, [sesionId, foco, toast])

  useEffect(() => {
    if (cargando) return
    const destino = document.getElementById(foco ? `esc-${foco}` : 'esc-ultima')
    const t = setTimeout(() => destino?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => clearTimeout(t)
  }, [cargando, foco])

  if (loading || cargando) return <Cargando texto="Cargando" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (!elemento) return <ErrorPanel mensaje="El elemento no existe en este curso." />
  const rutaVolver = `/cursos/${ctx.id}/escala`
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
  const cambiarTipo = async (t: TipoEscala | null) => {
    if (!user) return
    setTipo(t)
    try {
      await guardarTipoEscala(ctx, elemento, t, user.correo)
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar el tipo de escala.', 'error')
    }
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
  const porIndicador = advertenciasEscala(filas.map(r => r.f), admin, tipo).filter(a => a.startsWith('Indicador N°') && !a.includes('está vacío'))
  const sinTipo = !admin && !tipo
  /** Fields left empty in a row that is being filled (Observaciones is optional). */
  const incompleto = (f: Fila, k: keyof Fila) => !filaVacia(f) && !f[k].trim()

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Escala de valoración', to: rutaVolver },
          { label: 'Agregar indicador' },
        ]}
      />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Agregar indicadores</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IndicadorGuardado estado={estado} />
          <button className="btn btn-outline" style={{ height: 40 }} onClick={volver} disabled={saliendo}>
            <Icon name="chevronLeft" size={16} strokeWidth={2} />Volver a la escala
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
        <div className="row-between" style={{ flexWrap: 'wrap', gap: 10 }}>
          <ChipsNiveles indicadores={conDatos} admin={admin} tipo={tipo} />
          <SelectorTipo admin={admin} tipo={tipo} editable onCambio={cambiarTipo} />
        </div>
        <div className="regla-detalle">
          {sinTipo && <span className="regla-mal"><Icon name="alert" size={14} />Elige el tipo de escala: cambia los nombres de los niveles.</span>}
          {porIndicador.length === 0 ? (
            <span className="regla-ok"><Icon name="checkCircle" size={14} />Valores por indicador correctos</span>
          ) : (
            porIndicador.map(a => <span key={a} className="regla-mal"><Icon name="alert" size={14} />{a}</span>)
          )}
          <span style={{ color: 'var(--color-text-muted)' }}>
            {conDatos.length} de {REGLAS_ESCALA.maxIndicadores} indicadores · {cero} vale 0 · Los cambios se guardan automáticamente.
          </span>
        </div>
      </div>

      <div className="panel criterio-form">
        <table className="indicadores-tabla escala-tabla">
          <thead>
            <tr>
              <th style={{ width: 70 }}>N°</th>
              <th>Indicador</th>
              {niveles.map(n => <th key={n.campo} style={{ width: 128 }}>{n.label}</th>)}
              <th style={{ width: 92 }}>{cero}</th>
              <th style={{ width: '18%' }}>Observaciones <span style={{ fontWeight: 400, color: 'var(--color-text-muted)' }}>(opcional)</span></th>
            </tr>
          </thead>
          <tbody>
            {filas.map((r, i) => {
              const id = idDe(r)
              const pendientes = id ? comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === id).length : 0
              return (
                <tr key={r.key} id={i === filas.length - 1 && !foco ? 'esc-ultima' : id ? `esc-${id}` : undefined} style={{ scrollMarginTop: 150 }}>
                  <td>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
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
                    <Area value={r.f.dpl_indicador} max={REGLAS_ESCALA.indicadorMax} error={incompleto(r.f, 'dpl_indicador') ? 'Debes completar este campo' : r.f.dpl_indicador.length > REGLAS_ESCALA.indicadorMax ? 'Exceso de caracteres' : undefined} onChange={v => setCampo(i, 'dpl_indicador', v)} label={`Indicador ${i + 1}`} />
                  </td>
                  {niveles.map(n => (
                    <td key={n.campo} className="escala-puntaje">
                      <div className={`puntaje-paso${incompleto(r.f, n.campo) ? ' has-error' : ''}`}>
                        <button type="button" aria-label={`Bajar ${n.label} del indicador ${i + 1}`} disabled={!Number(r.f[n.campo])} onClick={() => setCampo(i, n.campo, moverPuntaje(r.f[n.campo], -1))}>
                          <Icon name="chevronDown" size={16} strokeWidth={2.4} />
                        </button>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="—"
                          value={r.f[n.campo]}
                          onChange={e => setCampo(i, n.campo, soloNumero(e.target.value))}
                          onKeyDown={e => {
                            if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                              e.preventDefault()
                              setCampo(i, n.campo, moverPuntaje(r.f[n.campo], e.key === 'ArrowUp' ? 1 : -1))
                            }
                          }}
                          aria-label={`${n.label} del indicador ${i + 1}`}
                        />
                        <button type="button" aria-label={`Subir ${n.label} del indicador ${i + 1}`} onClick={() => setCampo(i, n.campo, moverPuntaje(r.f[n.campo], 1))}>
                          <Icon name="chevronUp" size={16} strokeWidth={2.4} />
                        </button>
                      </div>
                      {incompleto(r.f, n.campo) && <span className="field-error"><Icon name="alert" size={13} />Completa</span>}
                    </td>
                  ))}
                  <td className="escala-cero-celda"><span title={`${cero} siempre vale 0`}>0</span></td>
                  <td>
                    <Area value={r.f.dpl_observaciones} max={REGLAS_ESCALA.observacionesMax} error={r.f.dpl_observaciones.length > REGLAS_ESCALA.observacionesMax ? 'Exceso de caracteres' : undefined} onChange={v => setCampo(i, 'dpl_observaciones', v)} label={`Observaciones del indicador ${i + 1}`} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {filas.length < REGLAS_ESCALA.maxIndicadores ? (
        <button className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 10px' }} onClick={() => setFilas(prev => [...prev, { key: nuevaClave(), id: null, f: { ...VACIA } }])}>
          <Icon name="plus" size={18} strokeWidth={2} />Agregar otro indicador
        </button>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Llegaste al máximo de {REGLAS_ESCALA.maxIndicadores} indicadores por elemento.</span>
      )}

      <div className="form-footer">
        <IndicadorGuardado estado={estado} />
        <button className="btn btn-primary" style={{ height: 44, padding: '0 24px' }} onClick={volver} disabled={saliendo}>
          {saliendo ? 'Guardando…' : 'Volver a la escala'}
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
        {quitar !== null && <>Se eliminará el <b>Indicador N°{quitar + 1}</b>. Los demás se volverán a numerar.</>}
      </Modal>
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={`Comentarios: Indicador N°${filtro?.entidadId ? filas.findIndex(r => idDe(r) === filtro.entidadId) + 1 : ''}`}
        cursoId={ctx.id}
        instrumento="escala"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(_, campo) =>
          campo === 'dpl_indicador' ? 'Indicador' : campo === 'dpl_observaciones' ? 'Observaciones' : campo === CAMPO_GENERAL ? 'General' : niveles.find(n => n.campo === campo)?.label ?? campo
        }
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
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea className={`textarea indicador-area${error ? ' has-error' : ''}`} placeholder="Ingresar información" value={value} aria-label={label} onChange={e => onChange(e.target.value)} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
        <span className="field-error" style={{ margin: 0, visibility: error ? 'visible' : 'hidden' }}><Icon name="alert" size={13} />{error ?? '.'}</span>
        <span style={{ color: value.length > max ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>{value.length}/{max}</span>
      </div>
    </div>
  )
}
