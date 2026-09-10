import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCursos } from '../shared/hooks/useCursos'
import { buildNombreContainsFilter } from '../shared/services/cursoService'

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

  return (
    <div className="container" style={{ paddingTop: 'var(--space-5)', paddingBottom: 'var(--space-8)' }}>
      <div className="card animate-in" style={{ padding: 'var(--space-4)', marginBottom: 'var(--space-4)' }}>
        <p style={{ fontWeight: 700, marginBottom: 'var(--space-1)' }}>📁 Listado de cursos</p>
        <p className="muted" style={{ fontSize: '0.9rem' }}>
          Selecciona el curso para comenzar el proceso de construcción de la carpeta instruccional.
        </p>
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

      {error && (
        <div className="card" style={{ padding: 'var(--space-4)', borderColor: 'var(--color-danger)' }}>
          <p style={{ color: 'var(--color-danger)', fontWeight: 600, marginBottom: 'var(--space-1)' }}>
            No se pudieron cargar los cursos
          </p>
          <p className="muted" style={{ fontSize: '0.85rem' }}>
            {error} — esto es esperado si estás viendo el sitio en desarrollo local (`localhost`), ya
            que la Web API de Power Pages solo funciona cuando el sitio está desplegado.
          </p>
        </div>
      )}

      {!isLoading && !error && (
        <>
          <p className="muted animate-in" style={{ fontSize: '0.85rem', marginBottom: 'var(--space-3)' }}>
            {totalCount} curso{totalCount === 1 ? '' : 's'}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 'var(--space-3)' }}>
            {items.map(curso => (
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
          {items.length === 0 && (
            <p className="muted">No se encontraron cursos con ese filtro.</p>
          )}
        </>
      )}
    </div>
  )
}
