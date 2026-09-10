// src/shared/hooks/useCursos.ts
// React hooks over the Curso (dpl_curso) Web API service.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createCurso,
  deleteCurso,
  getCursoById,
  getCursoCount,
  getCursoCountByCarrera,
  listCursos,
  updateCurso,
  type ListCursosParams,
} from '../services/cursoService'
import type { CreateCursoInput, Curso, UpdateCursoInput } from '../../types/curso'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseCursosResult {
  items: Curso[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListCursosParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useCursos(params?: ListCursosParams): UseCursosResult {
  const [items, setItems] = useState<Curso[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeUnidades } = params ?? {}

  const baseParams = useMemo<ListCursosParams>(
    () => ({ pageSize, filter, orderBy, includeUnidades }),
    [pageSize, filter, orderBy, includeUnidades],
  )

  const run = useCallback(
    async (overrides: Partial<ListCursosParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listCursos({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar los cursos.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListCursosParams>) => run(overrides, false),
    [run],
  )

  useEffect(() => {
    void run(undefined, false)
  }, [run])

  const fetchNextPage = useCallback(async () => {
    if (!nextLink) return
    await run({ nextLink }, false)
  }, [nextLink, run])

  const loadMore = useCallback(async () => {
    if (!nextLink) return
    await run({ nextLink }, true)
  }, [nextLink, run])

  return {
    items,
    totalCount,
    nextLink,
    isLoading,
    error,
    refetch,
    fetchNextPage,
    loadMore,
    hasNextPage: !!nextLink,
  }
}

// ── Single record hook ────────────────────────────────────────────────────────

export interface UseCursoResult {
  curso: Curso | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useCurso(
  id: string | undefined,
  options?: { includeUnidades?: boolean },
): UseCursoResult {
  const [curso, setCurso] = useState<Curso | null>(null)
  const [isLoading, setIsLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)

  const includeUnidades = options?.includeUnidades

  const load = useCallback(async () => {
    if (!id) {
      setCurso(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setCurso(await getCursoById(id, { includeUnidades }))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar el curso.'))
    } finally {
      setIsLoading(false)
    }
  }, [id, includeUnidades])

  useEffect(() => {
    void load()
  }, [load])

  return { curso, isLoading, error, refetch: load }
}

// ── Mutation hook ─────────────────────────────────────────────────────────────

export interface UseCursoMutationsResult {
  create: (payload: CreateCursoInput) => Promise<Curso>
  update: (id: string, payload: UpdateCursoInput) => Promise<Curso>
  remove: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useCursoMutations(): UseCursoMutationsResult {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrap = useCallback(
    async <T>(action: () => Promise<T>, fallbackMessage: string): Promise<T> => {
      setIsSaving(true)
      setError(null)
      try {
        return await action()
      } catch (err) {
        const message = readErrorMessage(err, fallbackMessage)
        setError(message)
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [],
  )

  const create = useCallback(
    (payload: CreateCursoInput) =>
      wrap(() => createCurso(payload), 'No se pudo crear el curso.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateCursoInput) =>
      wrap(() => updateCurso(id, payload), 'No se pudo actualizar el curso.'),
    [wrap],
  )

  const remove = useCallback(
    (id: string) => wrap(() => deleteCurso(id), 'No se pudo eliminar el curso.'),
    [wrap],
  )

  return {
    create,
    update,
    remove,
    isSaving,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}

// ── Count hooks ───────────────────────────────────────────────────────────────

export function useCursoCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getCursoCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de cursos.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useCursoCountByCarrera() {
  const [groups, setGroups] = useState<Array<{ carrera: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getCursoCountByCarrera())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar los cursos por carrera.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
