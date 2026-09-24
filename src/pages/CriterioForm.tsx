import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { CAMPO_GENERAL, PanelComentarios, type FiltroComentarios } from '../components/Comentarios'
import TextoEnriquecido from '../components/TextoEnriquecido'
import { estaVacio, longitud } from '../shared/textoRico'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  LIMITES,
  NIVELES,
  REGLAS_RUBRICA,
  advertenciasRubrica,
  guardarRubricaCompleta,
  getComentarios,
  getCriteriosDeElemento,
  PUNTAJE_OBJETIVO,
  type Comentario,
  type CriterioCampos,
} from '../shared/academico'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'

type Fila = Record<keyof CriterioCampos, string>

const VACIA: Fila = {
  dpl_criterio: '',
  dpl_definicioncriterio: '',
  dpl_estandaresperado: '',
  dpl_puntajeestandar: '',
  dpl_enproceso2: '',
  dpl_puntajeenproceso2: '',
  dpl_enproceso1: '',
  dpl_puntajeenproceso1: '',
  dpl_inicial: '',
  dpl_puntajeinicial: '',
}

const TEXTOS: Array<{ key: keyof CriterioCampos; label: string; max: number }> = [
  { key: 'dpl_criterio', label: 'Nombre de criterio', max: LIMITES.criterioNombre },
  { key: 'dpl_definicioncriterio', label: 'Descripción del criterio', max: LIMITES.criterioTexto },
]

/** Live field errors: only what can't be saved as is (missing data is listed by the rules box). */
function erroresFila(f: Fila): Partial<Record<keyof CriterioCampos, string>> {
  const e: Partial<Record<keyof CriterioCampos, string>> = {}
  for (const t of TEXTOS) if (longitud(f[t.key]) > t.max) e[t.key] = 'Exceso de caracteres'
  for (const n of NIVELES) {
    if (longitud(f[n.texto]) > LIMITES.criterioTexto) e[n.texto] = 'Exceso de caracteres'
    const p = f[n.puntaje].trim()
    if (p !== '' && !/^\d+(\.\d+)?$/.test(p)) e[n.puntaje] = 'Solo números (entero o decimal)'
  }
  return e
}

/** Scores accept only digits and one decimal point (a comma counts as the point). */
function soloNumero(v: string): string {
  const limpio = v.replace(/,/g, '.').replace(/[^\d.]/g, '')
  const i = limpio.indexOf('.')
  return i < 0 ? limpio : limpio.slice(0, i + 1) + limpio.slice(i + 1).replace(/\./g, '')
}

function aCampos(f: Fila): CriterioCampos {
  const num = (s: string) => (s.trim() === '' ? null : Number(s))
  return {
    dpl_criterio: f.dpl_criterio.trim(),
    dpl_definicioncriterio: f.dpl_definicioncriterio.trim(),
    dpl_estandaresperado: f.dpl_estandaresperado.trim(),
    dpl_puntajeestandar: num(f.dpl_puntajeestandar),
    dpl_enproceso2: f.dpl_enproceso2.trim(),
    dpl_puntajeenproceso2: num(f.dpl_puntajeenproceso2),
    dpl_enproceso1: f.dpl_enproceso1.trim(),
    dpl_puntajeenproceso1: num(f.dpl_puntajeenproceso1),
    dpl_inicial: f.dpl_inicial.trim(),
    dpl_puntajeinicial: num(f.dpl_puntajeinicial),
  }
}

type EstadoGuardado = 'idle' | 'guardando' | 'guardado' | 'error'

/** One row of the editor: stable key for React and autosave, id once it exists in the database. */
interface FilaEditor {
  key: string
  id: string | null
  f: Fila
}

let contadorFilas = 0
const nuevaClave = () => `fila-${Date.now()}-${++contadorFilas}`
const filaVacia = (f: Fila) => Object.values(f).every(v => estaVacio(v))

/**
 * Rubric of one element: every criterion at once, saved automatically like the
 * consignas (no Guardar/Cancelar). "Agregar criterio" opens it with a new row.
 */
