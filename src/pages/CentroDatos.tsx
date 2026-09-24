import { useCallback, useEffect, useMemo, useState } from 'react'
import Icon from '../components/Icon'
import TextoEnriquecido from '../components/TextoEnriquecido'
import { esHtml, textoPlano } from '../shared/textoRico'
import { Cargando, Drawer, ErrorPanel, Modal, useToast } from '../components/ui'
import { ROLE_LABELS, type UserRole } from '../shared/AuthContext'
import { capitalizar, cambiarAsignacion, guardarUsuario, listarUsuarios, type Asignacion, type UsuarioAdmin } from '../shared/academico'
import {
  GRUPOS,
  REFERENCIAS,
  TABLAS,
  actualizarCelda,
  cargarNombres,
  cargarTabla,
  columnasVisibles,
  descargarCsv,
  eliminarFila,
  etiquetaColumna,
  type TablaConfig,
} from '../shared/centroDatos'
import { supabase } from '../shared/supabaseClient'

const USUARIOS = '__usuarios__'

export default function CentroDatos() {
  const [vista, setVista] = useState<string>(USUARIOS)
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
        <nav className="datos-menu" aria-label="Tablas">
          <span className="datos-grupo">Administración</span>
          <button className={`datos-item${vista === USUARIOS ? ' active' : ''}`} onClick={() => setVista(USUARIOS)}>
            Usuarios y cursos asignados
          </button>
          {GRUPOS.map(g => (
            <div key={g} style={{ display: 'flex', flexDirection: 'column' }}>
              <span className="datos-grupo">{g}</span>
              {TABLAS.filter(t => t.grupo === g).map(t => (
                <button key={t.tabla} className={`datos-item${vista === t.tabla ? ' active' : ''}`} onClick={() => setVista(t.tabla)}>
                  {t.titulo}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div style={{ flex: 1, minWidth: 0 }}>
          {vista === USUARIOS ? <UsuariosPanel /> : cfg && <TablaEditor key={cfg.tabla} cfg={cfg} />}
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

function TablaEditor({ cfg }: { cfg: TablaConfig }) {
  const toast = useToast()
  const [filas, setFilas] = useState<Array<Record<string, unknown>> | null>(null)
  const [existe, setExiste] = useState(true)
  const [nombres, setNombres] = useState<Map<string, string>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [limite, setLimite] = useState(PAGINA)
  const [edicion, setEdicion] = useState<{ fila: Record<string, unknown>; col: string; valor: string } | null>(null)
  const [borrar, setBorrar] = useState<Record<string, unknown> | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const [t, n] = await Promise.all([cargarTabla(cfg), cargarNombres()])
      setExiste(t.existe)
      setFilas(t.filas)
      setNombres(n)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido.')
    }
  }, [cfg])
  useEffect(() => {
    cargar()
  }, [cargar])

  const columnas = useMemo(() => (filas ? columnasVisibles(filas, cfg) : []), [filas, cfg])
  const texto = useCallback(
    (f: Record<string, unknown>, c: string): string => {
      const v = f[c]
      if (v === null || v === undefined) return ''
      if (REFERENCIAS[c] && typeof v === 'string') return nombres.get(v) ?? v
      if (typeof v === 'boolean') return v ? 'Sí' : 'No'
      if (Array.isArray(v)) return v.join(', ')
      return typeof v === 'string' && esHtml(v) ? textoPlano(v) : String(v)
    },
    [nombres],
  )
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
          onClick={() => descargarCsv(cfg.titulo.replace(/\s+/g, '_').toUpperCase(), columnas, filtradas, texto)}
        >
          <Icon name="download" size={16} />Descargar Excel
        </button>
      </div>

      <div className="datos-tabla-wrap">
        <table className="datos-tabla">
          <thead>
            <tr>
              {columnas.map(c => <th key={c}>{etiquetaColumna(c)}</th>)}
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {filtradas.slice(0, limite).map(f => (
              <tr key={f[cfg.pk] as string}>
                {columnas.map(c => {
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
const ROLES_CURSO: Array<{ rol: string; label: string }> = [
  { rol: 'docente', label: 'Docente / Asesor' },
  { rol: 'monitor_ea', label: 'Monitor EA' },
  { rol: 'dda', label: 'DDA' },
]

interface CursoMin {
  id: string
  nombre: string
  codigo: string
  tipo: string
}

function UsuariosPanel() {
  const toast = useToast()
  const [datos, setDatos] = useState<{ tabla: boolean; usuarios: UsuarioAdmin[]; asignaciones: Asignacion[] } | null>(null)
  const [cursos, setCursos] = useState<CursoMin[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [editando, setEditando] = useState<UsuarioAdmin | null>(null)
  const [asignando, setAsignando] = useState<UsuarioAdmin | null>(null)

  const cargar = useCallback(async () => {
    try {
      const [d, { data: cs }] = await Promise.all([
        listarUsuarios(),
        supabase.from('dpl_curso').select('dpl_cursoid, dpl_nombrecurso, dpl_codigocatalogo, dpl_tipoensenanza').order('dpl_nombrecurso'),
      ])
      setDatos(d)
      setCursos((cs ?? []).map(c => ({ id: c.dpl_cursoid, nombre: capitalizar(c.dpl_nombrecurso), codigo: c.dpl_codigocatalogo ?? '', tipo: c.dpl_tipoensenanza ?? '' })))
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
                  <button className="link-btn" onClick={() => setAsignando(u)}>{n} {n === 1 ? 'curso' : 'cursos'} · Asignar</button>
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

      {asignando && (
        <AsignarCursos
          usuario={asignando}
          cursos={cursos}
          asignaciones={datos.asignaciones}
          onClose={() => setAsignando(null)}
          onCambio={cargar}
        />
      )}
    </div>
  )
}

function AsignarCursos(props: {
  usuario: UsuarioAdmin
  cursos: CursoMin[]
  asignaciones: Asignacion[]
  onClose: () => void
  onCambio: () => void
}) {
  const { usuario, cursos, asignaciones, onClose, onCambio } = props
  const toast = useToast()
  const [busqueda, setBusqueda] = useState('')
  const tiene = (cursoId: string, rol: string) => asignaciones.some(a => a.usuarioId === usuario.id && a.cursoId === cursoId && a.rol === rol)
  const q = busqueda.trim().toLowerCase()
  const lista = cursos.filter(c => !q || c.nombre.toLowerCase().includes(q) || c.codigo.toLowerCase().includes(q))

  const cambiar = async (cursoId: string, rol: string, on: boolean) => {
    try {
      await cambiarAsignacion({ cursoId, usuarioId: usuario.id, rol }, on)
      onCambio()
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo actualizar.', 'error')
    }
  }

  return (
    <Drawer open onClose={onClose} title={`Cursos de ${usuario.nombre}`} footer={<button className="btn btn-primary" onClick={onClose}>Listo</button>}>
      <div className="input-box">
        <input type="search" placeholder="Buscar curso por nombre o código" value={busqueda} onChange={e => setBusqueda(e.target.value)} aria-label="Buscar curso" />
        <span style={{ color: 'var(--color-primary)', display: 'flex' }}><Icon name="search" size={18} strokeWidth={2} /></span>
      </div>
      {lista.map(c => (
        <div key={c.id} style={{ borderBottom: '1px solid var(--color-border)', paddingBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>{c.nombre}</span>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>{c.codigo} · {c.tipo}</span>
          <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
            {ROLES_CURSO.map(r => (
              <label key={r.rol} className="radio">
                <input type="checkbox" checked={tiene(c.id, r.rol)} onChange={e => cambiar(c.id, r.rol, e.target.checked)} />
                {r.label}
              </label>
            ))}
          </div>
        </div>
      ))}
    </Drawer>
  )
}
