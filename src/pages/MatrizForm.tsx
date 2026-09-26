import { useEffect, useRef, useState } from 'react'
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import { CAMPO_GENERAL, PanelComentarios, type FiltroComentarios } from '../components/Comentarios'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import { getComentarios, type Comentario } from '../shared/academico'
import {
  NIVELES_TAXONOMIA,
  REGLAS_MATRIZ,
  advertenciasMatriz,
  esMatrizConRubrica,
  getPreguntasDeElemento,
  getTaxonomia,
  guardarMatrizCompleta,
  plataformaDe,
  tiposDeItem,
  totalMatriz,
  type PreguntaCampos,
  type TaxonomiaItem,
} from '../shared/matriz'
import { useContenidoAcademico, usePuedeEditar } from '../shared/hooks/useContenidoAcademico'
import { SumaMatriz, recursosMatriz } from './MatrizPage'

interface Fila {
  dpl_nombreunidad: string
  dpl_ejetematico: string
  dpl_taxonomia: string
  dpl_tipoitem: string
  dpl_cantidaditems: string
  dpl_criterio: string
  dpl_indicador: string
  dpl_puntajeia: string
}
const VACIA: Fila = { dpl_nombreunidad: '', dpl_ejetematico: '', dpl_taxonomia: '', dpl_tipoitem: '', dpl_cantidaditems: '1', dpl_criterio: '', dpl_indicador: '', dpl_puntajeia: '' }
/** Fields that count to decide if a row is still empty (unit and quantity come pre-filled). */
const CAMPOS_PROPIOS: Array<keyof Fila> = ['dpl_ejetematico', 'dpl_taxonomia', 'dpl_tipoitem', 'dpl_criterio', 'dpl_indicador', 'dpl_puntajeia']

interface FilaEditor {
  key: string
  id: string | null
  f: Fila
}

let contadorFilas = 0
const nuevaClave = () => `preg-${Date.now()}-${++contadorFilas}`
const filaVacia = (f: Fila) => CAMPOS_PROPIOS.every(k => !f[k].trim())
const fmt = (n: number) => String(n).replace('.', ',')

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

const aCampos = (f: Fila, conRubrica: boolean, taxonomia: TaxonomiaItem[]): PreguntaCampos => ({
  dpl_nombreunidad: f.dpl_nombreunidad.trim() || null,
  dpl_ejetematico: f.dpl_ejetematico.trim() || null,
  dpl_taxonomia: f.dpl_taxonomia || null,
  dpl_tipoitem: f.dpl_tipoitem || null,
  // Name of the item type in the platform ("Seleccionar una alternativa"…), from the catalogue.
  dpl_plataforma: plataformaDe(taxonomia, f.dpl_tipoitem) || null,
  dpl_cantidaditems: conRubrica ? 1 : Math.min(REGLAS_MATRIZ.maxItems, Math.max(1, Number(f.dpl_cantidaditems) || 1)),
  dpl_criterio: conRubrica ? f.dpl_criterio.trim() || null : null,
  dpl_indicador: f.dpl_indicador.trim() || null,
  dpl_puntajeia: f.dpl_puntajeia.trim() === '' ? null : Number(f.dpl_puntajeia),
  dpl_puntajeestandar: null,
})

function erroresFila(f: Fila, conRubrica: boolean, taxonomia: TaxonomiaItem[]): Partial<Record<keyof Fila, string>> {
  const e: Partial<Record<keyof Fila, string>> = {}
  if (!filaVacia(f)) {
    const requeridos: Array<keyof Fila> = ['dpl_nombreunidad', 'dpl_ejetematico', 'dpl_taxonomia', 'dpl_tipoitem', 'dpl_indicador', 'dpl_puntajeia', ...(conRubrica ? (['dpl_criterio'] as Array<keyof Fila>) : [])]
    for (const k of requeridos) if (!f[k].trim()) e[k] = 'Debes completar este campo'
  }
  if (f.dpl_puntajeia.trim() && !(Number(f.dpl_puntajeia) > 0)) e.dpl_puntajeia = 'Debe ser un número mayor que 0'
  if (!conRubrica && f.dpl_taxonomia && f.dpl_tipoitem && taxonomia.length && !tiposDeItem(taxonomia, f.dpl_taxonomia, false).some(t => t.tipo === f.dpl_tipoitem))
    e.dpl_tipoitem = `No corresponde al nivel «${f.dpl_taxonomia}»`
  if (f.dpl_ejetematico.length > REGLAS_MATRIZ.ejeMax) e.dpl_ejetematico = 'Exceso de caracteres'
  if (f.dpl_indicador.length > REGLAS_MATRIZ.indicadorMax) e.dpl_indicador = 'Exceso de caracteres'
  if (f.dpl_criterio.length > REGLAS_MATRIZ.criterioMax) e.dpl_criterio = 'Exceso de caracteres'
  return e
}

