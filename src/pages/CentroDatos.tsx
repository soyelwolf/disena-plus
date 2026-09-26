import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Icon from '../components/Icon'
import TextoEnriquecido from '../components/TextoEnriquecido'
import VisorPdf from '../components/VisorPdf'
import {
  DOCUMENTOS,
  listarDocumentos,
  nombreDescarga,
  quitarDocumento,
  subirDocumento,
  type DocumentoCurso,
  type TipoDocumento,
} from '../shared/documentosCurso'
import { esHtml, textoPlano } from '../shared/textoRico'
import { Cargando, Drawer, ErrorPanel, Modal, useToast } from '../components/ui'
import { ROLE_LABELS, type UserRole } from '../shared/AuthContext'
import { capitalizar, cambiarAsignacion, guardarUsuario, listarUsuarios, type Asignacion, type UsuarioAdmin } from '../shared/academico'
import {
  GRUPOS,
  REFERENCIAS,
  TABLAS,
  actualizarCelda,
  cargarRelaciones,
  codigoReferencia,
  codigosRef,
  insertarFilas,
  actualizarDestino,
  type DestinoContexto,
  cargarTabla,
  CONTEXTO,
  columnasVisibles,
  descargarCsv,
  eliminarFila,
  etiquetaColumna,
  opcionesReferencia,
  REFERENCIAS_EDITABLES,
  type Relaciones,
  type TablaConfig,
} from '../shared/centroDatos'

const USUARIOS = '__usuarios__'

export default function CentroDatos() {
  const [vista, setVista] = useState<string>(USUARIOS)
  const [menuContraido, setMenuContraido] = useState<boolean>(() => {
    try {
      return localStorage.getItem('disena.datos.menu') === 'contraido'
    } catch {
      return false
    }
  })
  const alternarMenu = () =>
    setMenuContraido(v => {
      try {
        localStorage.setItem('disena.datos.menu', v ? 'abierto' : 'contraido')
      } catch {
        // Only a convenience — fine if storage is unavailable.
      }
      return !v
    })
  const actual = vista === USUARIOS ? 'Usuarios' : TABLAS.find(t => t.tabla === vista)?.titulo
  const carpetaDe = (v: string) => TABLAS.find(t => t.tabla === v)?.grupo
  // Folders like the SharePoint site navigation: open on demand, the current one always open.
  const [abiertas, setAbiertas] = useState<Set<string>>(() => new Set(['Cursos']))
  const alternarCarpeta = (g: string) =>
    setAbiertas(prev => {
      const next = new Set(prev)
      if (next.has(g)) next.delete(g)
      else next.add(g)
      return next
    })
  useEffect(() => {
    const g = carpetaDe(vista)
    if (g) setAbiertas(prev => (prev.has(g) ? prev : new Set([...prev, g])))
  }, [vista])
  useEffect(() => {
    document.title = 'Centro de datos — Diseña+'
  }, [])
  const cfg = TABLAS.find(t => t.tabla === vista)

  return (
    <div className="page">
      <div className="row-between">
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700 }}>Centro de datos</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: 4 }}>
            Todas las listas de Diseña+ en un solo lugar: consulta, corrige y descarga la información.
          </p>
        </div>
      </div>
      <div className="datos-layout">
        {menuContraido ? (
          <nav className="datos-menu datos-menu-contraido" aria-label="Listas">
            <button className="icon-btn" aria-label="Mostrar listas" title="Mostrar listas" onClick={alternarMenu}>
              <Icon name="chevronRight" size={20} strokeWidth={2} />
            </button>
            <span className="datos-vertical" title={actual}>{actual}</span>
          </nav>
        ) : (
        <nav className="datos-menu" aria-label="Listas">
          <button className="datos-contraer" onClick={alternarMenu} aria-label="Ocultar listas" title="Ocultar listas para ganar espacio">
            <Icon name="chevronLeft" size={16} strokeWidth={2} />Ocultar
          </button>
          <button className={`datos-item${vista === USUARIOS ? ' active' : ''}`} onClick={() => setVista(USUARIOS)}>
            <span>Usuarios</span>
            <small>Personas con acceso a Diseña+</small>
          </button>
          {GRUPOS.map(g => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column' }}>
              <button
                className={`datos-carpeta${carpetaDe(vista) === g ? ' actual' : ''}`}
                aria-expanded={abiertas.has(g)}
                onClick={() => alternarCarpeta(g)}
              >
                <Icon name={abiertas.has(g) ? 'chevronDown' : 'chevronRight'} size={15} strokeWidth={2.2} />
                <span style={{ flex: 1 }}>{g}</span>
                <small>{TABLAS.filter(t => t.grupo === g).length}</small>
              </button>
              {abiertas.has(g) && TABLAS.filter(t => t.grupo === g).map(t => (
                <button key={t.tabla} className={`datos-item${vista === t.tabla ? ' active' : ''}`} onClick={() => setVista(t.tabla)}>
                  <span>{t.titulo}</span>
                  <small>{t.descripcion}</small>
                </button>
              ))}
            </div>
          ))}
        </nav>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          {vista === USUARIOS ? (
            <UsuariosPanel />
          ) : cfg?.tabla === 'dpl_curso' ? (
            <ListadoCursosEditor key={cfg.tabla} cfg={cfg} />
          ) : (
            cfg && <TablaEditor key={cfg.tabla} cfg={cfg} />
          )}
        </div>
      </div>
    </div>
  )
}

// ── Generic table editor ─────────────────────────────────────────────────────

/** What is about to be deleted: course (with its modality, as there are courses with the same name), unit and element. */
function DetalleBorrado({ fila, cfg, rel, etiquetaFila }: { fila: Record<string, unknown>; cfg: TablaConfig; rel: Relaciones | null; etiquetaFila: string }) {
  const c = rel?.contextoDe(fila)
  const curso = c?.curso
  const n = (v: unknown) => (v === null || v === undefined ? '' : String(v))
  const datos: Array<[string, string]> = [
    ['Lista', cfg.titulo],
    ['Curso', curso ? [n(curso.dpl_idcursotext), capitalizar(n(curso.dpl_nombrecurso))].filter(Boolean).join(' · ') : ''],
    ['Modalidad', n(curso?.dpl_tipoensenanza)],
    ['Unidad', c?.unidad ? [n(c.unidad.dpl_idunidadtext), capitalizar(n(c.unidad.dpl_nombreunidad))].filter(Boolean).join(' · ') : ''],
    ['Elemento', c?.sesion ? [n(c.sesion.dpl_idsesiontext), capitalizar(n(c.sesion.dpl_elemento))].filter(Boolean).join(' · ') : ''],
    ['N°', n(fila.dpl_orden)],
    ['Registro', etiquetaFila && etiquetaFila !== n(curso?.dpl_nombrecurso) ? etiquetaFila : ''],
  ]
  const dependientes = c?.criterios.length ? `${c.criterios.length} criterios` : c?.indicadores.length ? `${c.indicadores.length} indicadores` : ''
  return (
    <div className="borrar-detalle">
      {datos.filter(([, v]) => v).map(([k, v]) => (
        <span key={k}><b>{k}:</b> {v}</span>
      ))}
      {dependientes && <span className="borrar-dependientes"><Icon name="alert" size={14} />También se eliminarán sus {dependientes}.</span>}
    </div>
  )
}

const PAGINA = 200

/** Columns written with the rich text editor in the app — edited the same way here. */
const COLUMNAS_RICAS = new Set([
  'dpl_indicaciongeneral', 'dpl_indicacionesespecificas', 'dpl_recomendaciones', 'dpl_anexo',
  'dpl_definicioncriterio', 'dpl_estandaresperado', 'dpl_enproceso2', 'dpl_enproceso1', 'dpl_inicial',
])

/** A computed column shown alongside the table's own ones (e.g. assigned people). */
interface ColumnaExtra {
  key: string
  label: string
  /** Insert right after this real column (default: at the start). */
  despuesDe?: string
  texto: (fila: Record<string, unknown>) => string
  render: (fila: Record<string, unknown>) => React.ReactNode
}

const ID_CURSO_VIRTUAL = '__id_curso__'

/**
 * Cells copied from Excel come as tab-separated text: one line per row, a tab
 * between cells, and cells with line breaks or quotes wrapped in "…" ("" = ").
 */
function parsearPegado(texto: string): string[][] {
  const filas: string[][] = [[]]
  let celda = ''
  let comillas = false
  const t = texto.replace(/\r\n?/g, '\n')
  for (let i = 0; i < t.length; i++) {
    const ch = t[i]
    if (comillas) {
      if (ch === '"' && t[i + 1] === '"') {
        celda += '"'
        i++
      } else if (ch === '"') comillas = false
      else celda += ch
    } else if (ch === '"' && celda === '') comillas = true
    else if (ch === '\t') {
      filas[filas.length - 1].push(celda)
      celda = ''
    } else if (ch === '\n') {
      filas[filas.length - 1].push(celda)
      celda = ''
      filas.push([])
    } else celda += ch
  }
  filas[filas.length - 1].push(celda)
  // Excel ends the copy with a line break: drop that last empty row.
  const ultima = filas[filas.length - 1]
  if (filas.length > 1 && ultima.length === 1 && ultima[0] === '') filas.pop()
  return filas
}

