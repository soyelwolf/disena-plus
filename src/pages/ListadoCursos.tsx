import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCursos } from '../shared/hooks/useCursos'
import { MOCK_CURSO } from '../shared/mockData'
import Icon from '../components/Icon'
import { useAuth } from '../shared/AuthContext'
import { getCursosAsignados } from '../shared/academico'
import { DOCUMENTOS, listarDocumentos, nombreDescarga, type DocumentoCurso, type TipoDocumento } from '../shared/documentosCurso'
import VisorPdf from '../components/VisorPdf'
import type { Curso } from '../types/curso'

const normalizar = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** "GESTION II" → "Gestion II" (the source data is all caps; roman numerals stay upper). */
const capitalizar = (s: string) =>
  (s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()).replace(
    /\b(i{1,3}|iv|vi{0,3}|ix|x)\b/g,
    m => m.toUpperCase(),
  )

export default function ListadoCursos() {
  const navigate = useNavigate()
  const { user, can } = useAuth()
  // Only Administradores see every course; everyone else sees their assigned ones.
  // Everyone — administrators included — starts with just their assigned
  // courses; administrators can switch to the whole catalogue.
  const esAdmin = can('ver_todo')
  const [mostrarTodos, setMostrarTodos] = useState(false)
  const verTodo = (esAdmin && mostrarTodos) || !user?.usuarioId
  const [asignados, setAsignados] = useState<Set<string> | null>(null)
  useEffect(() => {
    if (!user?.usuarioId) return
    getCursosAsignados(user.usuarioId).then(setAsignados).catch(() => setAsignados(new Set()))
  }, [user?.usuarioId])
  const [busqueda, setBusqueda] = useState('')
  const [tipo, setTipo] = useState('')
  const [docs, setDocs] = useState<Map<string, DocumentoCurso>>(new Map())
  const [visor, setVisor] = useState<{ doc: DocumentoCurso; curso: string } | null>(null)
  useEffect(() => {
    listarDocumentos().then(setDocs).catch(() => setDocs(new Map()))
  }, [])

  useEffect(() => {
    document.title = 'Cursos — Diseña+'
  }, [])

  // The catalog is small (hundreds of rows): load it once and filter locally so
  // search-by-name-or-code and the modality filter respond instantly.
  const { items, isLoading, error } = useCursos({ pageSize: 1000 })
  const todos: Curso[] = !isLoading && error ? [MOCK_CURSO] : items
  const cursos = useMemo(
    () => (verTodo ? todos : todos.filter(c => asignados?.has(c.id))),
    [todos, verTodo, asignados],
  )
  const cargando = isLoading || (!verTodo && asignados === null)

  const tipos = useMemo(
    () => [...new Set(cursos.map(c => c.tipoEnsenanza).filter(Boolean))].sort() as string[],
    [cursos],
  )

  const filtrados = useMemo(() => {
    const q = normalizar(busqueda.trim())
    return cursos.filter(c => {
      if (tipo && c.tipoEnsenanza !== tipo) return false
      if (!q) return true
      return [c.nombre, c.codigoCatalogo, c.idCursoText].some(v => v && normalizar(v).includes(q))
    })
  }, [cursos, busqueda, tipo])

  const hayFiltros = busqueda !== '' || tipo !== ''

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div className="row-between">
        <h1 style={{ fontSize: 28, fontWeight: 700 }}>{verTodo && esAdmin ? 'Todos los cursos' : 'Mis cursos'}</h1>
        {esAdmin && user?.usuarioId && (
          <label className="radio" title="Solo para administradores">
            <input type="checkbox" checked={mostrarTodos} onChange={e => setMostrarTodos(e.target.checked)} />
            Ver todos los cursos (administrador)
          </label>
        )}
        {!isLoading && error && <span className="badge badge-warning">Sin conexión a la base · datos de ejemplo</span>}
      </div>

      <div className="panel" style={{ padding: '18px 20px', display: 'flex', alignItems: 'flex-end', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 380px', maxWidth: 560 }}>
          <label className="field-label" htmlFor="buscar-curso">Curso</label>
          <div className="input-box">
            <input
              id="buscar-curso"
              type="search"
              placeholder="Ingresa y selecciona el nombre o código del curso"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
            />
            <span style={{ color: 'var(--color-primary)', display: 'flex' }}>
              <Icon name="search" size={20} strokeWidth={2} />
            </span>
          </div>
        </div>
        <div style={{ flex: '0 1 270px' }}>
          <label className="field-label" htmlFor="tipo-ensenanza">Tipo de enseñanza</label>
          <select
            id="tipo-ensenanza"
            value={tipo}
            onChange={e => setTipo(e.target.value)}
            style={{ height: 44, borderColor: 'var(--color-input-border)', borderRadius: 4 }}
          >
            <option value="">Selecciona una opción</option>
            {tipos.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-outline"
          style={{ marginLeft: 'auto', height: 44, padding: '0 22px' }}
          disabled={!hayFiltros}
          onClick={() => {
            setBusqueda('')
            setTipo('')
          }}
        >
          Limpiar
        </button>
      </div>

      {cargando ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, padding: '96px 0' }}>
          <span style={{ fontSize: 14, fontWeight: 700 }}>Buscando resultados</span>
          <span className="spinner-card">
            <span className="spinner" style={{ display: 'flex', color: 'var(--color-text)' }}>
              <Icon name="spinner" size={28} strokeWidth={2.4} />
            </span>
          </span>
        </div>
      ) : (
        <>
          <span style={{ fontSize: 14, color: '#3d434a' }}>
            Cursos: {filtrados.length} de {cursos.length}
          </span>

          {filtrados.length === 0 ? (
            <div className="panel" style={{ padding: '56px 24px', textAlign: 'center', color: 'var(--color-text-muted)' }}>
              {cursos.length === 0
                ? 'Aún no tienes cursos asignados. Pide al administrador que te asigne tus cursos.'
                : 'No encontramos cursos con esos filtros.'}
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Curso</th>
                  <th style={{ width: 280 }}>Enseñanza</th>
                  <th className="icon-cell">Sílabo</th>
                  <th className="icon-cell" style={{ width: 150 }}>Formato de orientación</th>
                  <th className="icon-cell">Ingresar</th>
                </tr>
              </thead>
              <tbody>
                {filtrados.map((c, i) => (
                  <tr
                    key={c.id}
                    style={{ cursor: 'pointer', animationDelay: `${Math.min(i, 12) * 30}ms` }}
                    onClick={() => navigate(`/cursos/${c.id}`)}
                  >
                    <td>
                      <div style={{ fontSize: 15 }}>{capitalizar(c.nombre)}</div>
                      <div style={{ fontSize: 13, color: '#3d434a' }}>{c.codigoCatalogo}</div>
                    </td>
                    <td>{c.tipoEnsenanza}</td>
                    {(['silabo', 'formato'] as TipoDocumento[]).map(t => {
                      const doc = docs.get(`${c.id}|${t}`)
                      const nombre = DOCUMENTOS[t].label.toLowerCase()
                      return (
                        <td key={t} className="icon-cell">
                          <button
                            className="icon-btn"
                            disabled={!doc}
                            title={doc ? `Ver ${nombre}` : `${DOCUMENTOS[t].label} aún no cargado`}
                            aria-label={doc ? `Ver ${nombre} de ${c.nombre}` : `${DOCUMENTOS[t].label} de ${c.nombre} aún no cargado`}
                            onClick={e => {
                              e.stopPropagation()
                              if (doc) setVisor({ doc, curso: capitalizar(c.nombre) })
                            }}
                          >
                            <Icon name="eye" size={22} />
                          </button>
                        </td>
                      )
                    })}
                    <td className="icon-cell">
                      <button
                        className="icon-btn go"
                        aria-label={`Ingresar a ${c.nombre}`}
                        onClick={e => {
                          e.stopPropagation()
                          navigate(`/cursos/${c.id}`)
                        }}
                      >
                        <Icon name="arrowRight" size={22} strokeWidth={2} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {visor && (
            <VisorPdf
              titulo={`${DOCUMENTOS[visor.doc.tipo].label} · ${visor.curso}`}
              url={visor.doc.url}
              nombreArchivo={nombreDescarga(visor.doc.tipo, visor.curso)}
              onClose={() => setVisor(null)}
            />
          )}
        </>
      )}
    </div>
  )
}
