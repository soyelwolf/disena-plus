import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import Icon from '../components/Icon'
import TextoEnriquecido from '../components/TextoEnriquecido'
import { estaVacio, longitud } from '../shared/textoRico'
import { Breadcrumbs, Cargando, CursoHeader, ErrorPanel, Modal, SavingOverlay, useToast } from '../components/ui'
import { useAuth } from '../shared/AuthContext'
import {
  LIMITES,
  NIVELES,
  actualizarCriterio,
  crearCriterios,
  getCriterio,
  getCriteriosDeElemento,
  PUNTAJE_OBJETIVO,
  totalEstandar,
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
    else if (!(Number(p) >= 0)) e[n.puntaje] = 'Ingresa un número válido'
  }
  return e
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

export default function CriterioForm() {
  const { cursoId, sesionId, criterioId } = useParams<{ cursoId: string; sesionId: string; criterioId?: string }>()
  const navigate = useNavigate()
  const toast = useToast()
  const { user } = useAuth()
  const { ctx, proceso, error, loading, recargar } = useContenidoAcademico(cursoId)
  const { puede } = usePuedeEditar(proceso, 'rubricas')
  const editando = !!criterioId

  const [filas, setFilas] = useState<Fila[]>([{ ...VACIA }])
  const [cargandoCriterio, setCargandoCriterio] = useState(editando)
  const [intento, setIntento] = useState(false)
  const [sucio, setSucio] = useState(false)
  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [guardando, setGuardando] = useState(false)
  // Criteria the element already has: new ones continue their numbering.
  const [existentes, setExistentes] = useState<CriterioRow[]>([])
  useEffect(() => {
    if (sesionId) getCriteriosDeElemento(sesionId).then(setExistentes).catch(() => setExistentes([]))
  }, [sesionId])

  useEffect(() => {
    document.title = `${editando ? 'Editar' : 'Agregar'} criterio — Diseña+`
    if (!criterioId) return
    getCriterio(criterioId)
      .then(c => {
        if (c) {
          const f = { ...VACIA }
          for (const k of Object.keys(VACIA) as Array<keyof CriterioCampos>) {
            const v = c[k]
            f[k] = v === null || v === undefined ? '' : String(v)
          }
          setFilas([f])
        }
      })
      .catch(err => toast(err instanceof Error ? err.message : 'No se pudo cargar el criterio.', 'error'))
      .finally(() => setCargandoCriterio(false))
  }, [criterioId, editando, toast])

  if (loading || cargandoCriterio) return <Cargando texto="Cargando" />
  if (error || !ctx || !proceso) return <ErrorPanel mensaje={error ?? 'Curso no encontrado.'} onRetry={recargar} />
  const elemento = ctx.elementos.find(e => e.sesionId === sesionId)
  if (!elemento) return <ErrorPanel mensaje="El elemento no existe en este curso." />
  if (!puede) return <Navigate to={`/cursos/${ctx.id}/rubricas`} replace />

  const volver = `/cursos/${ctx.id}/rubricas`
  const errores = filas.map(erroresFila)
  const hayErrores = errores.some(e => Object.keys(e).length > 0)

  const setCampo = (i: number, key: keyof CriterioCampos, v: string) => {
    setSucio(true)
    setFilas(prev => prev.map((f, j) => (j === i ? { ...f, [key]: v } : f)))
  }

  const guardar = async () => {
    setIntento(true)
    if (hayErrores || !user) return
    setGuardando(true)
    try {
      if (editando && criterioId) {
        await actualizarCriterio(criterioId, aCampos(filas[0]))
        navigate(volver, { state: { toast: 'Se guardó información con éxito', abrir: criterioId } })
      } else {
        const primero = await crearCriterios(elemento, filas.map(aCampos), user.correo)
        navigate(volver, { state: { toast: filas.length > 1 ? 'Se agregaron los criterios con éxito' : 'Se agregó el criterio con éxito', abrir: primero } })
      }
    } catch (err) {
      setGuardando(false)
      toast(err instanceof Error ? `Error al guardar: ${err.message}` : 'Error al guardar.', 'error')
    }
  }

  return (
    <div className="page" style={{ paddingBottom: 90 }}>
      <Breadcrumbs
        items={[
          { label: 'Cursos', to: '/cursos' },
          { label: ctx.nombre, to: `/cursos/${ctx.id}` },
          { label: 'Rúbrica', to: volver },
          { label: editando ? 'Editar criterio' : 'Agregar criterio' },
        ]}
      />
      <h1 style={{ fontSize: 28, fontWeight: 700 }}>{editando ? 'Editar criterio' : 'Agregar criterio'}</h1>
      <CursoHeader titulo={elemento.nombre} curso={ctx.nombre} tipoEnsenanza={ctx.tipoEnsenanza} programas={ctx.programas} />

      {!editando && existentes.length > 0 && (
        <ResumenExistentes existentes={existentes} nuevos={filas} />
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filas.map((f, i) => (
          <FilaCriterio
            key={i}
            numero={editando ? Number(existentes.find(c => c.dpl_rubricacriterioid === criterioId)?.dpl_orden ?? i + 1) : existentes.length + i + 1}
            fila={f}
            errores={intento ? errores[i] : {}}
            onChange={(k, v) => setCampo(i, k, v)}
            onEliminar={filas.length > 1 ? () => setFilas(prev => prev.filter((_, j) => j !== i)) : undefined}
          />
        ))}
      </div>

      {!editando && (
        <button className="link-btn" style={{ alignSelf: 'flex-start', fontSize: 14, padding: '8px 10px' }} onClick={() => setFilas(prev => [...prev, { ...VACIA }])}>
          <Icon name="plus" size={18} strokeWidth={2} />Agregar otro criterio
        </button>
      )}

      <div className="form-footer">
        <button className="btn btn-outline" style={{ height: 44, padding: '0 24px' }} onClick={() => (sucio ? setConfirmarCancelar(true) : navigate(volver))}>
          Cancelar
        </button>
        <button className="btn btn-primary" style={{ height: 44, padding: '0 28px' }} onClick={guardar}>Guardar</button>
      </div>

      <Modal
        open={confirmarCancelar}
        title={editando ? '¿Cancelar edición del criterio?' : '¿Cancelar creación de criterios?'}
        onClose={() => setConfirmarCancelar(false)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setConfirmarCancelar(false)}>No, continuar</button>
            <button className="btn btn-primary" onClick={() => navigate(volver)}>Sí, cancelar</button>
          </>
        }
      />
      <SavingOverlay show={guardando} />
    </div>
  )
}