function TablaEditor({ cfg, extras = [], version = 0 }: { cfg: TablaConfig; extras?: ColumnaExtra[]; version?: number }) {
  const toast = useToast()
  const [filas, setFilas] = useState<Array<Record<string, unknown>> | null>(null)
  const [existe, setExiste] = useState(true)
  const [nombres, setNombres] = useState<Map<string, string>>(new Map())
  const [rel, setRel] = useState<Relaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [filtros, setFiltros] = useState<Record<string, Set<string>>>({})
  const [filtroAbierto, setFiltroAbierto] = useState<string | null>(null)
  const [limite, setLimite] = useState(PAGINA)
  const [edicion, setEdicion] = useState<{ fila: Record<string, unknown>; col: string; valor: string } | null>(null)
  const [estadoPanel, setEstadoPanel] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle')
  const timerPanel = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendientePanel = useRef<{ fila: Record<string, unknown>; col: string; valor: string } | null>(null)
  const [borrar, setBorrar] = useState<Record<string, unknown> | null>(null)
  // Row selection, to delete several rows at once (like selecting rows in Excel).
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set())
  const [borrarVarias, setBorrarVarias] = useState(false)
  const [borrando, setBorrando] = useState(false)
  const ultimaMarcada = useRef<number | null>(null)
  const conShiftRef = useRef(false)
  const abrirBorrarVarias = useRef<() => void>(() => {})
  useEffect(() => {
    // Supr / Delete with rows selected (outside a cell being typed in) asks to delete them.
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== 'Delete' || (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable))) return
      abrirBorrarVarias.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  // Paste that goes past the last row: confirm before creating new rows.
  const [pegadoPendiente, setPegadoPendiente] = useState<{ cambios: Array<{ id: string; col: string; v: unknown; destino?: DestinoContexto }>; nuevas: Array<Record<string, unknown>>; omitidas: number } | null>(null)
  const [agregando, setAgregando] = useState(false)
  const opcionesRef = useRef(new Map<string, Array<{ id: string; nombre: string; fila: Record<string, unknown> }>>())
  const [referencia, setReferencia] = useState<{ fila: Record<string, unknown>; col: string } | null>(null)
  const [opcion, setOpcion] = useState<{ fila: Record<string, unknown>; col: string; opciones: string[] } | null>(null)
  // Excel-like editing: the cell being typed in, right inside the table.
  const [enCelda, setEnCelda] = useState<{ id: string; col: string; valor: string } | null>(null)
  // Column widths chosen by dragging the header edge (remembered per list in this browser).
  const claveAnchos = `disena.datos.anchos.${cfg.tabla}`
  const [anchos, setAnchos] = useState<Record<string, number>>(() => {
    try {
      return JSON.parse(localStorage.getItem(claveAnchos) ?? '{}') as Record<string, number>
    } catch {
      return {}
    }
  })
  const guardarAnchos = (nuevos: Record<string, number>) => {
    setAnchos(nuevos)
    try {
      localStorage.setItem(claveAnchos, JSON.stringify(nuevos))
    } catch {
      // Storage blocked: the width just isn't remembered.
    }
  }
  const empezarRedimension = (e: React.MouseEvent, col: string) => {
    e.preventDefault()
    e.stopPropagation()
    const th = (e.currentTarget as HTMLElement).parentElement!
    const inicioX = e.clientX
    const inicioAncho = th.getBoundingClientRect().width
    let actual = inicioAncho
    const mover = (ev: MouseEvent) => {
      actual = Math.max(70, Math.min(900, Math.round(inicioAncho + ev.clientX - inicioX)))
      setAnchos(prev => ({ ...prev, [col]: actual }))
    }
    const soltar = () => {
      document.removeEventListener('mousemove', mover)
      document.removeEventListener('mouseup', soltar)
      document.body.classList.remove('redimensionando')
      redimensionandoRef.current = false
      setAnchos(prev => {
        const nuevos = { ...prev, [col]: actual }
        try {
          localStorage.setItem(claveAnchos, JSON.stringify(nuevos))
        } catch {
          // Storage blocked.
        }
        return nuevos
      })
    }
    redimensionandoRef.current = true
    document.body.classList.add('redimensionando')
    document.addEventListener('mousemove', mover)
    document.addEventListener('mouseup', soltar)
  }
  const cerrandoCelda = useRef(false)
  // Undo: every edit or paste is saved at once, so keep what each cell had before (last 30 changes).
  const [historial, setHistorial] = useState<Array<{ descripcion: string; antes: Array<{ id: string; col: string; v: unknown; destino?: DestinoContexto }> }>>([])
  const deshacerRef = useRef<() => void>(() => {})
  useEffect(() => {
    // Ctrl+Z outside a cell being typed in (inside it, the browser's own undo works on the text).
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== 'z' || e.shiftKey) return
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      e.preventDefault()
      deshacerRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [t, r] = await Promise.all([cargarTabla(cfg), cargarRelaciones(cfg)])
      setExiste(t.existe)
      setFilas(t.filas)
      setNombres(r.nombres)
      setRel(r)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [cfg])
  useEffect(() => {
    cargar()
  }, [cargar])

  // Every list starts with the course it belongs to (ID_CURSO), like in SharePoint.
  // Column order chosen by dragging headers (remembered per list in this browser).
  const claveOrden = `disena.datos.orden.${cfg.tabla}`
  const [ordenPropio, setOrdenPropio] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem(claveOrden) ?? '[]') as string[]
    } catch {
      return []
    }
  })
  const guardarOrden = (orden: string[]) => {
    setOrdenPropio(orden)
    try {
      if (orden.length) localStorage.setItem(claveOrden, JSON.stringify(orden))
      else localStorage.removeItem(claveOrden)
    } catch {
      // Storage blocked: the order just isn't remembered.
    }
  }
  const [arrastrando, setArrastrando] = useState<string | null>(null)
  const [soltarEn, setSoltarEn] = useState<string | null>(null)
  const redimensionandoRef = useRef(false)

  const conCurso = cfg.tabla !== 'dpl_curso' && !cfg.referenciasEditables?.includes('dpl_cursoid') && !!filas?.some(f => rel?.cursoDe(f))
  const columnas = useMemo(() => {
    if (!filas) return []
    const base = columnasVisibles(filas, cfg)
    const claves = new Set([...base, ...extras.map(e => e.key)])
    const orden: string[] = conCurso ? [ID_CURSO_VIRTUAL] : []
    // Extras chain after a real column or after another extra ("despuesDe").
    const poner = (k: string) => {
      orden.push(k)
      extras.filter(e => e.despuesDe === k).forEach(e => poner(e.key))
    }
    extras.filter(e => !e.despuesDe || !claves.has(e.despuesDe)).forEach(e => poner(e.key))
    base.forEach(poner)
    if (!ordenPropio.length) return orden
    const pos = new Map(ordenPropio.map((c, i) => [c, i]))
    return [...orden].sort((a, b) => (pos.get(a) ?? 10000 + orden.indexOf(a)) - (pos.get(b) ?? 10000 + orden.indexOf(b)))
  }, [filas, cfg, extras, conCurso, ordenPropio])
  const extraPorKey = useMemo(() => new Map(extras.map(e => [e.key, e])), [extras])
  const texto = useCallback(
    (f: Record<string, unknown>, c: string): string => {
      if (c === ID_CURSO_VIRTUAL) {
        const id = rel?.cursoDe(f)
        return id ? rel?.cursoTexto.get(id) ?? '' : ''
      }
      if (c === 'ctx_instrumentotexto') return String(f.dpl_instrumento ?? '')
      if (CONTEXTO[c]) {
        const v = rel ? CONTEXTO[c].valor(rel.contextoDe(f)) : null
        if (v === null || v === undefined) return ''
        if (typeof v === 'boolean') return v ? 'Sí' : 'No'
        return typeof v === 'string' && esHtml(v) ? textoPlano(v) : String(v)
      }
      const extra = extraPorKey.get(c)
      if (extra) return extra.texto(f)
      const v = f[c]
      if (v === null || v === undefined) return ''
      if (REFERENCIAS[c] && typeof v === 'string') return ((cfg.referenciasEditables?.includes(c) || cfg.codigos?.includes(c)) && codigosRef.get(v)) || nombres.get(v) || v
      if (typeof v === 'boolean') return v ? 'Sí' : 'No'
      if (Array.isArray(v)) return v.join(', ')
      return typeof v === 'string' && esHtml(v) ? textoPlano(v) : String(v)
    },
    [nombres, rel, extraPorKey],
  )
  const etiqueta = (c: string) =>
    c === ID_CURSO_VIRTUAL ? cfg.etiquetas?.[ID_CURSO_VIRTUAL] ?? 'ID_CURSO' : (CONTEXTO[c] && cfg.etiquetas?.[c]) || CONTEXTO[c]?.etiqueta || (extraPorKey.get(c)?.label ?? etiquetaColumna(c, cfg))

  useEffect(() => {
    // Re-read when the parent signals its extra columns changed (e.g. assignments saved).
    if (version) cargar()
  }, [version, cargar])
  const filtradas = useMemo(() => {
    if (!filas) return []
    const q = busqueda.trim().toLowerCase()
    const activos = Object.entries(filtros).filter(([, v]) => v.size > 0)
    return filas.filter(
      f =>
        // Column filters match exact values (C7 ≠ C71), like SharePoint's column filter.
        activos.every(([c, valores]) => valores.has(valorFiltro(texto(f, c)))) &&
        (!q || columnas.some(c => texto(f, c).toLowerCase().includes(q))),
    )
  }, [filas, busqueda, columnas, texto, filtros])
  const hayFiltros = Object.values(filtros).some(v => v.size > 0)

  if (error) return <ErrorPanel mensaje={error} onRetry={cargar} />
  if (!filas) return <Cargando texto="Cargando tabla" />
  if (!existe)
    return (
      <div className="panel" style={{ padding: 32 }}>
        Esta lista aún no existe. Ejecuta <b>{cfg.script ?? 'supabase/schema-flujo.sql'}</b> en el SQL Editor de Supabase.
      </div>
    )

  // ── Text panel (formatted or long texts): saved automatically, like the rest of Diseña+ ──
  const guardarTexto = async (fila: Record<string, unknown>, col: string, valor: string): Promise<boolean> => {
    const original = fila[col]
    const nuevo = typeof original === 'number' ? (valor.trim() === '' ? null : Number(valor)) : valor
    if (typeof original === 'number' && nuevo !== null && Number.isNaN(nuevo)) {
      setEstadoPanel('error')
      toast('Ingresa un número válido.', 'error')
      return false
    }
    setEstadoPanel('guardando')
    try {
      await actualizarCelda(cfg, fila[cfg.pk] as string, col, nuevo)
      setFilas(prev => prev && prev.map(f => (f[cfg.pk] === fila[cfg.pk] ? { ...f, [col]: nuevo } : f)))
      setEstadoPanel('guardado')
      return true
    } catch (err) {
      setEstadoPanel('error')
      toast(err instanceof Error ? `No se guardó: ${err.message}` : 'No se guardó.', 'error')
      return false
    }
  }
  const escribirPanel = (valor: string) => {
    if (!edicion) return
    setEdicion({ ...edicion, valor })
    pendientePanel.current = { fila: edicion.fila, col: edicion.col, valor }
    setEstadoPanel('guardando')
    clearTimeout(timerPanel.current)
    timerPanel.current = setTimeout(() => {
      const p = pendientePanel.current
      pendientePanel.current = null
      if (p) void guardarTexto(p.fila, p.col, p.valor)
    }, 900)
  }
  /** Save what is pending and leave one "Deshacer" step for everything written in this cell. */
  const terminarPanel = async (): Promise<boolean> => {
    if (!edicion) return true
    clearTimeout(timerPanel.current)
    const p = pendientePanel.current
    pendientePanel.current = null
    if (p && !(await guardarTexto(p.fila, p.col, p.valor))) return false
    const original = edicion.fila[edicion.col]
    const antes = original === null || original === undefined ? '' : String(original)
    if (edicion.valor !== antes)
      setHistorial(h => [...h.slice(-29), { descripcion: `${etiqueta(edicion.col)} de ${texto(edicion.fila, cfg.etiqueta ?? cfg.pk) || 'una fila'}`, antes: [{ id: edicion.fila[cfg.pk] as string, col: edicion.col, v: original ?? null }] }])
    return true
  }
  const abrirPanel = (f: Record<string, unknown>, c: string) => {
    const v = f[c]
    setEstadoPanel('idle')
    setEdicion({ fila: f, col: c, valor: v === null || v === undefined ? '' : String(v) })
  }
  const cerrarPanel = async () => {
    if (await terminarPanel()) setEdicion(null)
  }
  /** Previous / next row, same column, without closing the panel. */
  const moverPanel = async (dir: 1 | -1) => {
    if (!edicion) return
    const i = visibles.findIndex(f => f[cfg.pk] === edicion.fila[cfg.pk])
    const destino = visibles[i + dir]
    if (!destino || !(await terminarPanel())) return
    abrirPanel(filas.find(f => f[cfg.pk] === destino[cfg.pk]) ?? destino, edicion.col)
  }

  const guardarOpcion = async (valor: string | null) => {
    if (!opcion) return
    const { fila, col } = opcion
    try {
      await actualizarCelda(cfg, fila[cfg.pk] as string, col, valor)
      setFilas(prev => prev && prev.map(f => (f[cfg.pk] === fila[cfg.pk] ? { ...f, [col]: valor } : f)))
      setOpcion(null)
      toast('Se guardó información con éxito')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
    }
  }

  const alternar = async (fila: Record<string, unknown>, col: string) => {
    const nuevo = !fila[col]
    try {
      await actualizarCelda(cfg, fila[cfg.pk] as string, col, nuevo)
      setFilas(prev => prev && prev.map(f => (f[cfg.pk] === fila[cfg.pk] ? { ...f, [col]: nuevo } : f)))
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
    }
  }

  const confirmarBorrar = async () => {
    if (!borrar) return
    try {
      await eliminarFila(cfg, borrar[cfg.pk] as string)
      setFilas(prev => prev && prev.filter(f => f[cfg.pk] !== borrar[cfg.pk]))
      toast('Se eliminó el registro')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo eliminar.', 'error')
    } finally {
      setBorrar(null)
    }
  }

  // ── Several rows ──
  const puedeSeleccionar = !cfg.soloLecturaTabla
  const marcarFila = (i: number, id: string, conShift: boolean) => {
    // Read the anchor now: the state updater runs later, after it is moved to this row.
    const ancla = ultimaMarcada.current
    const ids = visiblesSel.map(f => f[cfg.pk] as string)
    setSeleccion(prev => {
      const nueva = new Set(prev)
      const marcar = !prev.has(id)
      if (conShift && ancla !== null) {
        // Shift+click: the whole range between the last clicked row and this one.
        const [a, b] = [Math.min(ancla, i), Math.max(ancla, i)]
        for (let k = a; k <= b; k++) {
          const fid = ids[k]
          if (fid) (marcar ? nueva.add(fid) : nueva.delete(fid))
        }
      } else if (marcar) nueva.add(id)
      else nueva.delete(id)
      return nueva
    })
    ultimaMarcada.current = i
  }
  const seleccionadas = filas.filter(f => seleccion.has(f[cfg.pk] as string))
  abrirBorrarVarias.current = () => {
    if (seleccionadas.length && !borrarVarias) setBorrarVarias(true)
  }
  /** "C14 · Filosofía de la educación · Presencial · U56 · Participación en clase" to recognise a row before deleting it. */
  const resumenFila = (f: Record<string, unknown>): string => {
    const c = rel?.contextoDe(f)
    const partes = [
      c?.curso?.dpl_idcursotext,
      c?.curso?.dpl_nombrecurso ? capitalizar(String(c.curso.dpl_nombrecurso)) : null,
      c?.curso?.dpl_tipoensenanza,
      c?.unidad?.dpl_idunidadtext,
      c?.sesion?.dpl_elemento ? capitalizar(String(c.sesion.dpl_elemento)) : null,
      cfg.etiqueta && f[cfg.etiqueta] && f[cfg.etiqueta] !== c?.curso?.dpl_nombrecurso ? texto(f, cfg.etiqueta) : null,
      f.dpl_orden ? `N°${f.dpl_orden}` : null,
    ].filter(Boolean)
    return partes.length ? partes.join(' · ') : 'Fila vacía'
  }
  const confirmarBorrarVarias = async () => {
    setBorrando(true)
    let ok = 0
    const fallidas: string[] = []
    for (const f of seleccionadas) {
      try {
        await eliminarFila(cfg, f[cfg.pk] as string)
        ok++
      } catch {
        fallidas.push(f[cfg.pk] as string)
      }
    }
    const borradas = new Set(seleccionadas.map(f => f[cfg.pk] as string).filter(id => !fallidas.includes(id)))
    setFilas(prev => prev && prev.filter(f => !borradas.has(f[cfg.pk] as string)))
    setSeleccion(new Set(fallidas))
    setBorrando(false)
    setBorrarVarias(false)
    toast(fallidas.length ? `Se eliminaron ${ok}; ${fallidas.length} no se pudieron eliminar (siguen marcadas).` : `Se ${ok === 1 ? 'eliminó 1 registro' : `eliminaron ${ok} registros`}`, fallidas.length ? 'error' : 'ok')
  }

  // ── Excel-like editing ──
  const visibles = filtradas.slice(0, limite)
  const visiblesSel = visibles
  const posPanel = edicion ? visibles.findIndex(f => f[cfg.pk] === edicion.fila[cfg.pk]) : -1
  /** Plain text / number cells are typed in place; the rest keep their picker or editor. */
  /** Record and column a context cell comes from (null = read only). */
  const destinoDe = (f: Record<string, unknown>, c: string): DestinoContexto | null =>
    CONTEXTO[c]?.destino && rel ? CONTEXTO[c].destino!(rel.contextoDe(f)) : null
  /** Raw value of a cell (context columns included). */
  const valorCrudo = (f: Record<string, unknown>, c: string): unknown => (CONTEXTO[c] ? (rel ? CONTEXTO[c].valor(rel.contextoDe(f)) : null) : f[c])
  const editableEnCelda = (f: Record<string, unknown>, c: string): boolean => {
    if (CONTEXTO[c]) {
      const d = destinoDe(f, c)
      const v = valorCrudo(f, c)
      return !cfg.soloLecturaTabla && !!d && !COLUMNAS_RICAS.has(d.col) && typeof v !== 'boolean' && !(typeof v === 'string' && esHtml(v))
    }
    if (cfg.soloLecturaTabla || extraPorKey.has(c) || c === ID_CURSO_VIRTUAL || COLUMNAS_RICAS.has(c)) return false
    if (cfg.opciones?.[c] || REFERENCIAS_EDITABLES.has(c) || REFERENCIAS[c] || cfg.soloLectura?.includes(c)) return false
    const v = f[c]
    return typeof v !== 'boolean' && !Array.isArray(v) && !(typeof v === 'object' && v !== null)
  }
  /** Value to store: numbers stay numbers, empty means blank (null). */
  const convertir = (c: string, valor: string): { ok: true; v: unknown } | { ok: false } => {
    const t = valor.trim()
    if (t === '') return { ok: true, v: null }
    if (!filas.slice(0, 200).some(x => typeof valorCrudo(x, c) === 'number')) return { ok: true, v: valor }
    const n = Number(t.replace(',', '.'))
    return Number.isNaN(n) ? { ok: false } : { ok: true, v: n }
  }
  const guardarCeldas = async (cambios: Array<{ id: string; col: string; v: unknown; destino?: DestinoContexto }>, descripcion?: string) => {
    if (!cambios.length) return
    // What each cell had before, for "Deshacer".
    const antes = cambios.map(k => {
      const fila = filas.find(f => f[cfg.pk] === k.id)
      return { ...k, v: fila ? valorCrudo(fila, k.col) ?? null : null }
    })
    try {
      const nuevos = cambios.filter(k => k.destino?.crear && !k.destino.id)
      const directos = cambios.filter(k => !nuevos.includes(k))
      for (let i = 0; i < directos.length; i += 10)
        await Promise.all(directos.slice(i, i + 10).map(k => (k.destino ? actualizarDestino(k.destino, k.v) : actualizarCelda(cfg, k.id, k.col, k.v))))
      for (const k of nuevos) await actualizarDestino(k.destino!, k.v)
      const propios = cambios.filter(k => !k.destino)
      const porFila = new Map<string, Record<string, unknown>>()
      for (const k of propios) porFila.set(k.id, { ...(porFila.get(k.id) ?? {}), [k.col]: k.v })
      setFilas(prev => prev && prev.map(f => (porFila.has(f[cfg.pk] as string) ? { ...f, ...porFila.get(f[cfg.pk] as string) } : f)))
      // Values saved in their own list (course, unit…): reload them so every row shows the change.
      const destinos = cambios.filter(k => k.destino)
      if (destinos.length) {
        const r = await cargarRelaciones(cfg)
        setRel(r)
        setNombres(r.nombres)
        const listas = [...new Set(destinos.map(k => TABLAS.find(t => t.tabla === k.destino!.tabla)?.titulo ?? k.destino!.tabla))]
        toast(`Se guardó en ${listas.join(', ')}: se actualiza en todas las filas que lo muestran.`)
      }
      if (descripcion) setHistorial(h => [...h.slice(-29), { descripcion, antes }])
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
      cargar()
    }
  }
  const deshacer = async () => {
    const ultimo = historial[historial.length - 1]
    if (!ultimo) return toast('No hay cambios para deshacer.')
    setHistorial(h => h.slice(0, -1))
    await guardarCeldas(ultimo.antes)
    toast(`Se deshizo: ${ultimo.descripcion}`)
  }
  deshacerRef.current = () => void deshacer()
  const abrirCelda = (f: Record<string, unknown>, c: string) => {
    const v = valorCrudo(f, c)
    cerrandoCelda.current = false
    setEnCelda({ id: f[cfg.pk] as string, col: c, valor: v === null || v === undefined ? '' : String(v) })
  }
  /** Next editable cell: down (Enter), right (Tab) or left (Shift+Tab). */
  const vecina = (id: string, col: string, dir: 'abajo' | 'derecha' | 'izquierda') => {
    const fi = visibles.findIndex(f => f[cfg.pk] === id)
    if (fi < 0) return null
    if (dir === 'abajo') {
      for (let i = fi + 1; i < visibles.length; i++) if (editableEnCelda(visibles[i], col)) return { f: visibles[i], c: col }
      return null
    }
    const paso = dir === 'derecha' ? 1 : -1
    for (let j = columnas.indexOf(col) + paso; j >= 0 && j < columnas.length; j += paso)
      if (editableEnCelda(visibles[fi], columnas[j])) return { f: visibles[fi], c: columnas[j] }
    return null
  }
  const cerrarCelda = async (guardar: boolean, mover?: 'abajo' | 'derecha' | 'izquierda') => {
    if (!enCelda || cerrandoCelda.current) return
    cerrandoCelda.current = true
    const { id, col, valor } = enCelda
    const fila = filas.find(f => f[cfg.pk] === id)
    const siguiente = mover ? vecina(id, col, mover) : null
    setEnCelda(null)
    if (guardar && fila) {
      const crudo = valorCrudo(fila, col)
      const actual = crudo === null || crudo === undefined ? '' : String(crudo)
      if (valor !== actual) {
        const r = convertir(col, valor)
        const destino = destinoDe(fila, col) ?? undefined
        if (!r.ok) toast(`«${valor}» no es un número: ${etiqueta(col)} no se cambió.`, 'error')
        else await guardarCeldas([{ id, col, v: r.v, destino }], `${etiqueta(col)} de ${texto(fila, cfg.etiqueta ?? cfg.pk) || 'una fila'}`)
      }
    }
    if (siguiente) abrirCelda(siguiente.f, siguiente.c)
  }
  const esReferenciaEditable = (c: string) => !!cfg.referenciasEditables?.includes(c)
  /** Pasted text in a lookup column: its code (C14, U69, S313…) or its exact name; ambiguous names are skipped. */
  const resolverReferencia = async (c: string, valor: string): Promise<{ ok: true; v: string | null } | { ok: false }> => {
    const t = valor.trim().toLowerCase()
    if (!t) return { ok: true, v: null }
    if (!opcionesRef.current.has(c)) opcionesRef.current.set(c, await opcionesReferencia(c).catch(() => []))
    const ops = opcionesRef.current.get(c)!
    const porCodigo = ops.filter(o => codigoReferencia(o.fila).toLowerCase() === t || o.id === valor.trim())
    const candidatas = porCodigo.length ? porCodigo : ops.filter(o => o.nombre.trim().toLowerCase() === t)
    return candidatas.length === 1 ? { ok: true, v: candidatas[0].id } : { ok: false }
  }
  /** Value of one pasted cell for column c (null = skipped). */
  const valorPegado = async (f: Record<string, unknown> | null, c: string, valor: string): Promise<{ v: unknown; destino?: DestinoContexto } | null> => {
    if (CONTEXTO[c]) {
      if (!f || !editableEnCelda(f, c)) return null
      const r = convertir(c, valor)
      return r.ok ? { v: r.v, destino: destinoDe(f, c) ?? undefined } : null
    }
    if (esReferenciaEditable(c)) {
      const r = await resolverReferencia(c, valor)
      return r.ok ? { v: r.v } : null
    }
    if (!editableEnCelda(f ?? {}, c)) return null
    const r = convertir(c, valor)
    return r.ok ? { v: r.v } : null
  }
  const aplicarPegado = async (p: { cambios: Array<{ id: string; col: string; v: unknown; destino?: DestinoContexto }>; nuevas: Array<Record<string, unknown>>; omitidas: number }) => {
    await guardarCeldas(p.cambios, `pegado de ${p.cambios.length} ${p.cambios.length === 1 ? 'celda' : 'celdas'}`)
    let creadas = 0
    if (p.nuevas.length) {
      try {
        const filasNuevas = await insertarFilas(cfg, p.nuevas)
        creadas = filasNuevas.length
        setFilas(prev => prev && [...prev, ...filasNuevas])
        setLimite(l => Math.max(l, filas.length + filasNuevas.length))
      } catch (err) {
        toast(err instanceof Error ? `No se crearon las filas nuevas: ${err.message}` : 'No se crearon las filas nuevas.', 'error')
      }
    }
    toast(
      `Se pegaron ${p.cambios.length} ${p.cambios.length === 1 ? 'celda' : 'celdas'}` +
        (creadas ? ` y se crearon ${creadas} ${creadas === 1 ? 'fila nueva' : 'filas nuevas'}` : '') +
        (p.omitidas ? ` · ${p.omitidas} no se pegaron (columnas que no se escriben aquí, números inválidos, códigos que no existen o nombres repetidos)` : '') +
        (p.cambios.length ? ' · Ctrl+Z deshace las celdas cambiadas' : ''),
    )
  }
  /** Paste a block copied from Excel starting at this cell (down and to the right); rows past the end become new rows. */
  const pegarBloque = async (textoPegado: string) => {
    if (!enCelda) return
    const bloque = parsearPegado(textoPegado)
    const fi = visibles.findIndex(f => f[cfg.pk] === enCelda.id)
    const ci = columnas.indexOf(enCelda.col)
    const cambios: Array<{ id: string; col: string; v: unknown; destino?: DestinoContexto }> = []
    const nuevas: Array<Record<string, unknown>> = []
    let omitidas = 0
    cerrandoCelda.current = true
    setEnCelda(null)
    for (const [i, filaPegada] of bloque.entries()) {
      const f = visibles[fi + i] ?? null
      if (!f && !cfg.agregar) {
        omitidas += filaPegada.length
        continue
      }
      const nueva: Record<string, unknown> = {}
      for (const [j, valor] of filaPegada.entries()) {
        const c = columnas[ci + j]
        const r = c ? await valorPegado(f, c, valor) : null
        if (!r) {
          omitidas++
          continue
        }
        if (f) cambios.push({ id: f[cfg.pk] as string, col: c, v: r.v, destino: r.destino })
        else if (CONTEXTO[c]) {
          omitidas++
          continue
        }
        else nueva[c] = r.v
      }
      if (!f && Object.values(nueva).some(v => v !== null && v !== '')) nuevas.push(nueva)
    }
    const pendiente = { cambios, nuevas, omitidas }
    if (nuevas.length) setPegadoPendiente(pendiente)
    else await aplicarPegado(pendiente)
  }

  /** "Agregar fila": a new empty row at the end, ready to type in its first cell. */
  const agregarFila = async () => {
    setAgregando(true)
    try {
      const [nueva] = await insertarFilas(cfg, [{}])
      setBusqueda('')
      setFiltros({})
      setFilas(prev => prev && [...prev, nueva])
      setLimite(filas.length + 1)
      setTimeout(() => {
        document.querySelector(`[data-fila="${nueva[cfg.pk]}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        const primera = columnas.find(c => editableEnCelda(nueva, c))
        if (primera) abrirCelda(nueva, primera)
      }, 200)
      toast('Fila agregada al final: escribe sus datos.')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo agregar la fila.', 'error')
    } finally {
      setAgregando(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="panel" style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <label className="field-label" htmlFor="buscar-tabla">{cfg.titulo}</label>
          <div className="input-box">
            <input id="buscar-tabla" type="search" placeholder="Buscar en todas las columnas" value={busqueda} onChange={e => { setBusqueda(e.target.value); setLimite(PAGINA) }} />
            <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Icon name="search" size={20} strokeWidth={2} /></span>
          </div>
        </div>
        <span style={{ fontSize: 14, color: '#3d434a', paddingBottom: 12 }}>{filtradas.length} de {filas.length} registros</span>
        {historial.length > 0 && (
          <button
            className="btn btn-outline"
            style={{ height: 44 }}
            title={`Deshacer: ${historial[historial.length - 1].descripcion} (Ctrl+Z)`}
            onClick={() => void deshacer()}
          >
            <Icon name="chevronLeft" size={16} strokeWidth={2} />Deshacer
          </button>
        )}
        <button
          className="btn btn-outline"
          style={{ height: 44 }}
          onClick={() => descargarCsv(cfg.titulo.replace(/\s+/g, '_').toUpperCase(), columnas, filtradas, texto, etiqueta)}
        >
          <Icon name="download" size={16} />Descargar Excel
        </button>
        {(ordenPropio.length > 0 || Object.keys(anchos).length > 0) && (
          <button
            className="link-btn"
            style={{ fontSize: 13, paddingBottom: 12 }}
            title="Vuelve al orden de columnas de SharePoint y a los anchos normales"
            onClick={() => {
              guardarOrden([])
              guardarAnchos({})
            }}
          >
            Restablecer columnas
          </button>
        )}
      </div>

      {hayFiltros && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>Filtros:</span>
          {Object.entries(filtros)
            .filter(([, v]) => v.size > 0)
            .map(([c, v]) => (
              <span key={c} className="filtro-chip">
                <b>{etiqueta(c)}:</b> {[...v].slice(0, 3).join(', ')}{v.size > 3 ? ` +${v.size - 3}` : ''}
                <button aria-label={`Quitar filtro de ${etiqueta(c)}`} onClick={() => setFiltros(prev => ({ ...prev, [c]: new Set() }))}>
                  <Icon name="close" size={13} strokeWidth={2.4} />
                </button>
              </span>
            ))}
          <button className="link-btn" style={{ fontSize: 13 }} onClick={() => setFiltros({})}>Limpiar filtros</button>
        </div>
      )}
      {seleccion.size > 0 && (
        <div className="seleccion-barra" role="status">
          <b>{seleccion.size} {seleccion.size === 1 ? 'fila seleccionada' : 'filas seleccionadas'}</b>
          <button className="btn btn-primary btn-sm" onClick={() => setBorrarVarias(true)}>
            <Icon name="trash" size={15} />Eliminar
          </button>
          <button className="link-btn" style={{ fontSize: 13 }} onClick={() => setSeleccion(new Set())}>Quitar selección</button>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>También con la tecla Supr · Shift+clic marca un rango</span>
        </div>
      )}
      <div className="datos-tabla-wrap">
        {/* Widths per column position, so every kind of cell follows them without touching each one. */}
        <style>
          {columnas
            .map((c, i) =>
              anchos[c]
                ? `.datos-tabla-${cfg.tabla} tr > :nth-child(${i + 1 + (puedeSeleccionar ? 1 : 0)}) { width: ${anchos[c]}px; min-width: ${anchos[c]}px; max-width: ${anchos[c]}px; } .datos-tabla-${cfg.tabla} tr > :nth-child(${i + 1 + (puedeSeleccionar ? 1 : 0)}) .celda { max-width: 100%; }`
                : '',
            )
            .join('\n')}
        </style>
        <table className={`datos-tabla datos-tabla-${cfg.tabla}`}>
          <thead>
            <tr>
              {puedeSeleccionar && (
                <th className="th-seleccion">
                  <input
                    type="checkbox"
                    aria-label="Seleccionar todas las filas visibles"
                    title="Seleccionar todas las filas visibles"
                    checked={visibles.length > 0 && visibles.every(f => seleccion.has(f[cfg.pk] as string))}
                    ref={el => {
                      if (el) el.indeterminate = seleccion.size > 0 && !visibles.every(f => seleccion.has(f[cfg.pk] as string))
                    }}
                    onChange={e => setSeleccion(e.target.checked ? new Set(visibles.map(f => f[cfg.pk] as string)) : new Set())}
                  />
                </th>
              )}
              {columnas.map(c => (
                <th
                  key={c}
                  draggable
                  className={`${arrastrando === c ? 'th-arrastrando' : ''}${soltarEn === c && arrastrando !== c ? ' th-soltar' : ''}`}
                  title="Arrastra el encabezado para mover la columna"
                  onDragStart={e => {
                    if (redimensionandoRef.current) return e.preventDefault()
                    setArrastrando(c)
                    e.dataTransfer.effectAllowed = 'move'
                    e.dataTransfer.setData('text/plain', c)
                  }}
                  onDragOver={e => {
                    if (!arrastrando) return
                    e.preventDefault()
                    e.dataTransfer.dropEffect = 'move'
                    if (soltarEn !== c) setSoltarEn(c)
                  }}
                  onDrop={e => {
                    e.preventDefault()
                    if (arrastrando && arrastrando !== c) {
                      const nuevo = columnas.filter(x => x !== arrastrando)
                      nuevo.splice(nuevo.indexOf(c), 0, arrastrando)
                      guardarOrden(nuevo)
                    }
                    setArrastrando(null)
                    setSoltarEn(null)
                  }}
                  onDragEnd={() => {
                    setArrastrando(null)
                    setSoltarEn(null)
                  }}
                >
                  <span
                    className="th-redimension"
                    draggable={false}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Cambiar el ancho de ${etiqueta(c)}`}
                    title="Arrastra para cambiar el ancho · doble clic para volver al ancho normal"
                    onMouseDown={e => empezarRedimension(e, c)}
                    onDoubleClick={() => {
                      const { [c]: _, ...resto } = anchos
                      guardarAnchos(resto)
                    }}
                  />
                  <button
                    className={`th-filtro${filtros[c]?.size ? ' activo' : ''}`}
                    onClick={() => setFiltroAbierto(filtroAbierto === c ? null : c)}
                    aria-expanded={filtroAbierto === c}
                    title="Filtrar por esta columna"
                  >
                    {etiqueta(c)}
                    <Icon name={filtros[c]?.size ? 'filtro' : 'chevronDown'} size={13} strokeWidth={2.2} />
                  </button>
                  {filtroAbierto === c && (
                    <FiltroColumna
                      titulo={etiqueta(c)}
                      valores={filas.map(f => valorFiltro(texto(f, c)))}
                      seleccion={filtros[c] ?? new Set()}
                      onCambiar={sel => {
                        setFiltros(prev => ({ ...prev, [c]: sel }))
                        setLimite(PAGINA)
                      }}
                      onCerrar={() => setFiltroAbierto(null)}
                    />
                  )}
                </th>
              ))}
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {visibles.map((f, fi) => (
              <tr key={f[cfg.pk] as string} data-fila={f[cfg.pk] as string} className={seleccion.has(f[cfg.pk] as string) ? 'fila-seleccionada' : undefined}>
                {puedeSeleccionar && (
                  <td className="td-seleccion">
                    <input
                      type="checkbox"
                      aria-label="Seleccionar fila"
                      checked={seleccion.has(f[cfg.pk] as string)}
                      // The click comes before the change: remember Shift there, toggle on change.
                      onClick={e => {
                        conShiftRef.current = e.shiftKey
                      }}
                      onChange={() => marcarFila(fi, f[cfg.pk] as string, conShiftRef.current)}
                    />
                  </td>
                )}
                {columnas.map(c => {
                  const extra = extraPorKey.get(c)
                  if (extra) return <td key={c}>{extra.render(f)}</td>
                  if (c === ID_CURSO_VIRTUAL) return <td key={c}><span className="celda" style={{ fontWeight: 700 }}>{texto(f, c)}</span></td>
                  // Course / unit / element data: read only here (edit it in its own list).
                  const editandoAqui = !!enCelda && enCelda.id === f[cfg.pk] && enCelda.col === c
                  if (CONTEXTO[c] && !editandoAqui) {
                    const d = editableEnCelda(f, c) ? destinoDe(f, c) : null
                    const origen = d ? TABLAS.find(t => t.tabla === d.tabla)?.titulo ?? d.tabla : null
                    return (
                      <td key={c}>
                        {d ? (
                          <button className="celda celda-edit celda-contexto" title={`Clic para escribir · se guarda en ${origen} y se actualiza en todas las filas que lo muestran`} onClick={() => abrirCelda(f, c)}>
                            {texto(f, c) || <span style={{ color: '#a1a7ad' }}>—</span>}
                          </button>
                        ) : (
                          <span className="celda celda-contexto" title={`${texto(f, c)} — se calcula a partir de otros datos (no se escribe aquí)`}>{texto(f, c)}</span>
                        )}
                      </td>
                    )
                  }
                  const v = f[c]
                  if (typeof v === 'boolean')
                    return (
                      <td key={c} style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={v} disabled={cfg.soloLecturaTabla} onChange={() => alternar(f, c)} aria-label={etiqueta(c)} />
                      </td>
                    )
                  const opciones = cfg.opciones?.[c]
                  if (opciones && !cfg.soloLecturaTabla)
                    return (
                      <td key={c}>
                        <button className="celda celda-edit" title="Clic para elegir" onClick={() => setOpcion({ fila: f, col: c, opciones })}>
                          {texto(f, c) ? <span className="opcion-chip">{texto(f, c)}</span> : <span style={{ color: '#a1a7ad' }}>— Elegir —</span>}
                        </button>
                      </td>
                    )
                  if ((REFERENCIAS_EDITABLES.has(c) || cfg.referenciasEditables?.includes(c)) && !cfg.soloLecturaTabla)
                    return (
                      <td key={c}>
                        <button className="celda celda-edit" title="Clic para elegir" onClick={() => setReferencia({ fila: f, col: c })}>
                          {texto(f, c) || <span style={{ color: '#a1a7ad' }}>— Elegir —</span>}
                        </button>
                      </td>
                    )
                  const soloLectura =
                    !!cfg.soloLecturaTabla || !!REFERENCIAS[c] || !!cfg.soloLectura?.includes(c) || Array.isArray(v) || (typeof v === 'object' && v !== null)
                  if (enCelda && enCelda.id === f[cfg.pk] && enCelda.col === c)
                    return (
                      <td key={c} className="celda-activa">
                        <textarea
                          className="celda-input"
                          autoFocus
                          rows={Math.min(8, Math.max(1, enCelda.valor.split('\n').length))}
                          value={enCelda.valor}
                          aria-label={etiqueta(c)}
                          onFocus={e => e.target.setSelectionRange(e.target.value.length, e.target.value.length)}
                          onChange={e => setEnCelda({ ...enCelda, valor: e.target.value })}
                          onBlur={() => void cerrarCelda(true)}
                          onPaste={e => {
                            // Several cells copied from Excel: fill down and to the right.
                            const t = e.clipboardData.getData('text/plain')
                            const limpio = t.replace(/\r?\n$/, '')
                            if (/[\t\n]/.test(limpio)) {
                              e.preventDefault()
                              void pegarBloque(t)
                            } else if (limpio !== t) {
                              // One cell from Excel carries a trailing line break: paste just the value.
                              e.preventDefault()
                              const el = e.currentTarget
                              const a = el.selectionStart
                              setEnCelda({ ...enCelda, valor: enCelda.valor.slice(0, a) + limpio + enCelda.valor.slice(el.selectionEnd) })
                            }
                          }}
                          onKeyDown={e => {
                            // Like Excel: Enter saves and goes down, Tab right, Esc cancels, Alt+Enter = new line.
                            if (e.key === 'Enter' && e.altKey) {
                              e.preventDefault()
                              const el = e.currentTarget
                              const a = el.selectionStart
                              setEnCelda({ ...enCelda, valor: enCelda.valor.slice(0, a) + '\n' + enCelda.valor.slice(el.selectionEnd) })
                              requestAnimationFrame(() => el.setSelectionRange(a + 1, a + 1))
                            } else if (e.key === 'Enter') {
                              e.preventDefault()
                              void cerrarCelda(true, 'abajo')
                            } else if (e.key === 'Tab') {
                              e.preventDefault()
                              void cerrarCelda(true, e.shiftKey ? 'izquierda' : 'derecha')
                            } else if (e.key === 'Escape') {
                              e.preventDefault()
                              void cerrarCelda(false)
                            }
                          }}
                        />
                      </td>
                    )
                  return (
                    <td key={c}>
                      {soloLectura ? (
                        <span className="celda" title={texto(f, c)}>{texto(f, c)}</span>
                      ) : editableEnCelda(f, c) ? (
                        <button className="celda celda-edit" title="Clic para escribir aquí · Enter baja, Tab avanza, Esc cancela · puedes pegar celdas desde Excel" onClick={() => abrirCelda(f, c)}>
                          {texto(f, c) || <span style={{ color: '#a1a7ad' }}>—</span>}
                        </button>
                      ) : (
                        <button className="celda celda-edit" title="Clic para editar (se guarda solo)" onClick={() => abrirPanel(f, c)}>
                          {texto(f, c) || <span style={{ color: '#a1a7ad' }}>—</span>}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td>
                  {!cfg.soloLecturaTabla && <button className="icon-btn" aria-label="Eliminar registro" onClick={() => setBorrar(f)}><Icon name="trash" size={17} /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtradas.length > limite && (
        <button className="btn btn-outline" style={{ alignSelf: 'center' }} onClick={() => setLimite(l => l + PAGINA)}>
          Mostrar {Math.min(PAGINA, filtradas.length - limite)} más
        </button>
      )}
      {cfg.agregar && !cfg.soloLecturaTabla && (
        <div className="agregar-filas">
          <button className="btn btn-outline" onClick={() => void agregarFila()} disabled={agregando}>
            <Icon name="plus" size={16} strokeWidth={2} />{agregando ? 'Agregando…' : 'Agregar fila'}
          </button>
          <span>
            Para agregar muchas: copia las filas en Excel (mismas columnas y orden que esta tabla), haz clic en la primera celda de la última fila y pega;
            lo que sobre se crea como filas nuevas.
            {cfg.referenciasEditables?.length ? ' En las columnas de referencia pega el código (C14, U69, S313…) o el nombre exacto.' : ''}
          </span>
        </div>
      )}
      <Modal
        open={!!pegadoPendiente}
        title={`¿Crear ${pegadoPendiente?.nuevas.length ?? 0} ${pegadoPendiente?.nuevas.length === 1 ? 'fila nueva' : 'filas nuevas'} en ${cfg.titulo}?`}
        onClose={() => setPegadoPendiente(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setPegadoPendiente(null)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={() => {
                const p = pegadoPendiente
                setPegadoPendiente(null)
                if (p) void aplicarPegado(p)
              }}
            >
              Sí, pegar y crear
            </button>
          </>
        }
      >
        {pegadoPendiente && (
          <>
            Lo que pegaste tiene más filas que la tabla desde la celda elegida.
            {pegadoPendiente.cambios.length ? <> Se cambiarán <b>{pegadoPendiente.cambios.length} celdas</b> de filas existentes y</> : ' Se'} crearán <b>{pegadoPendiente.nuevas.length} filas nuevas</b> al final.
            {pegadoPendiente.omitidas ? ` ${pegadoPendiente.omitidas} celdas no se pegarán (columnas que no se escriben aquí, números inválidos, códigos que no existen o nombres repetidos).` : ''}
          </>
        )}
      </Modal>

      <Drawer
        open={!!edicion}
        className="drawer-ancho"
        onClose={() => void cerrarPanel()}
        title={edicion ? `${etiqueta(edicion.col)} · ${texto(edicion.fila, cfg.etiqueta ?? cfg.pk) || 'fila'}` : ''}
        footer={
          <>
            <span style={{ marginRight: 'auto', display: 'flex', alignItems: 'center', gap: 8 }}>
              <button className="btn btn-outline btn-sm" disabled={posPanel <= 0} onClick={() => void moverPanel(-1)} title="Fila anterior (Alt+↑)">
                <Icon name="chevronUp" size={16} strokeWidth={2} />Anterior
              </button>
              <button className="btn btn-outline btn-sm" disabled={posPanel < 0 || posPanel >= visibles.length - 1} onClick={() => void moverPanel(1)} title="Fila siguiente (Alt+↓)">
                <Icon name="chevronDown" size={16} strokeWidth={2} />Siguiente
              </button>
              <span style={{ fontSize: 13, color: estadoPanel === 'error' ? 'var(--color-danger)' : 'var(--color-text-muted)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {estadoPanel === 'guardando' && <>Guardando información <span className="spinner" style={{ display: 'flex' }}><Icon name="spinner" size={14} strokeWidth={2.4} /></span></>}
                {estadoPanel === 'guardado' && <><Icon name="check" size={14} strokeWidth={2.4} />Cambios guardados</>}
                {estadoPanel === 'error' && <><Icon name="alert" size={14} />No se guardó</>}
                {estadoPanel === 'idle' && 'Se guarda automáticamente'}
              </span>
            </span>
            <button className="btn btn-primary" onClick={() => void cerrarPanel()}>Cerrar</button>
          </>
        }
      >
        {edicion && (
          <div
            style={{ display: 'contents' }}
            onKeyDown={e => {
              // Alt+↑ / Alt+↓: previous / next row without leaving the keyboard.
              if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
                e.preventDefault()
                void moverPanel(e.key === 'ArrowUp' ? -1 : 1)
              }
            }}
          >
            {COLUMNAS_RICAS.has(edicion.col) ? (
              <TextoEnriquecido key={`${edicion.fila[cfg.pk]}-${edicion.col}`} id="celda-rica" value={edicion.valor} onChange={escribirPanel} minHeight={380} />
            ) : (
              <>
                <textarea key={`${edicion.fila[cfg.pk]}-${edicion.col}`} className="textarea" style={{ minHeight: 220 }} value={edicion.valor} onChange={e => escribirPanel(e.target.value)} autoFocus />
                <span style={{ fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'flex-end' }}>{edicion.valor.length} caracteres</span>
              </>
            )}
          </div>
        )}
      </Drawer>
      {opcion && (
        <Drawer
          open
          onClose={() => setOpcion(null)}
          title={`Elegir ${etiqueta(opcion.col)}`}
          footer={
            <>
              {opcion.fila[opcion.col] ? (
                <button className="btn btn-outline" onClick={() => guardarOpcion(null)}>Dejar vacío</button>
              ) : null}
              <button className="btn btn-primary" onClick={() => setOpcion(null)}>Cancelar</button>
            </>
          }
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {opcion.opciones.map(o => (
              <button key={o} className={`referencia-op${opcion.fila[opcion.col] === o ? ' actual' : ''}`} onClick={() => guardarOpcion(o)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <b>{o}</b>
                  {opcion.fila[opcion.col] === o && <span style={{ marginLeft: 'auto', color: 'var(--color-primary)', display: 'flex' }}><Icon name="check" size={16} strokeWidth={2.4} /></span>}
                </span>
              </button>
            ))}
            {opcion.fila[opcion.col] && !opcion.opciones.includes(String(opcion.fila[opcion.col])) ? (
              <p style={{ fontSize: 12, color: 'var(--color-warning)' }}>Valor actual fuera de la lista: «{String(opcion.fila[opcion.col])}».</p>
            ) : null}
          </div>
        </Drawer>
      )}
      {referencia && (
        <ElegirReferencia
          titulo={etiqueta(referencia.col)}
          col={referencia.col}
          actual={referencia.fila[referencia.col] as string | null}
          onClose={() => setReferencia(null)}
          onElegir={async opcion => {
            const { fila, col } = referencia
            // Picking a catalogue element also refreshes the copied abbreviation/description.
            const cambios: Record<string, unknown> = { [col]: opcion?.id ?? null }
            if (col === 'dpl_catalogoelementoid' && cfg.tabla === 'dpl_unidad') {
              cambios.dpl_elementocatalogo = opcion ? opcion.fila.dpl_elemento : null
              cambios.dpl_elementocatalogoabreviatura = opcion ? opcion.fila.dpl_abreviatura : null
              cambios.dpl_elementocatalogodescripcion = opcion ? opcion.fila.dpl_descripcion : null
            }
            try {
              for (const [k, v] of Object.entries(cambios)) await actualizarCelda(cfg, fila[cfg.pk] as string, k, v)
              setFilas(prev => prev && prev.map(f => (f[cfg.pk] === fila[cfg.pk] ? { ...f, ...cambios } : f)))
              if (opcion) setNombres(prev => new Map(prev).set(opcion.id, opcion.nombre))
              setReferencia(null)
              toast('Se guardó información con éxito')
            } catch (err) {
              toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
            }
          }}
        />
      )}
      <Modal
        open={!!borrar}
        title="¿Eliminar registro?"
        onClose={() => setBorrar(null)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setBorrar(null)}>No, cancelar</button>
            <button className="btn btn-primary" onClick={confirmarBorrar}>Sí, eliminar</button>
          </>
        }
      >
        {borrar && <DetalleBorrado fila={borrar} cfg={cfg} rel={rel} etiquetaFila={cfg.etiqueta ? texto(borrar, cfg.etiqueta) : ''} />}
        Se eliminará de forma permanente, junto con la información que dependa de él (por ejemplo, los criterios de una rúbrica).
      </Modal>
      <Modal
        open={borrarVarias}
        title={`¿Eliminar ${seleccionadas.length} ${seleccionadas.length === 1 ? 'registro' : 'registros'} de ${cfg.titulo}?`}
        onClose={() => !borrando && setBorrarVarias(false)}
        actions={
          <>
            <button className="btn btn-outline" disabled={borrando} onClick={() => setBorrarVarias(false)}>No, cancelar</button>
            <button className="btn btn-primary" disabled={borrando} onClick={() => void confirmarBorrarVarias()}>
              {borrando ? 'Eliminando…' : `Sí, eliminar ${seleccionadas.length}`}
            </button>
          </>
        }
      >
        <div className="borrar-detalle" style={{ maxHeight: 260, overflowY: 'auto' }}>
          {seleccionadas.slice(0, 50).map(f => (
            <span key={f[cfg.pk] as string}>• {resumenFila(f)}</span>
          ))}
          {seleccionadas.length > 50 && <span>… y {seleccionadas.length - 50} más</span>}
        </div>
        Se eliminarán de forma permanente, junto con la información que dependa de ellos (por ejemplo, los criterios de una rúbrica). Esto no se puede deshacer.
      </Modal>
    </div>
  )
}

// ── Users & course assignments ───────────────────────────────────────────────

const ROLES_EDITABLES = Object.keys(ROLE_LABELS) as UserRole[]
function UsuariosPanel() {
  const toast = useToast()
  const [datos, setDatos] = useState<{ tabla: boolean; usuarios: UsuarioAdmin[]; asignaciones: Asignacion[] } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)

  const cargar = useCallback(async () => {
    try {
      setDatos(await listarUsuarios())
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [])
  useEffect(() => {
    cargar()
  }, [cargar])

  if (error) return <ErrorPanel mensaje={error} onRetry={cargar} />
  if (!datos) return <Cargando texto="Cargando usuarios" />
  if (!datos.tabla)
    return (
      <div className="panel" style={{ padding: 32, lineHeight: 1.6 }}>
        Falta crear las tablas de usuarios. Vuelve a ejecutar <b>supabase/schema-flujo.sql</b> completo en el SQL Editor de Supabase (es seguro repetirlo).
      </div>
    )

  const sinCorreo = datos.usuarios.filter(u => !u.correo).length
  const q = busqueda.trim().toLowerCase()
  const lista = datos.usuarios.filter(u => !q || u.nombre.toLowerCase().includes(q) || (u.correo ?? '').includes(q))

  const guardar = async (u: UsuarioAdmin) => {
    if (!u.nombre.trim()) {
      toast('El nombre es obligatorio.', 'error')
      return
    }
    if (u.correo && !/^[^@\s]+@utp\.edu\.pe$/i.test(u.correo.trim())) {
      toast('El correo debe ser @utp.edu.pe.', 'error')
      return
    }
    try {
      await guardarUsuario(u)
      setEditando(null)
      toast('Se guardó información con éxito')
      cargar()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo guardar.', 'error')
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {sinCorreo > 0 && (
        <div className="alert-banner alert-warn" style={{ padding: '12px 14px' }}>
          <Icon name="info" size={16} />
          {sinCorreo} {sinCorreo === 1 ? 'persona no tiene' : 'personas no tienen'} correo registrado y no podrán entrar hasta que lo completes.
        </div>
      )}
      <div className="panel" style={{ padding: '16px 18px', display: 'flex', gap: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 320px' }}>
          <label className="field-label" htmlFor="buscar-usuario">Usuario</label>
          <div className="input-box">
            <input id="buscar-usuario" type="search" placeholder="Buscar por nombre o correo" value={busqueda} onChange={e => setBusqueda(e.target.value)} />
            <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Icon name="search" size={20} strokeWidth={2} /></span>
          </div>
        </div>
        <button className="btn btn-primary" style={{ height: 44 }} onClick={() => setEditando({ id: '', nombre: '', correo: '', roles: ['docente'], activo: true })}>
          <Icon name="plus" size={16} strokeWidth={2} />Nuevo usuario
        </button>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Correo</th>
            <th>Roles</th>
            <th style={{ width: 150 }}>Cursos asignados</th>
            <th style={{ width: 120 }} />
          </tr>
        </thead>
        <tbody>
          {lista.map(u => {
            const n = new Set(datos.asignaciones.filter(a => a.usuarioId === u.id).map(a => a.cursoId)).size
            return (
              <tr key={u.id} style={{ opacity: u.activo ? 1 : 0.55 }}>
                <td>{u.nombre}</td>
                <td>{u.correo || <span className="chip chip-edicion">Falta correo</span>}</td>
                <td style={{ fontSize: 13 }}>{u.roles.map(r => ROLE_LABELS[r as UserRole] ?? r).join(' · ') || '—'}</td>
                <td>
                  <span title="Se asignan en LISTADO_CURSOS_PARA_IA">{n} {n === 1 ? 'curso' : 'cursos'}</span>
                </td>
                <td>
                  <button className="btn btn-outline btn-sm" onClick={() => setEditando({ ...u, correo: u.correo ?? '' })}>Editar</button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>

      <Drawer
        open={!!editando}
        onClose={() => setEditando(null)}
        title={editando?.id ? 'Editar usuario' : 'Nuevo usuario'}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setEditando(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => editando && guardar(editando)}>Guardar</button>
          </>
        }
      >
        {editando && (
          <>
            <div>
              <label className="field-label" htmlFor="u-nombre">Nombre completo</label>
              <input id="u-nombre" type="text" value={editando.nombre} onChange={e => setEditando({ ...editando, nombre: e.target.value })} />
            </div>
            <div>
              <label className="field-label" htmlFor="u-correo">Correo UTP</label>
              <input id="u-correo" type="email" placeholder="usuario@utp.edu.pe" value={editando.correo ?? ''} onChange={e => setEditando({ ...editando, correo: e.target.value })} />
            </div>
            <fieldset style={{ border: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <legend className="field-label">Roles</legend>
              {ROLES_EDITABLES.map(r => (
                <label key={r} className="radio">
                  <input
                    type="checkbox"
                    checked={editando.roles.includes(r)}
                    onChange={e =>
                      setEditando({
                        ...editando,
                        roles: e.target.checked ? [...editando.roles, r] : editando.roles.filter(x => x !== r),
                      })
                    }
                  />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </fieldset>
            <label className="radio">
              <input type="checkbox" checked={editando.activo} onChange={e => setEditando({ ...editando, activo: e.target.checked })} />
              Usuario activo (puede entrar)
            </label>
          </>
        )}
      </Drawer>

    </div>
  )
}

// ── LISTADO_CURSOS_PARA_IA: courses + assigned people, like the SharePoint list ──

/**
 * Person columns of the list → assignment role. "Persona Asignada" decides who
 * sees the course; the rest say what each person does in it.
 */
const COLUMNAS_PERSONAS: Array<{ rol: string; label: string; rolUsuario: UserRole | null }> = [
  { rol: 'asignado', label: 'Persona Asignada', rolUsuario: null },
  { rol: 'docente', label: 'Docente', rolUsuario: 'docente' },
  { rol: 'asesor', label: 'Asesor', rolUsuario: 'asesor' },
  { rol: 'monitor_ea', label: 'Monitor EA', rolUsuario: 'monitor_ea' },
  { rol: 'monitor_qa', label: 'Monitor QA', rolUsuario: 'monitor_qa' },
  { rol: 'monitor_disena', label: 'Monitor Diseña+', rolUsuario: 'monitor_disena' },
  { rol: 'dda', label: 'DDA', rolUsuario: 'dda' },
]

function ListadoCursosEditor({ cfg }: { cfg: TablaConfig }) {
  const [datos, setDatos] = useState<{ tabla: boolean; usuarios: UsuarioAdmin[]; asignaciones: Asignacion[] } | null>(null)
  const [elegir, setElegir] = useState<{ cursoId: string; curso: string; col: (typeof COLUMNAS_PERSONAS)[number] } | null>(null)

  const cargar = useCallback(() => {
    listarUsuarios().then(setDatos).catch(() => setDatos({ tabla: false, usuarios: [], asignaciones: [] }))
  }, [])
  useEffect(cargar, [cargar])

  // Course PDFs (sílabo, formato de orientación) — like "Documentos" / "Previsualizar_Formato" in SharePoint.
  const [docs, setDocs] = useState<Map<string, DocumentoCurso>>(new Map())
  const [visor, setVisor] = useState<{ doc: DocumentoCurso; curso: string } | null>(null)
  const cargarDocs = useCallback(() => {
    listarDocumentos().then(setDocs).catch(() => setDocs(new Map()))
  }, [])
  useEffect(cargarDocs, [cargarDocs])

  const columnasDocs: ColumnaExtra[] = useMemo(
    () =>
      (Object.keys(DOCUMENTOS) as TipoDocumento[]).map((tipo, i) => ({
        key: `__doc_${tipo}`,
        label: `${DOCUMENTOS[tipo].label} (PDF)`,
        despuesDe: i === 0 ? (datos?.tabla ? '__persona_dda' : 'dpl_software') : '__doc_silabo',
        texto: (f: Record<string, unknown>) => (docs.has(`${f[cfg.pk]}|${tipo}`) ? 'Sí' : 'No'),
        render: (f: Record<string, unknown>) => (
          <DocumentoCelda
            cursoId={f[cfg.pk] as string}
            curso={capitalizar(String(f.dpl_nombrecurso ?? ''))}
            tipo={tipo}
            doc={docs.get(`${f[cfg.pk]}|${tipo}`)}
            onVer={doc => setVisor({ doc, curso: capitalizar(String(f.dpl_nombrecurso ?? '')) })}
            onCambio={cargarDocs}
          />
        ),
      })),
    [docs, datos?.tabla, cfg.pk, cargarDocs],
  )

  const extras: ColumnaExtra[] = useMemo(() => {
    if (!datos?.tabla) return columnasDocs
    const nombre = new Map(datos.usuarios.map(u => [u.id, u.nombre]))
    return [...COLUMNAS_PERSONAS.map((col, i) => {
      const personas = (f: Record<string, unknown>) =>
        datos.asignaciones.filter(a => a.cursoId === f[cfg.pk] && a.rol === col.rol).map(a => nombre.get(a.usuarioId) ?? '¿?')
      return {
        key: `__persona_${col.rol}`,
        label: col.label,
        despuesDe: i === 0 ? 'dpl_software' : `__persona_${COLUMNAS_PERSONAS[i - 1].rol}`,
        texto: (f: Record<string, unknown>) => personas(f).join('; '),
        render: (f: Record<string, unknown>) => (
          <button
            className="celda celda-edit personas-celda"
            title="Clic para elegir personas"
            onClick={() => setElegir({ cursoId: f[cfg.pk] as string, curso: String(f.dpl_nombrecurso ?? ''), col })}
          >
            {personas(f).length ? personas(f).map(p => <span key={p} className="persona-chip">{p}</span>) : <span style={{ color: '#a1a7ad' }}>—</span>}
          </button>
        ),
      }
    }), ...columnasDocs]
  }, [datos, cfg.pk, columnasDocs])

  return (
    <>
      {datos && !datos.tabla && (
        <div className="alert-banner alert-warn" style={{ padding: '12px 14px', marginBottom: 14 }}>
          <Icon name="info" size={16} />
          Para ver y editar Persona Asignada, Docente, Asesor, Monitores y DDA, vuelve a ejecutar <b>supabase/schema-flujo.sql</b> en Supabase.
        </div>
      )}
      <TablaEditor cfg={cfg} extras={extras} />
      {visor && (
        <VisorPdf
          titulo={`${DOCUMENTOS[visor.doc.tipo].label} · ${visor.curso}`}
          url={visor.doc.url}
          nombreArchivo={nombreDescarga(visor.doc.tipo, visor.curso)}
          onClose={() => setVisor(null)}
        />
      )}
      {elegir && datos && (
        <ElegirPersonas
          titulo={`${elegir.col.label} · ${capitalizar(elegir.curso)}`}
          cursoId={elegir.cursoId}
          rol={elegir.col.rol}
          rolUsuario={elegir.col.rolUsuario}
          usuarios={datos.usuarios}
          asignaciones={datos.asignaciones}
          onClose={() => setElegir(null)}
          onCambio={cargar}
        />
      )}
    </>
  )
}

function ElegirPersonas(props: {
  titulo: string
  cursoId: string
  rol: string
  rolUsuario: UserRole | null
  usuarios: UsuarioAdmin[]
  asignaciones: Asignacion[]
  onClose: () => void
  onCambio: () => void
}) {
  const { titulo, cursoId, rol, rolUsuario, usuarios, asignaciones, onClose, onCambio } = props
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const [nuevo, setNuevo] = useState<{ nombre: string; correo: string } | null>(null)
  const elegidos = new Set(asignaciones.filter(a => a.cursoId === cursoId && a.rol === rol).map(a => a.usuarioId))
  const q = busqueda.trim().toLowerCase()
  const lista = usuarios
    .filter(u => u.activo && (!q || u.nombre.toLowerCase().includes(q) || (u.correo ?? '').includes(q)))
    .sort((a, b) => Number(elegidos.has(b.id)) - Number(elegidos.has(a.id)) || a.nombre.localeCompare(b.nombre, 'es'))

  const cambiar = async (usuario: UsuarioAdmin, on: boolean) => {
    try {
      await cambiarAsignacion({ cursoId, usuarioId: usuario.id, rol }, on)
      // Whoever gets a role in the course must also see it (Persona Asignada).
      if (on && rol !== 'asignado') await cambiarAsignacion({ cursoId, usuarioId: usuario.id, rol: 'asignado' }, true)
      // Make sure the person also holds the role this column needs.
      if (on && rolUsuario && !usuario.roles.includes(rolUsuario)) await guardarUsuario({ ...usuario, roles: [...usuario.roles, rolUsuario] })
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error')
    }
  }

  const crear = async () => {
    if (!nuevo?.nombre.trim()) return
    if (nuevo.correo && !/^[^@\s]+@utp\.edu\.pe$/i.test(nuevo.correo.trim())) {
      toast('El correo debe ser @utp.edu.pe.', 'error')
      return
    }
    try {
      const u = await guardarUsuario({ nombre: nuevo.nombre, correo: nuevo.correo, roles: rolUsuario ? [rolUsuario] : [], activo: true })
      await cambiarAsignacion({ cursoId, usuarioId: u.id, rol }, true)
      if (rol !== 'asignado') await cambiarAsignacion({ cursoId, usuarioId: u.id, rol: 'asignado' }, true)
      setNuevo(null)
      toast('Persona agregada y asignada')
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo agregar.', 'error')
    }
  }

  return (
    <Drawer open onClose={onClose} title={titulo} footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
      <div className="input-box">
        <input type="search" placeholder="Buscar por nombre o correo" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar persona" />
        <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Icon name="search" size={18} strokeWidth={2} /></span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {lista.map(u => (
          <label key={u.id} className="persona-opcion">
            <input type="checkbox" checked={elegidos.has(u.id)} onChange={e => cambiar(u, e.target.checked)} />
            <span style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{ fontWeight: 700 }}>{u.nombre}</span>
              <span style={{ fontSize: 12, color: u.correo ? 'var(--color-text-muted)' : 'var(--color-warning)' }}>{u.correo || 'Sin correo — complétalo en Usuarios'}</span>
            </span>
          </label>
        ))}
        {lista.length === 0 && <p style={{ color: 'var(--color-text-muted)', padding: '8px 0' }}>No hay personas con ese nombre.</p>}
      </div>
      {nuevo ? (
        <div className="panel" style={{ border: '1px solid var(--color-border)', padding: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <span style={{ fontWeight: 700 }}>Nueva persona</span>
          <input type="text" placeholder="Nombre completo" value={nuevo.nombre} onChange={e => setNuevo({ ...nuevo, nombre: e.target.value })} aria-label="Nombre completo" />
          <input type="email" placeholder="usuario@utp.edu.pe" value={nuevo.correo} onChange={e => setNuevo({ ...nuevo, correo: e.target.value })} aria-label="Correo UTP" />
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button className="btn btn-outline btn-sm" onClick={() => setNuevo(null)}>Cancelar</button>
            <button className="btn btn-primary btn-sm" disabled={!nuevo.nombre.trim()} onClick={crear}>Agregar y asignar</button>
          </div>
        </div>
      ) : (
        <button className="link-btn" style={{ alignSelf: 'flex-start' }} onClick={() => setNuevo({ nombre: busqueda, correo: '' })}>
          <Icon name="plus" size={16} strokeWidth={2} />¿No está en la lista? Agregar persona
        </button>
      )}
    </Drawer>
  )
}

/** Upload / view / replace / remove one course PDF, right in the list cell. */
function DocumentoCelda(props: {
  cursoId: string
  curso: string
  tipo: TipoDocumento
  doc?: DocumentoCurso
  onVer: (doc: DocumentoCurso) => void
  onCambio: () => void
}) {
  const { cursoId, curso, tipo, doc, onVer, onCambio } = props
  const toast = useToast()
  const [subiendo, setSubiendo] = useState(false)
  const [quitar, setQuitar] = useState(false)
  const inputId = `pdf-${tipo}-${cursoId}`

  const subir = async (archivo: File | undefined) => {
    if (!archivo) return
    setSubiendo(true)
    try {
      await subirDocumento(cursoId, tipo, archivo)
      toast(`${DOCUMENTOS[tipo].label} de ${curso} ${doc ? 'reemplazado' : 'subido'}`)
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo subir el PDF.', 'error')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="doc-celda">
      <input
        id={inputId}
        type="file"
        accept="application/pdf,.pdf"
        className="sr-only"
        onChange={e => {
          subir(e.target.files?.[0])
          e.target.value = ''
        }}
      />
      {subiendo ? (
        <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>Subiendo…</span>
      ) : doc ? (
        <>
          <button className="doc-chip" onClick={() => onVer(doc)} title="Ver PDF"><Icon name="pdf" size={14} />Ver</button>
          <label htmlFor={inputId} className="link-btn" style={{ margin: 0, cursor: 'pointer' }} title="Reemplazar por otro PDF">Cambiar</label>
          <button className="link-btn" style={{ color: 'var(--color-danger)' }} onClick={() => setQuitar(true)}>Quitar</button>
        </>
      ) : (
        <label htmlFor={inputId} className="link-btn" style={{ margin: 0, cursor: 'pointer' }}>
          <Icon name="upload" size={14} />Subir PDF
        </label>
      )}
      <Modal
        open={quitar}
        title={`¿Quitar el ${DOCUMENTOS[tipo].label.toLowerCase()} de ${curso}?`}
        onClose={() => setQuitar(false)}
        actions={
          <>
            <button className="btn btn-outline" onClick={() => setQuitar(false)}>No, cancelar</button>
            <button
              className="btn btn-primary"
              onClick={async () => {
                setQuitar(false)
                try {
                  await quitarDocumento(cursoId, tipo)
                  toast('Documento quitado')
                  onCambio()
                } catch (err) {
                  toast(err instanceof Error ? err.message : 'No se pudo quitar.', 'error')
                }
              }}
            >
              Sí, quitar
            </button>
          </>
        }
      >
        Los docentes ya no lo verán en la lista de cursos.
      </Modal>
    </div>
  )
}

const VACIO = '(vacío)'
const valorFiltro = (v: string) => (v.trim() === '' ? VACIO : v.length > 120 ? v.slice(0, 120) + '…' : v)

/** SharePoint-style column filter: pick exact values from a searchable list. */
function FiltroColumna(props: {
  titulo: string
  valores: string[]
  seleccion: Set<string>
  onCambiar: (sel: Set<string>) => void
  onCerrar: () => void
}) {
  const { titulo, valores, seleccion, onCambiar, onCerrar } = props
  const [busqueda, setBusqueda] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const cerrar = (e: MouseEvent) => {
      const th = ref.current?.parentElement
      if (th && !th.contains(e.target as Node)) onCerrar()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    document.addEventListener('mousedown', cerrar)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', cerrar)
      document.removeEventListener('keydown', esc)
    }
  }, [onCerrar])

  const conteo = useMemo(() => {
    const m = new Map<string, number>()
    for (const v of valores) m.set(v, (m.get(v) ?? 0) + 1)
    return [...m.entries()].sort((a, b) =>
      a[0] === VACIO ? 1 : b[0] === VACIO ? -1 : a[0].localeCompare(b[0], 'es', { numeric: true, sensitivity: 'base' }),
    )
  }, [valores])
  const q = busqueda.trim().toLowerCase()
  const visibles = conteo.filter(([v]) => !q || v.toLowerCase().includes(q)).slice(0, 300)

  const alternar = (v: string) => {
    const next = new Set(seleccion)
    if (next.has(v)) next.delete(v)
    else next.add(v)
    onCambiar(next)
  }

  return (
    <div className="filtro-pop" ref={ref} role="dialog" aria-label={`Filtrar ${titulo}`} onClick={e => e.stopPropagation()}>
      <div className="input-box" style={{ height: 36 }}>
        <input type="search" autoFocus placeholder="Buscar valor" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar valor" />
        <Icon name="search" size={15} strokeWidth={2} />
      </div>
      <div className="filtro-lista">
        {visibles.map(([v, n]) => (
          <label key={v} className="filtro-op">
            <input type="checkbox" checked={seleccion.has(v)} onChange={() => alternar(v)} />
            <span className="filtro-valor" title={v}>{v}</span>
            <small>{n}</small>
          </label>
        ))}
        {visibles.length === 0 && <span style={{ fontSize: 13, color: 'var(--color-text-muted)', padding: 8 }}>Sin coincidencias</span>}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <button className="link-btn" style={{ fontSize: 12 }} disabled={!seleccion.size} onClick={() => onCambiar(new Set())}>Quitar filtro</button>
        <button className="btn btn-primary btn-sm" onClick={onCerrar}>Listo</button>
      </div>
    </div>
  )
}

/** Pick the value of a lookup column (e.g. Elemento_Catalogo) from its catalogue. */
function ElegirReferencia(props: {
  titulo: string
  col: string
  actual: string | null
  onClose: () => void
  onElegir: (opcion: { id: string; nombre: string; fila: Record<string, unknown> } | null) => void
}) {
  const { titulo, col, actual, onClose, onElegir } = props
  const [opciones, setOpciones] = useState<Array<{ id: string; nombre: string; fila: Record<string, unknown> }> | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    opcionesReferencia(col).then(setOpciones).catch(err => setError(err instanceof Error ? err.message : 'Error'))
  }, [col])
  const q = busqueda.trim().toLowerCase()
  const lista = (opciones ?? []).filter(o => !q || o.nombre.toLowerCase().includes(q) || codigoReferencia(o.fila).toLowerCase().includes(q))

  return (
    <Drawer
      open
      onClose={onClose}
      title={`Elegir ${titulo}`}
      footer={
        <>
          {actual && <button className="btn btn-outline" onClick={() => onElegir(null)}>Dejar vacío</button>}
          <button className="btn btn-primary" onClick={onClose}>Cancelar</button>
        </>
      }
    >
      {error && <p className="field-error">{error}</p>}
      {!opciones && !error && <p style={{ color: 'var(--color-text-muted)' }}>Cargando…</p>}
      {opciones && (
        <>
          <div className="input-box">
            <input type="search" autoFocus placeholder="Buscar" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar" />
            <Icon name="search" size={16} strokeWidth={2} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {lista.map(o => (
              <button key={o.id} className={`referencia-op${o.id === actual ? ' actual' : ''}`} onClick={() => onElegir(o)}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {codigoReferencia(o.fila) ? <span className="criterio-num">{codigoReferencia(o.fila)}</span> : null}
                  <b>{o.nombre}</b>
                  {o.fila.dpl_tipoensenanza ? <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{String(o.fila.dpl_tipoensenanza)}</span> : null}
                  {o.id === actual && <span style={{ marginLeft: 'auto', color: 'var(--color-primary)', display: 'flex' }}><Icon name="check" size={16} strokeWidth={2.4} /></span>}
                </span>
                {o.fila.dpl_descripcion ? <span style={{ fontSize: 12, color: 'var(--color-text-muted)', lineHeight: 1.45 }}>{String(o.fila.dpl_descripcion)}</span> : null}
              </button>
            ))}
            {lista.length === 0 && <p style={{ color: 'var(--color-text-muted)' }}>Sin coincidencias.</p>}
          </div>
        </>
      )}
    </Drawer>
  )
}