export default function CriterioForm({ completa = false }: { completa?: boolean }) {
  const { cursoId, sesionId, criterioId } = useParams<{ cursoId: string; sesionId: string; criterioId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede } = usePuedeEditar(proceso, rol)
  const agregando = !completa && !criterioId
  const foco = criterioId ?? (location.state as { foco?: string } | null)?.foco ?? null

  const [filas, setFilas] = useState<FilaEditor[]>([])
  const [cargandoCriterio, setCargandoCriterio] = useState(true)
  const [estado, setEstado] = useState<EstadoGuardado>('idle')
  const [quitar, setQuitar] = useState<number | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  // Reviewers' comments, so the teacher can address them while editing.
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const cargarComentarios = () => {
    if (cursoId) getComentarios(cursoId, 'rubricas').then(setComentarios).catch(() => setComentarios([]))
  }
  useEffect(cargarComentarios, [cursoId]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Autosave ──
  const filasRef = useRef(filas)
  filasRef.current = filas
  const idsRef = useRef(new Map<string, string>()) // key → id, updated at once (state lags a render)
  const eliminadosRef = useRef<string[]>([])
  const sucioRef = useRef(false)
  const guardandoRef = useRef(false)
  const pendienteRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const elemento = ctx?.elementos.find(e => e.sesionId === sesionId) ?? null

  const flush = async (): Promise<void> => {
    clearTimeout(timer.current)
    if (!elemento || !user || !sucioRef.current) return
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
      const ids = await guardarRubricaCompleta(elemento, actuales.map(r => ({ id: r.id, campos: aCampos(r.f) })), borrar, user.correo)
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
  // Leaving the screen any other way still saves the last change.
  useEffect(() => () => void flushRef.current(), [])

  useEffect(() => {
    document.title = 'Rúbrica del elemento — Diseña+'
    if (!sesionId) return
    getCriteriosDeElemento(sesionId)
      .then(lista => {
        const cargadas: FilaEditor[] = lista.map(c => {
          const f = { ...VACIA }
          for (const k of Object.keys(VACIA) as Array<keyof CriterioCampos>) {
            const v = c[k]
            f[k] = v === null || v === undefined ? '' : String(v)
          }
          return { key: nuevaClave(), id: c.dpl_rubricacriterioid, f }
        })
        if (agregando || cargadas.length === 0) cargadas.push({ key: nuevaClave(), id: null, f: { ...VACIA } })
        setFilas(cargadas)
      })
      .catch(err => toast(err instanceof Error ? err.message : 'No se pudo cargar la rúbrica.', 'error'))
      .finally(() => setCargandoCriterio(false))
  }, [sesionId, agregando, toast])

  // "⋮ → Editar" of one criterion scrolls to it; "Agregar criterio" to the new row.
  useEffect(() => {
    if (cargandoCriterio) return
    const destino = foco ? document.getElementById(`fila-${foco}`) : agregando ? document.getElementById('fila-ultima') : null
    const t = setTimeout(() => destino?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [cargandoCriterio, foco, agregando])

  if (loading || cargandoCriterio) return <Cargando texto="Cargando" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (!elemento) return <ErrorPanel mensaje="El elemento no existe en este curso." />
  if (!puede) return <Navigate to={`/cursos/${ctx.id}/rubricas`} replace />

  const rutaVolver = `/cursos/${ctx.id}/rubricas`
  const volver = async () => {
    setSaliendo(true)
    // Wait for the save in progress and the last pending change.
    for (let k = 0; k < 40 && (guardandoRef.current || sucioRef.current || pendienteRef.current); k++) {
      if (!guardandoRef.current) await flush()
      else await new Promise(r => setTimeout(r, 150))
    }
    setSaliendo(false)
    if (sucioRef.current) return toast('Hay cambios que no se pudieron guardar. Revisa tu conexión e inténtalo de nuevo.', 'error')
    navigate(rutaVolver, { state: { abrir: foco ?? undefined } })
  }

  const setCampo = (i: number, key: keyof CriterioCampos, v: string) => {
    setFilas(prev => prev.map((r, j) => (j === i ? { ...r, f: { ...r.f, [key]: v } } : r)))
    programar()
  }
  const agregarFila = () => setFilas(prev => [...prev, { key: nuevaClave(), id: null, f: { ...VACIA } }])
  const pedirQuitar = (i: number) => {
    const r = filas[i]
    if (!(r.id ?? idsRef.current.get(r.key)) && filaVacia(r.f)) return quitarFila(i)
    setQuitar(i)
  }
  const quitarFila = (i: number) => {
    setQuitar(null)
    const r = filas[i]
    const id = r.id ?? idsRef.current.get(r.key)
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

  const idDe = (r: FilaEditor) => r.id ?? idsRef.current.get(r.key) ?? null
  const criterioQuitar = quitar !== null ? filas[quitar] : null

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Rúbrica', to: rutaVolver },
          { label: elemento.nombre },
        ]}
      />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>Rúbrica del elemento</h1>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IndicadorGuardado estado={estado} />
          <button className="btn btn-outline" style={{ height: 40 }} onClick={volver} disabled={saliendo}>
            <Icon name="chevronLeft" size={16} strokeWidth={2} />Volver a la rúbrica
          </button>
        </span>
      </div>
      <CursoHeader titulo={elemento.nombre} curso={ctx.nombre} tipoEnsenanza={ctx.tipoEnsenanza} programas={ctx.programas} />

      <ResumenRubrica criterios={filas.map(r => r.f)} eliminados={0} nota="Los cambios se guardan automáticamente." />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filas.map((r, i) => {
          const id = idDe(r)
          return (
            <div key={r.key} id={i === filas.length - 1 ? 'fila-ultima' : id ? `fila-${id}` : undefined} style={{ scrollMarginTop: 150 }}>
              {id && i === filas.length - 1 && <span id={`fila-${id}`} />}
              <FilaCriterio
                numero={i + 1}
                fila={r.f}
                errores={erroresFila(r.f)}
                onChange={(k, v) => setCampo(i, k, v)}
                onEliminar={() => pedirQuitar(i)}
                pendientes={id ? comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === id).length : 0}
                onComentarios={() => id && setFiltro({ entidadId: id })}
              />
            </div>
          )
        })}
      </div>

      {filas.length < REGLAS_RUBRICA.maxCriterios ? (
        <button className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 10px' }} onClick={agregarFila}>
          <Icon name="plus" size={18} strokeWidth={2} />Agregar otro criterio
        </button>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Llegaste al máximo de {REGLAS_RUBRICA.maxCriterios} criterios por elemento.</span>
      )}

      <div className="form-footer">
        <IndicadorGuardado estado={estado} />
        <button className="btn btn-primary" style={{ height: 44, padding: '0 24px' }} onClick={volver} disabled={saliendo}>
          {saliendo ? 'Guardando…' : 'Volver a la rúbrica'}
        </button>
      </div>

      <Modal
        open={!!criterioQuitar}
        title="¿Eliminar criterio?"
        onClose={() => setQuitar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitar(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={() => quitar !== null && quitarFila(quitar)}>Sí, eliminar</button>
          </>
        }
      >
        {criterioQuitar && (
          <>
            Se eliminará el criterio <b>N°{(quitar ?? 0) + 1} · {criterioQuitar.f.dpl_criterio.trim() || 'Sin nombre'}</b>
            {criterioQuitar.f.dpl_puntajeestandar ? ` (${criterioQuitar.f.dpl_puntajeestandar} pt en estándar esperado)` : ''}. Los demás se volverán a numerar.
          </>
        )}
      </Modal>
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={`Comentarios: Criterio N°${filtro?.entidadId ? filas.findIndex(r => idDe(r) === filtro.entidadId) + 1 : ''}`}
        cursoId={ctx.id}
        instrumento="rubricas"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(_, campo) =>
          campo === 'dpl_criterio' ? 'Nombre del criterio' : campo === 'dpl_definicioncriterio' ? 'Descripción del criterio' : campo === CAMPO_GENERAL ? 'General' : NIVELES.find(n => n.texto === campo)?.label ?? campo
        }
        valorItem={(id, campo) => {
          const r = filas.find(x => idDe(x) === id)
          if (!r || campo === CAMPO_GENERAL) return null
          const n = NIVELES.find(k => k.texto === campo)
          return `${r.f[campo as keyof CriterioCampos] ?? ''}${n ? ` ${r.f[n.puntaje]}` : ''}`
        }}
        puedeComentar={false}
        puedeResponder
        puedeResolver={rol.monitor || rol.dda}
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

/**
 * Live check of the whole rubric (like the Power Apps box): what each level
 * adds up to and whether the rules hold, updated while typing.
 */
function ResumenRubrica({ criterios, eliminados, nota }: { criterios: Array<Partial<Record<keyof CriterioCampos, unknown>>>; eliminados: number; nota?: string | null }) {
  const { minCriterios, maxCriterios, inicialMin, inicialMax } = REGLAS_RUBRICA
  const num = (v: unknown) => {
    const t = v === null || v === undefined ? '' : String(v).trim()
    return /^\d+(\.\d+)?$/.test(t) ? Number(t) : 0
  }
  const suma = (k: keyof CriterioCampos) => Math.round(criterios.reduce((s, c) => s + num(c[k]), 0) * 100) / 100
  const estandar = suma('dpl_puntajeestandar')
  const inicial = suma('dpl_puntajeinicial')
  const n = criterios.length
  const falta = Math.round((PUNTAJE_OBJETIVO - estandar) * 100) / 100
  // Per-criterion problems (sums and count are shown as chips above).
  const porCriterio = advertenciasRubrica(criterios).filter(a => a.startsWith('Criterio N°'))

  const Chip = ({ ok, texto }: { ok: boolean | null; texto: string }) => (
    <span className={`regla-chip ${ok === null ? '' : ok ? 'ok' : 'mal'}`}>
      {ok !== null && <Icon name={ok ? 'checkCircle' : 'alert'} size={14} />}
      {texto}
    </span>
  )

  return (
    <div className="panel resumen-reglas">
      <div className="regla-fila">
        <Chip ok={n >= minCriterios && n <= maxCriterios} texto={`${n} ${n === 1 ? 'criterio' : 'criterios'} (${minCriterios} a ${maxCriterios})`} />
        <Chip ok={falta === 0} texto={`Estándar: ${estandar} / ${PUNTAJE_OBJETIVO}${falta > 0 ? ` (falta ${falta})` : falta < 0 ? ` (sobra ${-falta})` : ''}`} />
        <Chip ok={null} texto={`En proceso 2: ${suma('dpl_puntajeenproceso2')}`} />
        <Chip ok={null} texto={`En proceso 1: ${suma('dpl_puntajeenproceso1')}`} />
        <Chip ok={inicial >= inicialMin && inicial <= inicialMax} texto={`Inicial: ${inicial} (${inicialMin} a ${inicialMax})`} />
      </div>
      <div className="regla-detalle">
        {porCriterio.length === 0 ? (
          <span className="regla-ok"><Icon name="checkCircle" size={14} />Puntajes completos y en forma descendente en todos los criterios</span>
        ) : (
          porCriterio.map(a => <span key={a} className="regla-mal"><Icon name="alert" size={14} />{a}</span>)
        )}
        {eliminados > 0 && <span className="regla-mal">{eliminados} {eliminados === 1 ? 'criterio se quitará' : 'criterios se quitarán'} al guardar</span>}
        {nota && <span style={{ color: 'var(--color-text-muted)' }}>{nota}</span>}
      </div>
    </div>
  )
}

interface FilaProps {
  numero: number
  fila: Fila
  errores: Partial<Record<keyof CriterioCampos, string>>
  onChange: (k: keyof CriterioCampos, v: string) => void
  onEliminar?: () => void
  pendientes?: number
  onComentarios?: () => void
}

function FilaCriterio({ numero, fila, errores, onChange, onEliminar, pendientes = 0, onComentarios }: FilaProps) {
  const scroller = useRef<HTMLDivElement>(null)
  const [bordes, setBordes] = useState({ inicio: true, fin: false })
  const actualizar = () => {
    const el = scroller.current
    if (!el) return
    setBordes({ inicio: el.scrollLeft <= 2, fin: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2 })
  }
  useEffect(actualizar, [])
  const mover = (dir: 1 | -1) => scroller.current?.scrollBy({ left: dir * 400, behavior: 'smooth' })

  return (
    <div className="panel criterio-form">
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 12px 0' }}>
        <button className="nav-btn" aria-label="Ver columnas anteriores" disabled={bordes.inicio} onClick={() => mover(-1)}>
          <Icon name="chevronLeft" size={20} strokeWidth={2} />
        </button>
        <button className="nav-btn" aria-label="Ver más columnas" disabled={bordes.fin} onClick={() => mover(1)}>
          <Icon name="chevronRight" size={20} strokeWidth={2} />
        </button>
      </div>
      <div className="criterio-scroll" ref={scroller} onScroll={actualizar}>
        <table className="criterio-tabla">
          <thead>
            <tr>
              <th style={{ width: 80 }}>N°</th>
              {TEXTOS.map(t => <th key={t.key}>{t.label}</th>)}
              {NIVELES.map(n => <th key={n.texto}>{n.label}</th>)}
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ textAlign: 'center' }}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14 }}>
                  <b>N°{numero}</b>
                  {pendientes > 0 && (
                    <button className="chip chip-pt" style={{ display: 'inline-flex', gap: 4, border: 'none', cursor: 'pointer' }} title="Ver comentarios pendientes" onClick={onComentarios}>
                      <Icon name="comment" size={13} />{pendientes}
                    </button>
                  )}
                  {onEliminar && (
                    <button className="icon-btn" aria-label={`Eliminar criterio ${numero}`} onClick={onEliminar}>
                      <Icon name="trash" size={20} />
                    </button>
                  )}
                </div>
              </td>
              {TEXTOS.map(t => (
                <td key={t.key}>
                  {t.key === 'dpl_criterio' ? (
                    <Area value={fila[t.key]} max={t.max} error={errores[t.key]} onChange={v => onChange(t.key, v)} label={t.label} />
                  ) : (
                    <TextoEnriquecido id={`${t.key}-${numero}`} value={fila[t.key]} max={t.max} error={errores[t.key]} onChange={v => onChange(t.key, v)} placeholder="Ingresar información" minHeight={180} compacto />
                  )}
                </td>
              ))}
              {NIVELES.map(n => (
                <td key={n.texto}>
                  <TextoEnriquecido id={`${n.texto}-${numero}`} value={fila[n.texto]} max={LIMITES.criterioTexto} error={errores[n.texto]} onChange={v => onChange(n.texto, v)} placeholder="Ingresar información" minHeight={150} compacto />
                  <label className="field-label" style={{ marginTop: 10, marginBottom: 6 }}>
                    Puntaje
                    <input
                      type="text"
                      inputMode="decimal"
                      placeholder="Ej. 5 o 4.5"
                      value={fila[n.puntaje]}
                      onChange={e => onChange(n.puntaje, soloNumero(e.target.value))}
                      className={errores[n.puntaje] ? 'has-error' : ''}
                      style={{ marginTop: 6, height: 40, fontWeight: 400 }}
                      aria-label={`Puntaje ${n.label}`}
                    />
                  </label>
                  {errores[n.puntaje] && <span className="field-error"><Icon name="alert" size={13} />{errores[n.puntaje]}</span>}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Area(props: { value: string; max: number; error?: string; onChange: (v: string) => void; label: string }) {
  const { value, max, error, onChange, label } = props
  const excedido = value.length > max
  const msg = error ?? (excedido ? 'Exceso de caracteres' : undefined)
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <textarea
        className={`textarea${msg ? ' has-error' : ''}`}
        style={{ minHeight: 120, resize: 'none' }}
        placeholder="Ingresar información"
        value={value}
        aria-label={label}
        onChange={e => onChange(e.target.value)}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, gap: 8 }}>
        <span className="field-error" style={{ margin: 0, visibility: msg ? 'visible' : 'hidden' }}><Icon name="alert" size={13} />{msg ?? '.'}</span>
        <span style={{ color: excedido ? 'var(--color-danger)' : 'var(--color-text-muted)', whiteSpace: 'nowrap' }}>
          {excedido ? `-${value.length - max}` : value.length}/{max}
        </span>
      </div>
    </div>
  )
}