interface FilaProps {
  numero: number
  fila: Fila
  errores: Partial<Record<keyof CriterioCampos, string>>
  onChange: (k: keyof CriterioCampos, v: string) => void
  onEliminar?: () => void
}

function FilaCriterio({ numero, fila, errores, onChange, onEliminar }: FilaProps) {
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
                      type="number"
                      min={0}
                      step="0.5"
                      inputMode="decimal"
                      placeholder="Ingresar puntaje"
                      value={fila[n.puntaje]}
                      onChange={e => onChange(n.puntaje, e.target.value)}
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

/** Existing criteria of the element and how the new ones move the 20-point total. */
function ResumenExistentes({ existentes, nuevos }: { existentes: CriterioRow[]; nuevos: Fila[] }) {
  const actual = totalEstandar(existentes)
  const sumaNuevos = nuevos.reduce((s, f) => s + (Number(f.dpl_puntajeestandar) || 0), 0)
  const total = actual + sumaNuevos
  const falta = PUNTAJE_OBJETIVO - total
  return (
    <div className="panel" style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10, border: '1px solid var(--color-border)' }}>
      <div className="row-between" style={{ flexWrap: 'wrap' }}>
        <span style={{ fontSize: 14, fontWeight: 700 }}>
          Este elemento ya tiene {existentes.length} {existentes.length === 1 ? 'criterio' : 'criterios'}; los nuevos se agregan desde el N°{existentes.length + 1}.
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
          Estándar esperado: <span className="chip chip-pt">{total} de {PUNTAJE_OBJETIVO} pt</span>
          <span style={{ fontSize: 13, fontWeight: 700, color: falta === 0 ? 'var(--color-success)' : falta < 0 ? 'var(--color-danger)' : 'var(--color-warning)' }}>
            {falta === 0 ? '¡Completo!' : falta > 0 ? `Faltan ${falta} pt` : `Te pasaste por ${-falta} pt`}
          </span>
        </span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {existentes.map(c => (
          <span key={c.dpl_rubricacriterioid} className="persona-chip" style={{ fontSize: 13 }}>
            N°{c.dpl_orden} · {c.dpl_criterio || 'Sin nombre'} · {Number(c.dpl_puntajeestandar ?? 0)} pt
          </span>
        ))}
      </div>
    </div>
  )
}
