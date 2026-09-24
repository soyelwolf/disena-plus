import { useCallback, useEffect, useMemo, useState } from 'react'
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
  cargarTabla,
  columnasVisibles,
  descargarCsv,
  eliminarFila,
  etiquetaColumna,
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

function TablaEditor({ cfg, extras = [], version = 0 }: { cfg: TablaConfig; extras?: ColumnaExtra[]; version?: number }) {
  const toast = useToast()
  const [filas, setFilas] = useState<Array<Record<string, unknown>> | null>(null)
  const [existe, setExiste] = useState(true)
  const [nombres, setNombres] = useState<Map<string, string>>(new Map())
  const [rel, setRel] = useState<Relaciones | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [limite, setLimite] = useState(PAGINA)
  const [edicion, setEdicion] = useState<{ fila: Record<string, unknown>; col: string; valor: string } | null>(null)
  const [borrar, setBorrar] = useState<Record<string, unknown> | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [t, r] = await Promise.all([cargarTabla(cfg), cargarRelaciones()])
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
  const conCurso = cfg.tabla !== 'dpl_curso' && !!filas?.some(f => rel?.cursoDe(f))
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
    return orden
  }, [filas, cfg, extras, conCurso])
  const extraPorKey = useMemo(() => new Map(extras.map(e => [e.key, e])), [extras])
  const texto = useCallback(
    (f: Record<string, unknown>, c: string): string => {
      if (c === ID_CURSO_VIRTUAL) {
        const id = rel?.cursoDe(f)
        return id ? rel?.cursoTexto.get(id) ?? '' : ''
      }
      const extra = extraPorKey.get(c)
      if (extra) return extra.texto(f)
      const v = f[c]
      if (v === null || v === undefined) return ''
      if (REFERENCIAS[c] && typeof v === 'string') return nombres.get(v) ?? v
      if (typeof v === 'boolean') return v ? 'Sí' : 'No'
      if (Array.isArray(v)) return v.join(', ')
      return typeof v === 'string' && esHtml(v) ? textoPlano(v) : String(v)
    },
    [nombres, rel, extraPorKey],
  )
  const etiqueta = (c: string) => (c === ID_CURSO_VIRTUAL ? 'ID_CURSO' : extraPorKey.get(c)?.label ?? etiquetaColumna(c))

  useEffect(() => {
    // Re-read when the parent signals its extra columns changed (e.g. assignments saved).
    if (version) cargar()
  }, [version, cargar])
  const filtradas = useMemo(() => {
    if (!filas) return []
    const q = busqueda.trim().toLowerCase()
    if (!q) return filas
    return filas.filter(f => columnas.some(c => texto(f, c).toLowerCase().includes(q)))
  }, [filas, busqueda, columnas, texto])

  if (error) return <ErrorPanel mensaje={error} onRetry={cargar} />
  if (!filas) return <Cargando texto="Cargando tabla" />
  if (!existe)
    return (
      <div className="panel" style={{ padding: 32 }}>
        Esta tabla aún no existe. Ejecuta <b>supabase/schema-flujo.sql</b> en el SQL Editor de Supabase.
      </div>
    )

  const guardarEdicion = async () => {
    if (!edicion) return
    const { fila, col, valor } = edicion
    const original = fila[col]
    const nuevo = typeof original === 'number' ? (valor.trim() === '' ? null : Number(valor)) : valor
    if (typeof original === 'number' && nuevo !== null && Number.isNaN(nuevo)) {
      toast('Ingresa un número válido.', 'error')
      return
    }
    try {
      await actualizarCelda(cfg, fila[cfg.pk] as string, col, nuevo)
      setFilas(prev => prev && prev.map(f => (f[cfg.pk] === fila[cfg.pk] ? { ...f, [col]: nuevo } : f)))
      setEdicion(null)
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
        <button
          className="btn btn-outline"
          style={{ height: 44 }}
          onClick={() => descargarCsv(cfg.titulo.replace(/\s+/g, '_').toUpperCase(), columnas, filtradas, texto, etiqueta)}
        >
          <Icon name="download" size={16} />Descargar Excel
        </button>
      </div>

      <div className="datos-tabla-wrap">
        <table className="datos-tabla">
          <thead>
            <tr>
              {columnas.map(c => <th key={c}>{etiqueta(c)}</th>)}
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, limite).map(f => (
              <tr key={f[cfg.pk] as string}>
                {columnas.map(c => {
                  const extra = extraPorKey.get(c)
                  if (extra) return <td key={c}>{extra.render(f)}</td>
                  if (c === ID_CURSO_VIRTUAL) return <td key={c}><span className="celda" style={{ fontWeight: 700 }}>{texto(f, c)}</span></td>
                  const v = f[c]
                  if (typeof v === 'boolean')
                    return (
                      <td key={c} style={{ textAlign: 'center' }}>
                        <input type="checkbox" checked={v} onChange={() => alternar(f, c)} aria-label={etiquetaColumna(c)} />
                      </td>
                    )
                  const soloLectura = !!REFERENCIAS[c] || Array.isArray(v) || (typeof v === 'object' && v !== null)
                  return (
                    <td key={c}>
                      {soloLectura ? (
                        <span className="celda" title={texto(f, c)}>{texto(f, c)}</span>
                      ) : (
                        <button className="celda celda-edit" title="Clic para editar" onClick={() => setEdicion({ fila: f, col: c, valor: v === null || v === undefined ? '' : String(v) })}>
                          {texto(f, c) || <span style={{ color: '#a1a7ad' }}>—</span>}
                        </button>
                      )}
                    </td>
                  )
                })}
                <td>
                  <button className="icon-btn" aria-label="Eliminar registro" onClick={() => setBorrar(f)}><Icon name="trash" size={17} /></button>
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

      <Drawer
        open={!!edicion}
        onClose={() => setEdicion(null)}
        title={edicion ? `Editar: ${etiquetaColumna(edicion.col)}` : ''}
        footer={
          <>
            <button className="btn btn-outline" onClick={() => setEdicion(null)}>Cancelar</button>
            <button className="btn btn-primary" onClick={guardarEdicion}>Guardar</button>
          </>
        }
      >
        {edicion &&
          (COLUMNAS_RICAS.has(edicion.col) ? (
            <TextoEnriquecido id="celda-rica" value={edicion.valor} onChange={v => setEdicion({ ...edicion, valor: v })} minHeight={300} />
          ) : (
            <>
              <textarea className="textarea" style={{ minHeight: 160 }} value={edicion.valor} onChange={e => setEdicion({ ...edicion, valor: e.target.value })} />
              <span style={{ fontSize: 12, color: 'var(--color-text-muted)', alignSelf: 'flex-end' }}>{edicion.valor.length} caracteres</span>
            </>
          ))}
      </Drawer>
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
        Se eliminará de forma permanente, junto con la información que dependa de él (por ejemplo, los criterios de una rúbrica).
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

/** The four person columns of the SharePoint list → assignment role. */
const COLUMNAS_PERSONAS: Array<{ rol: string; label: string; rolUsuario: UserRole }> = [
  { rol: 'asignado', label: 'Persona Asignada', rolUsuario: 'docente' },
  { rol: 'docente', label: 'DocenteyAsesor', rolUsuario: 'docente' },
  { rol: 'monitor_ea', label: 'DCI (Monitor EA)', rolUsuario: 'monitor_ea' },
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
        despuesDe: i === 0 ? (datos?.tabla ? '__persona_dda' : 'dpl_permiteescala') : '__doc_silabo',
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
        despuesDe: i === 0 ? 'dpl_permiteescala' : `__persona_${COLUMNAS_PERSONAS[i - 1].rol}`,
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
          Para ver y editar Persona Asignada, DocenteyAsesor, DCI y DDA, vuelve a ejecutar <b>supabase/schema-flujo.sql</b> en Supabase.
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
  rolUsuario: UserRole
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
      // Make sure the person also holds the role this column needs.
      if (on && !usuario.roles.includes(rolUsuario)) await guardarUsuario({ ...usuario, roles: [...usuario.roles, rolUsuario] })
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
      const u = await guardarUsuario({ nombre: nuevo.nombre, correo: nuevo.correo, roles: [rolUsuario], activo: true })
      await cambiarAsignacion({ cursoId, usuarioId: u.id, rol }, true)
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
