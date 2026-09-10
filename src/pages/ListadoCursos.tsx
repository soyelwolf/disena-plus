import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCursos } from '../shared/hooks/useCursos'
import { buildNombreContainsFilter } from '../shared/services/cursoService'
import { MOCK_CURSO } from '../shared/mockData'
import type { Curso } from '../types/curso'

export default function ListadoCursos() {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')

  useEffect(() => {
    document.title = 'Listado de Cursos — Diseña+'
  }, [])

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const filter = useMemo(
    () => (debounced ? buildNombreContainsFilter(debounced) : undefined),
    [debounced],
  )

  const { items, isLoading, error, totalCount } = useCursos({ filter, pageSize: 50 })

  // The Web API only exists once the site is deployed to Power Pages — running
  // via `npm run dev` on localhost has no `/_api/` backend. Fall back to a
  // sample course so the rest of the flow (hub, secciones, detail/editing) can
  // still be designed and demoed locally.
  const usingMock = !isLoading && !!error
  const displayItems: Curso[] = usingMock
    ? [MOCK_CURSO].filter(c => !debounced || c.nombre.toLowerCase().includes(debounced.toLowerCase()))
    : items

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <div className="card animate-in row-between" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <div>
          <p style={{ fontWeight: 700, marginBottom: 'var(--space-1)' }}>📁 Listado de cursos</p>
          <p className="muted" style={{ fontSize: '0.9rem' }}>
            Selecciona el curso para comenzar el proceso de construcción de la carpeta instruccional.
          </p>
        </div>
        {usingMock && <span className="badge badge-warning">Datos de ejemplo (local)</span>}
      </div>

      <div className="animate-in" style={{ marginBottom: 'var(--space-4)' }}>
        <label htmlFor="filtro-curso" className="sr-only">Filtrar por curso</label>
        <input
          id="filtro-curso"
          type="search"
          placeholder="Filtrar por nombre de curso…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {isLoading && <p className="muted">Cargando cursos…</p>}

      {!isLoading && (
        <>
          <p className="muted animate-in" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
            {usingMock ? displayItems.length : totalCount} curso{(usingMock ? displayItems.length : totalCount) === 1 ? '' : 's'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
            {displayItems.map(curso => (
              <Link
                key={curso.id}
                to={`/cursos/${curso.id}`}
                className="card card-interactive animate-in"
                style={{ padding: 'var(--space-3)', display: 'block' }}
              >
                <p style={{ fontFamily: 'var(--font-heading)', fontWeight: 700 }}>{curso.nombre}</p>
                <p className="mono muted" style={{ fontSize: '0.8rem', margin: 'var(--space-1) 0' }}>
                  {curso.codigoCatalogo} · {curso.tipoEnsenanza}
                </p>
                <p className="muted" style={{ fontSize: '0.85rem' }}>{curso.carrera}</p>
              </Link>
            ))}
          </div>
          {displayItems.length === 0 && (
            <p className="muted">No se encontraron cursos con ese filtro.</p>
          )}
        </>
      )}
    </div>
  )
}
