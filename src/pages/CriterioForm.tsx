import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { CAMPO_GENERAL, PanelComentarios, type FiltroComentarios } from '../components/Comentarios'
import TextoEnriquecido from '../components/TextoEnriquecido'
import { estaVacio, longitud } from '../shared/textoRico'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, SavingOverlay, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  LIMITES,
  NIVELES,
  crearCriterios,
  REGLAS_RUBRICA,
  advertenciasRubrica,
  guardarRubricaCompleta,
  getComentarios,
  getCriteriosDeElemento,
  PUNTAJE_OBJETIVO,
  type Comentario,
  type CriterioRow,
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

function erroresFila(f: Fila): Partial<Record<keyof CriterioCampos, string>> {
  const e: Partial<Record<keyof CriterioCampos, string>> = {}
  for (const t of TEXTOS) {
    if (estaVacio(f[t.key])) e[t.key] = 'Completar información'
    else if (longitud(f[t.key]) > t.max) e[t.key] = 'Exceso de caracteres'
  }
  for (const n of NIVELES) {
    if (estaVacio(f[n.texto])) e[n.texto] = 'Completar información'
    else if (longitud(f[n.texto]) > LIMITES.criterioTexto) e[n.texto] = 'Exceso de caracteres'
    const p = f[n.puntaje].trim()
    if (p === '') e[n.puntaje] = 'Completar información'
    else if (!/^\d+(\.\d+)?$/.test(p)) e[n.puntaje] = 'Solo números (entero o decimal)'
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

export default function CriterioForm({ completa = false }: { completa?: boolean }) {
  const { cursoId, sesionId, criterioId } = useParams<{ cursoId: string; sesionId: string; criterioId?: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede } = usePuedeEditar(proceso, rol)
  // Editing always shows the whole rubric: every criterion of the element at once.
  const editando = completa || !!criterioId
  const foco = criterioId ?? (location.state as { foco?: string } | null)?.foco ?? null

  const [filas, setFilas] = useState<Fila[]>([{ ...VACIA }])
  // Id of each row when editing (null = criterion added on this screen).
  const [ids, setIds] = useState<Array<string | null>>([null])
  const [originales, setOriginales] = useState<string[]>([])
  const [cargandoCriterio, setCargandoCriterio] = useState(true)
  const [intento, setIntento] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [avisos, setAvisos] = useState<string[] | null>(null)
  // Criteria the element already has: new ones continue their numbering.
  const [existentes, setExistentes] = useState<CriterioRow[]>([])
  // Reviewers' comments, so the teacher can address them while editing.
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const cargarComentarios = () => {
    if (cursoId) getComentarios(cursoId, 'rubricas').then(setComentarios).catch(() => setComentarios([]))
  }
  useEffect(cargarComentarios, [cursoId]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    document.title = `${editando ? 'Editar rúbrica' : 'Agregar criterio'} — Diseña+`
    if (!sesionId) return
    getCriteriosDeElemento(sesionId)
      .then(lista => {
        setExistentes(lista)
        if (!editando || lista.length === 0) return
        setFilas(
          lista.map(c => {
            const f = { ...VACIA }
            for (const k of Object.keys(VACIA) as Array<keyof CriterioCampos>) {
              const v = c[k]
              f[k] = v === null || v === undefined ? '' : String(v)
            }
            return f
          }),
        )
        setIds(lista.map(c => c.dpl_rubricacriterioid))
        setOriginales(lista.map(c => c.dpl_rubricacriterioid))
      })
      .catch(err => toast(err instanceof Error ? err.message : 'No se pudo cargar la rúbrica.', 'error'))
      .finally(() => setCargandoCriterio(false))
  }, [sesionId, editando, toast])

  // Coming from "⋮ → Editar" of one criterion: scroll to it.
  useEffect(() => {
    if (cargandoCriterio || !foco) return
    const t = setTimeout(() => document.getElementById(`fila-${foco}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 150)
    return () => clearTimeout(t)
  }, [cargandoCriterio, foco])

  if (loading || cargandoCriterio) return <Cargando texto="Cargando" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  const elemento = ctx.elementos.find(e => e.sesionId === sesionId)
  if (!elemento) return <ErrorPanel mensaje="El elemento no existe en este curso." />
  if (!puede) return <Navigate to={`/cursos/${ctx.id}/rubricas`} replace />

  const volver = `/cursos/${ctx.id}/rubricas`
  const errores = filas.map(erroresFila)
  const hayErrores = errores.some(e => Object.keys(e).length > 0)
  const eliminados = originales.filter(id => !ids.includes(id))

  const setCampo = (i: number, key: keyof CriterioCampos, v: string) => {
    setSucio(true)
    setFilas(prev => prev.map((f, j) => (j === i ? { ...f, [key]: v } : f)))
  }
  const agregarFila = () => {
    setSucio(true)
    setFilas(prev => [...prev, { ...VACIA }])
    setIds(prev => [...prev, null])
  }
  const quitarFila = (i: number) => {
    setSucio(true)
    setFilas(prev => prev.filter((_, j) => j !== i))
    setIds(prev => prev.filter((_, j) => j !== i))
  }

  // Rules of the whole rubric after saving (existing criteria + the new ones when adding).
  const rubricaResultante = editando ? filas : [...existentes, ...filas]
  const pedirGuardar = () => {
    setIntento(true)
    if (hayErrores) return
    const a = advertenciasRubrica(rubricaResultante)
    if (a.length) setAvisos(a)
    else guardar()
  }

  const guardar = async () => {
    setAvisos(null)
    setIntento(true)
    if (hayErrores || !user) return
    setGuardando(true)
    try {
      if (editando) {
        await guardarRubricaCompleta(elemento, filas.map((f, i) => ({ id: ids[i], campos: aCampos(f) })), eliminados, user.correo)
        navigate(volver, { state: { toast: 'Se guardó la rúbrica con éxito', abrir: foco ?? undefined } })
      } else {
        const primero = await crearCriterios(elemento, filas.map(aCampos), user.correo)
        navigate(volver, { state: { toast: filas.length > 1 ? 'Se agregaron los criterios con éxito' : 'Se agregó el criterio con éxito', abrir: primero } })
      }
    } catch (err) {
      setGuardando(false)
      toast(err instanceof Error ? `Error al guardar: ${err.message}` : 'Error al guardar.', 'error')
    }
  }

  const titulo = editando ? 'Editar rúbrica' : 'Agregar criterio'
  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Rúbrica', to: volver },
          { label: titulo },
        ]}
      />
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>{titulo}</h1>
      <CursoHeader titulo={elemento.nombre} curso={ctx.nombre} tipoEnsenanza={ctx.tipoEnsenanza} programas={ctx.programas} />

      <ResumenRubrica
        criterios={rubricaResultante}
        eliminados={eliminados.length}
        nota={!editando && existentes.length > 0 ? `Este elemento ya tiene ${existentes.length} ${existentes.length === 1 ? 'criterio' : 'criterios'}; los nuevos se agregan desde el N°${existentes.length + 1}.` : null}
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filas.map((f, i) => (
          <div key={ids[i] ?? `nueva-${i}`} id={ids[i] ? `fila-${ids[i]}` : undefined} style={{ scrollMarginTop: 16 }}>
            <FilaCriterio
              numero={editando ? i + 1 : existentes.length + i + 1}
              fila={f}
              errores={intento ? errores[i] : {}}
              onChange={(k, v) => setCampo(i, k, v)}
              onEliminar={filas.length > 1 ? () => quitarFila(i) : undefined}
              pendientes={ids[i] ? comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === ids[i]).length : 0}
              onComentarios={() => ids[i] && setFiltro({ entidadId: ids[i]! })}
            />
          </div>
        ))}
      </div>

      {(editando ? filas.length : existentes.length + filas.length) < REGLAS_RUBRICA.maxCriterios ? (
        <button className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 10px' }} onClick={agregarFila}>
          <Icon name="plus" size={18} strokeWidth={2} />Agregar otro criterio
        </button>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Llegaste al máximo de {REGLAS_RUBRICA.maxCriterios} criterios por elemento.</span>
      )}

      <div className="form-footer">
        <button className="btn btn-outline" style={{ height: 44, padding: '0 24px' }} onClick={() => (sucio ? setConfirmarCancelar(true) : navigate(volver))}>
          Cancelar
        </button>
        <button className="btn btn-primary" style={{ height: 44, padding: '0 28px' }} onClick={pedirGuardar}>
          {editando ? 'Guardar rúbrica' : 'Guardar'}
        </button>
      </div>

      <Modal
        open={confirmarCancelar}
        title={editando ? '¿Cancelar edición de la rúbrica?' : '¿Cancelar creación de criterios?'}
        onClose={() => setConfirmarCancelar(false)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setConfirmarCancelar(false)}>No, continuar</button>
            <button className="btn btn-primary" onClick={() => navigate(volver)}>Sí, cancelar</button>
          </>
        }
      >
        {editando ? 'No se guardará ningún cambio de la rúbrica.' : undefined}
      </Modal>
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={`Comentarios: Criterio N°${filtro?.entidadId ? ids.indexOf(filtro.entidadId) + 1 : ''}`}
        cursoId={ctx.id}
        instrumento="rubricas"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(_, campo) =>
          campo === 'dpl_criterio' ? 'Nombre del criterio' : campo === 'dpl_definicioncriterio' ? 'Descripción del criterio' : campo === CAMPO_GENERAL ? 'General' : NIVELES.find(n => n.texto === campo)?.label ?? campo
        }
        valorItem={(id, campo) => {
          const f = filas[ids.indexOf(id)]
          if (!f || campo === CAMPO_GENERAL) return null
          const n = NIVELES.find(k => k.texto === campo)
          return `${f[campo as keyof CriterioCampos] ?? ''}${n ? ` ${f[n.puntaje]}` : ''}`
        }}
        puedeComentar={false}
        puedeResponder
        puedeResolver={rol.monitor || rol.dda}
        lado={rol.lado}
        etiquetaRol={rol.etiqueta}
      />
      <Modal
        open={!!avisos}
        title="La rúbrica aún no cumple todas las reglas"
        onClose={() => setAvisos(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setAvisos(null)}>Seguir editando</button>
            <button className="btn btn-primary" onClick={guardar}>Guardar de todos modos</button>
          </>
        }
      >
        <ul style={{ margin: '0 0 10px 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {avisos?.map(a => <li key={a}>{a}</li>)}
        </ul>
        Puedes guardar y seguir después, pero para «Finalizar edición general» el estándar esperado de cada elemento debe sumar {PUNTAJE_OBJETIVO} pt.
      </Modal>
      <SavingOverlay show={guardando} />
    </div>
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