type EstadoGuardado = 'idle' | 'guardando' | 'guardado' | 'error'

/**
 * Indicators of one element's matrix, all at once, saved automatically. Each one follows the
 * Power Apps dialog: unidad, eje temático, taxonomía, tipo de ítem, ítems; then what the IA
 * will generate later (indicador, criterio with rubric, puntaje por ítem), typed by hand for now.
 */
export default function MatrizForm() {
  const { cursoId, sesionId } = useParams<{ cursoId: string; sesionId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, rol, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede } = usePuedeEditar(proceso, rol)
  const estadoNav = location.state as { foco?: string; nueva?: boolean } | null
  const foco = estadoNav?.foco ?? null
  const nueva = !!estadoNav?.nueva

  const [filas, setFilas] = useState<FilaEditor[]>([])
  const [taxonomia, setTaxonomia] = useState<TaxonomiaItem[]>([])
  const [cargando, setCargando] = useState(true)
  const [estado, setEstado] = useState<EstadoGuardado>('idle')
  const [quitar, setQuitar] = useState<number | null>(null)
  const [saliendo, setSaliendo] = useState(false)
  const [comentarios, setComentarios] = useState<Comentario[]>([])
  const [filtro, setFiltro] = useState<FiltroComentarios | null>(null)
  const cargarComentarios = () => {
    if (cursoId) getComentarios(cursoId, 'matriz').then(setComentarios).catch(() => setComentarios([]))
  }
  useEffect(cargarComentarios, [cursoId]) // eslint-disable-line react-hooks/exhaustive-deps

  const filasRef = useRef(filas)
  filasRef.current = filas
  const taxRef = useRef(taxonomia)
  taxRef.current = taxonomia
  const idsRef = useRef(new Map<string, string>())
  const eliminadosRef = useRef<string[]>([])
  const sucioRef = useRef(false)
  const guardandoRef = useRef(false)
  const pendienteRef = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const elemento = ctx?.elementos.find(e => e.sesionId === sesionId) ?? null
  const conRubrica = elemento ? esMatrizConRubrica(elemento) : false

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
      const actuales = filasRef.current
        .map(r => ({ ...r, id: r.id ?? idsRef.current.get(r.key) ?? null }))
        .filter(r => r.id || !filaVacia(r.f))
      const borrar = [...eliminadosRef.current]
      const ids = await guardarMatrizCompleta(elemento, actuales.map(r => ({ id: r.id, campos: aCampos(r.f, conRubrica, taxRef.current) })), borrar, user.correo)
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

  const unidadElemento = elemento?.unidadNombre ?? ''
  useEffect(() => {
    document.title = 'Matriz — Diseña+'
    if (!sesionId || !ctx) return
    Promise.all([getPreguntasDeElemento(sesionId), getTaxonomia().catch(() => [] as TaxonomiaItem[])])
      .then(([lista, tax]) => {
        setTaxonomia(tax)
        const cargadas: FilaEditor[] = lista.map(p => ({
          key: nuevaClave(),
          id: p.dpl_matrizpreguntaid,
          f: {
            dpl_nombreunidad: p.dpl_nombreunidad ?? '',
            dpl_ejetematico: p.dpl_ejetematico ?? '',
            dpl_taxonomia: p.dpl_taxonomia ?? '',
            dpl_tipoitem: p.dpl_tipoitem ?? '',
            dpl_cantidaditems: String(p.dpl_cantidaditems ?? 1),
            dpl_criterio: p.dpl_criterio ?? '',
            dpl_indicador: p.dpl_indicador ?? '',
            dpl_puntajeia: p.dpl_puntajeia === null ? '' : String(p.dpl_puntajeia),
          },
        }))
        // "Agregar indicador" starts with a new row (its unit is the element's own).
        if ((nueva && cargadas.length < REGLAS_MATRIZ.maxPreguntas) || cargadas.length === 0) cargadas.push({ key: nuevaClave(), id: null, f: { ...VACIA, dpl_nombreunidad: unidadElemento } })
        setFilas(cargadas)
      })
      .catch(err => toast(err instanceof Error ? err.message : 'No se pudo cargar la matriz.', 'error'))
      .finally(() => setCargando(false))
  }, [sesionId, !!ctx, nueva, unidadElemento, toast]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (cargando) return
    const destino = document.getElementById(foco ? `preg-${foco}` : nueva ? 'preg-ultima' : '')
    const t = setTimeout(() => destino?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150)
    return () => clearTimeout(t)
  }, [cargando, foco, nueva])

  if (loading || cargando) return <Cargando texto="Cargando" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  if (!elemento) return <ErrorPanel mensaje="El elemento no existe en este curso." />
  const rutaVolver = `/cursos/${ctx.id}/matriz`
  if (!puede) return <Navigate to={rutaVolver} replace />

  const unidades = [...new Set(ctx.elementos.map(e => e.unidadNombre).filter(Boolean))]
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

  const setCampos = (i: number, cambios: Partial<Fila>) => {
    setFilas(prev => prev.map((r, j) => (j === i ? { ...r, f: { ...r.f, ...cambios } } : r)))
    programar()
  }
  // Without rubric the level decides the item types: a type that no longer fits is cleared.
  const cambiarTaxonomia = (i: number, nivel: string) => {
    const tipo = filas[i].f.dpl_tipoitem
    const sigue = conRubrica || !tipo || tiposDeItem(taxonomia, nivel, false).some(t => t.tipo === tipo)
    setCampos(i, { dpl_taxonomia: nivel, ...(sigue ? {} : { dpl_tipoitem: '' }) })
  }
  const idDe = (r: FilaEditor) => r.id ?? idsRef.current.get(r.key) ?? null
  const quitarFila = (i: number) => {
    setQuitar(null)
    const id = idDe(filas[i])
    const resto = filas.filter((_, j) => j !== i)
    const nuevas = resto.length ? resto : [{ key: nuevaClave(), id: null, f: { ...VACIA, dpl_nombreunidad: unidadElemento } }]
    filasRef.current = nuevas
    setFilas(nuevas)
    if (id) {
      eliminadosRef.current.push(id)
      sucioRef.current = true
      void flush()
    }
  }
  const pedirQuitar = (i: number) => (!idDe(filas[i]) && filaVacia(filas[i].f) ? quitarFila(i) : setQuitar(i))

  const conDatos = filas.filter(r => !filaVacia(r.f)).map(r => aCampos(r.f, conRubrica, taxonomia))
  const total = totalMatriz(conDatos)
  const porPregunta = advertenciasMatriz(conDatos, conRubrica, taxonomia).filter(a => a.startsWith('Indicador N°') && !a.includes('está vacía'))

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <Breadcrumbs items={[{ label: 'Cursos', to: '/cursos' }, { label: ctx.nombre, to: `/cursos/${ctx.id}` }, { label: 'Matriz', to: rutaVolver }, { label: 'Agregar indicador' }]} />
      <div className="row-between" style={{ flexWrap: 'wrap', gap: 12 }}>
        <span style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Matriz {conRubrica ? 'con' : 'sin'} rúbrica</h1>
          <span style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>Selecciona los datos de cada indicador y completa el ítem.</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <IndicadorGuardado estado={estado} />
          <button className="btn btn-outline" style={{ height: 40 }} onClick={volver} disabled={saliendo}>
            <Icon name="chevronLeft" size={16} strokeWidth={2} />Volver a la matriz
          </button>
        </span>
      </div>
      <CursoHeader titulo={elemento.nombre} curso={ctx.nombre} tipoEnsenanza={ctx.tipoEnsenanza} programas={ctx.programas} acciones={recursosMatriz(ctx, elemento)} />

      <div className="panel resumen-reglas">
        <div className="regla-fila">
          <span className={`regla-chip ${filas.length <= REGLAS_MATRIZ.maxPreguntas ? 'ok' : 'mal'}`}>
            <Icon name={filas.length <= REGLAS_MATRIZ.maxPreguntas ? 'checkCircle' : 'alert'} size={14} />
            {conDatos.length} {conDatos.length === 1 ? 'indicador' : 'indicadores'} (máximo {REGLAS_MATRIZ.maxPreguntas})
          </span>
          <SumaMatriz total={total} />
        </div>
        <div className="regla-detalle">
          {porPregunta.length === 0 ? (
            <span className="regla-ok"><Icon name="checkCircle" size={14} />Indicadores completos</span>
          ) : (
            porPregunta.map(a => <span key={a} className="regla-mal"><Icon name="alert" size={14} />{a}</span>)
          )}
          <span style={{ color: 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            P. estándar = P. por ítem × ítems. Los cambios se guardan automáticamente.
            <span className="chip chip-gris" title="La IA generará el indicador y los puntajes"><Icon name="sparkles" size={12} />IA próximamente</span>
          </span>
        </div>
      </div>

      {filas.map((r, i) => {
        const id = idDe(r)
        const errores = erroresFila(r.f, conRubrica, taxonomia)
        const pendientes = id ? comentarios.filter(k => !k.padreId && !k.resuelto && k.entidadId === id).length : 0
        const tipos = tiposDeItem(taxonomia, r.f.dpl_taxonomia || null, conRubrica)
        const plataforma = plataformaDe(taxonomia, r.f.dpl_tipoitem)
        const campos = aCampos(r.f, conRubrica, taxonomia)
        const estandar = campos.dpl_puntajeia === null ? null : Math.round(campos.dpl_puntajeia * (campos.dpl_cantidaditems ?? 1) * 100) / 100
        return (
          <section key={r.key} id={i === filas.length - 1 && nueva ? 'preg-ultima' : id ? `preg-${id}` : undefined} className="panel matriz-card" style={{ scrollMarginTop: 150 }}>
            <div className="matriz-card-head">
              <b>Indicador N°{i + 1}</b>
              {pendientes > 0 && (
                <button className="chip chip-pt" style={{ display: 'inline-flex', gap: 4, border: 'none', cursor: 'pointer' }} title="Ver comentarios pendientes" onClick={() => id && setFiltro({ entidadId: id })}>
                  <Icon name="comment" size={13} />{pendientes}
                </button>
              )}
              <span style={{ flex: 1 }} />
              <button className="icon-btn" aria-label={`Eliminar indicador ${i + 1}`} onClick={() => pedirQuitar(i)}>
                <Icon name="trash" size={18} />
              </button>
            </div>

            <div className={`matriz-zonas${conRubrica ? ' con-criterio' : ''}`}>
              <div className="matriz-datos">
                <span className="matriz-zona-titulo">
                  <Icon name="filtro" size={13} />Datos para generar
                </span>
                <div className="matriz-datos-grid">
                  <Campo label="Unidad" ancho error={errores.dpl_nombreunidad}>
                    <select className={`input${errores.dpl_nombreunidad ? ' has-error' : ''}`} value={r.f.dpl_nombreunidad} title={r.f.dpl_nombreunidad} onChange={e => setCampos(i, { dpl_nombreunidad: e.target.value })}>
                      <option value="">Selecciona</option>
                      {[...new Set([...unidades, r.f.dpl_nombreunidad].filter(Boolean))].map(u => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </Campo>
                  <Campo label="Taxonomía" error={errores.dpl_taxonomia}>
                    <select className={`input${errores.dpl_taxonomia ? ' has-error' : ''}`} value={r.f.dpl_taxonomia} onChange={e => cambiarTaxonomia(i, e.target.value)}>
                      <option value="">Selecciona</option>
                      {[...new Set([...NIVELES_TAXONOMIA, r.f.dpl_taxonomia].filter(Boolean))].map(n => <option key={n} value={n}>{n}</option>)}
                    </select>
                  </Campo>
                  <Campo
                    label="Tipo de ítem"
                    error={errores.dpl_tipoitem}
                    ayuda={plataforma ? `Plataforma: ${plataforma}` : !conRubrica && !r.f.dpl_taxonomia ? 'Elige primero la taxonomía' : undefined}
                  >
                    <select
                      className={`input${errores.dpl_tipoitem ? ' has-error' : ''}`}
                      value={r.f.dpl_tipoitem}
                      disabled={!conRubrica && !r.f.dpl_taxonomia}
                      onChange={e => setCampos(i, { dpl_tipoitem: e.target.value })}
                    >
                      <option value="">Selecciona</option>
                      {tipos.map(t => <option key={t.tipo} value={t.tipo}>{t.tipo}</option>)}
                      {r.f.dpl_tipoitem && !tipos.some(t => t.tipo === r.f.dpl_tipoitem) && <option value={r.f.dpl_tipoitem}>{r.f.dpl_tipoitem}</option>}
                    </select>
                  </Campo>
                  <Campo label="Ítems" titulo={conRubrica ? 'Con rúbrica cada indicador es 1 ítem' : `Cantidad de ítems a elaborar: de 1 a ${REGLAS_MATRIZ.maxItems}`}>
                    {conRubrica ? (
                      <div className="input input-fijo">1</div>
                    ) : (
                      <Paso
                        valor={r.f.dpl_cantidaditems}
                        label={`ítems del indicador ${i + 1}`}
                        menos={Number(r.f.dpl_cantidaditems) > 1}
                        mas={Number(r.f.dpl_cantidaditems) < REGLAS_MATRIZ.maxItems}
                        onMover={dir => setCampos(i, { dpl_cantidaditems: String(Math.min(REGLAS_MATRIZ.maxItems, Math.max(1, (Number(r.f.dpl_cantidaditems) || 1) + dir))) })}
                        onEscribir={v => setCampos(i, { dpl_cantidaditems: v.replace(/\D/g, '').slice(0, 2) })}
                        inputMode="numeric"
                      />
                    )}
                  </Campo>
                  <Campo label="Eje temático" ancho error={errores.dpl_ejetematico}>
                    <Area value={r.f.dpl_ejetematico} max={REGLAS_MATRIZ.ejeMax} error={!!errores.dpl_ejetematico} onChange={v => setCampos(i, { dpl_ejetematico: v })} label={`Eje temático ${i + 1}`} bajo />
                  </Campo>
                </div>
              </div>
              <div className="matriz-resultado">
                <span className="matriz-zona-titulo principal">
                  <Icon name="target" size={14} />{conRubrica ? 'Indicador, criterio y puntajes' : 'Indicador y puntajes'}
                </span>
                <Campo label="Indicador (acción + contenido + condición)" error={errores.dpl_indicador}>
                  <Area value={r.f.dpl_indicador} max={REGLAS_MATRIZ.indicadorMax} error={!!errores.dpl_indicador} onChange={v => setCampos(i, { dpl_indicador: v })} label={`Indicador ${i + 1}`} />
                </Campo>
                {conRubrica && (
                  <Campo label="Criterio" error={errores.dpl_criterio}>
                    <Area value={r.f.dpl_criterio} max={REGLAS_MATRIZ.criterioMax} error={!!errores.dpl_criterio} onChange={v => setCampos(i, { dpl_criterio: v })} label={`Criterio ${i + 1}`} bajo />
                  </Campo>
                )}
                <div className="matriz-puntajes">
                  <Campo label="P. por ítem" error={errores.dpl_puntajeia} titulo="Puntaje por ítem">
                    <Paso
                      valor={r.f.dpl_puntajeia}
                      label={`puntaje por ítem del indicador ${i + 1}`}
                      error={!!errores.dpl_puntajeia}
                      menos={!!Number(r.f.dpl_puntajeia)}
                      mas
                      onMover={dir => setCampos(i, { dpl_puntajeia: moverPuntaje(r.f.dpl_puntajeia, dir) })}
                      onEscribir={v => setCampos(i, { dpl_puntajeia: soloNumero(v) })}
                      inputMode="decimal"
                      placeholder="2.5"
                    />
                  </Campo>
                  <Campo label="P. estándar" titulo={conRubrica ? 'Puntaje estándar esperado = puntaje por ítem' : 'Puntaje estándar esperado = puntaje por ítem × ítems'}>
                    <div className="input input-fijo" style={{ fontWeight: 700 }}>{estandar === null ? '—' : `${fmt(estandar)} pt`}</div>
                  </Campo>
                </div>
              </div>
            </div>
          </section>
        )
      })}

      {filas.length < REGLAS_MATRIZ.maxPreguntas ? (
        <button className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 10px' }} onClick={() => setFilas(prev => [...prev, { key: nuevaClave(), id: null, f: { ...VACIA, dpl_nombreunidad: unidadElemento } }])}>
          <Icon name="plus" size={18} strokeWidth={2} />Agregar otro indicador
        </button>
      ) : (
        <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Llegaste al máximo de {REGLAS_MATRIZ.maxPreguntas} indicadores por elemento.</span>
      )}

      <div className="form-footer">
        <IndicadorGuardado estado={estado} />
        <button className="btn btn-primary" style={{ height: 44, padding: '0 24px' }} onClick={volver} disabled={saliendo}>
          {saliendo ? 'Guardando…' : 'Volver a la matriz'}
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
        {quitar !== null && filas[quitar] && <>Se eliminará el <b>Indicador N°{quitar + 1}</b>. Los demás se volverán a numerar.</>}
      </Modal>
      <PanelComentarios
        filtro={filtro}
        onClose={() => setFiltro(null)}
        titulo={`Comentarios: Indicador N°${filtro?.entidadId ? filas.findIndex(r => idDe(r) === filtro.entidadId) + 1 : ''}`}
        cursoId={ctx.id}
        instrumento="matriz"
        comentarios={comentarios}
        onCambio={cargarComentarios}
        etiquetaItem={(_, campo) => (campo === CAMPO_GENERAL ? 'General' : campo.replace('dpl_', ''))}
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

function Campo(props: { label: string; error?: string; ayuda?: string; titulo?: string; ancho?: boolean; children: React.ReactNode }) {
  const error = props.error === 'Debes completar este campo' ? undefined : props.error
  return (
    <div className={`matriz-campo${props.ancho ? ' matriz-ancho' : ''}`} title={props.titulo}>
      <span className="matriz-label">{props.label}</span>
      {props.children}
      {error ? (
        <span className="field-error" style={{ margin: 0 }}><Icon name="alert" size={13} />{error}</span>
      ) : props.ayuda ? (
        <span className="matriz-ayuda">{props.ayuda}</span>
      ) : null}
    </div>
  )
}

function Paso(props: {
  valor: string
  label: string
  error?: boolean
  menos: boolean
  mas: boolean
  onMover: (dir: 1 | -1) => void
  onEscribir: (v: string) => void
  inputMode: 'numeric' | 'decimal'
  placeholder?: string
}) {
  return (
    <div className={`puntaje-paso${props.error ? ' has-error' : ''}`}>
      <button type="button" aria-label={`Bajar ${props.label}`} disabled={!props.menos} onClick={() => props.onMover(-1)}>
        <Icon name="chevronDown" size={16} strokeWidth={2.4} />
      </button>
      <input
        type="text"
        inputMode={props.inputMode}
        placeholder={props.placeholder}
        value={props.valor}
        aria-label={props.label}
        onChange={e => props.onEscribir(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'ArrowUp' && props.mas) {
            e.preventDefault()
            props.onMover(1)
          } else if (e.key === 'ArrowDown' && props.menos) {
            e.preventDefault()
            props.onMover(-1)
          }
        }}
      />
      <button type="button" aria-label={`Subir ${props.label}`} disabled={!props.mas} onClick={() => props.onMover(1)}>
        <Icon name="chevronUp" size={16} strokeWidth={2.4} />
      </button>
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

function Area(props: { value: string; max: number; error?: boolean; onChange: (v: string) => void; label: string; bajo?: boolean }) {
  const { value, max, error, onChange, label, bajo } = props
  return (
    <>
      <textarea
        className={`textarea indicador-area${error ? ' has-error' : ''}`}
        style={{ minHeight: bajo ? 44 : 60 }}
        placeholder="Ingresar información"
        value={value}
        aria-label={label}
        onChange={e => onChange(e.target.value)}
      />
      <span style={{ fontSize: 11, alignSelf: 'flex-end', marginTop: -2, color: value.length > max ? 'var(--color-danger)' : 'var(--color-text-muted)' }}>{value.length}/{max}</span>
    </>
  )
}
