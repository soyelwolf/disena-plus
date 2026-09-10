// src/shared/hooks/useUnidades.ts
// React hooks over the Unidad (dpl_unidad) Web API service.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createUnidad,
  deleteUnidad,
  getUnidadById,
  getUnidadCount,
  getUnidadCountGroupedByCurso,
  listUnidades,
  listUnidadesByCurso,
  setUnidadCurso,
  updateUnidad,
  type ListUnidadesParams,
} from '../services/unidadService'
import type { CreateUnidadInput, Unidad, UpdateUnidadInput } from '../../types/unidad'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseUnidadesResult {
  items: Unidad[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListUnidadesParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useUnidades(params?: ListUnidadesParams): UseUnidadesResult {
  const [items, setItems] = useState<Unidad[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeCurso, includeSesiones } = params ?? {}

  const baseParams = useMemo<ListUnidadesParams>(
    () => ({ pageSize, filter, orderBy, includeCurso, includeSesiones }),
    [pageSize, filter, orderBy, includeCurso, includeSesiones],
  )

  const run = useCallback(
    async (overrides: Partial<ListUnidadesParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listUnidades({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las unidades.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListUnidadesParams>) => run(overrides, false),
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

// ── Unidades of one Curso ─────────────────────────────────────────────────────

export interface UseUnidadesByCursoResult {
  items: Unidad[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

/**
 * Load the Unidad records that belong to one Curso.
 * Passing `undefined` as the cursoId leaves the hook idle (no request).
 */
export function useUnidadesByCurso(
  cursoId: string | undefined,
  options?: Omit<ListUnidadesParams, 'filter' | 'nextLink'>,
): UseUnidadesByCursoResult {
  const [items, setItems] = useState<Unidad[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(!!cursoId)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, orderBy, includeCurso, includeSesiones } = options ?? {}

  const baseOptions = useMemo(
    () => ({ pageSize, orderBy, includeCurso, includeSesiones }),
    [pageSize, orderBy, includeCurso, includeSesiones],
  )

  const run = useCallback(
    async (cursor: string | undefined, append: boolean) => {
      if (!cursoId) {
        setItems([])
        setTotalCount(0)
        setNextLink(undefined)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const result = await listUnidadesByCurso(cursoId, {
          ...baseOptions,
          ...(cursor ? { nextLink: cursor } : {}),
        })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las unidades del curso.'))
      } finally {
        setIsLoading(false)
      }
    },
    [cursoId, baseOptions],
  )

  useEffect(() => {
    void run(undefined, false)
  }, [run])

  const refetch = useCallback(() => run(undefined, false), [run])

  const loadMore = useCallback(async () => {
    if (!nextLink) return
    await run(nextLink, true)
  }, [nextLink, run])

  return {
    items,
    totalCount,
    nextLink,
    isLoading,
    error,
    refetch,
    loadMore,
    hasNextPage: !!nextLink,
  }
}

// ── Single record hook ────────────────────────────────────────────────────────

export interface UseUnidadResult {
  unidad: Unidad | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useUnidad(
  id: string | undefined,
  options?: { includeCurso?: boolean; includeSesiones?: boolean },
): UseUnidadResult {
  const [unidad, setUnidad] = useState<Unidad | null>(null)
  const [isLoading, setIsLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)

  const includeCurso = options?.includeCurso
  const includeSesiones = options?.includeSesiones

  const load = useCallback(async () => {
    if (!id) {
      setUnidad(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setUnidad(await getUnidadById(id, { includeCurso, includeSesiones }))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la unidad.'))
    } finally {
      setIsLoading(false)
    }
  }, [id, includeCurso, includeSesiones])

  useEffect(() => {
    void load()
  }, [load])

  return { unidad, isLoading, error, refetch: load }
}

// ── Mutation hook ─────────────────────────────────────────────────────────────

export interface UseUnidadMutationsResult {
  create: (payload: CreateUnidadInput) => Promise<Unidad>
  update: (id: string, payload: UpdateUnidadInput) => Promise<Unidad>
  remove: (id: string) => Promise<void>
  /** Re-parent the Unidad to another Curso, or pass null to clear the lookup. */
  reassignCurso: (id: string, cursoId: string | null) => Promise<Unidad>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useUnidadMutations(): UseUnidadMutationsResult {
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
    (payload: CreateUnidadInput) =>
      wrap(() => createUnidad(payload), 'No se pudo crear la unidad.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateUnidadInput) =>
      wrap(() => updateUnidad(id, payload), 'No se pudo actualizar la unidad.'),
    [wrap],
  )

  const remove = useCallback(
    (id: string) => wrap(() => deleteUnidad(id), 'No se pudo eliminar la unidad.'),
    [wrap],
  )

  const reassignCurso = useCallback(
    (id: string, cursoId: string | null) =>
      wrap(() => setUnidadCurso(id, cursoId), 'No se pudo reasignar el curso de la unidad.'),
    [wrap],
  )

  return {
    create,
    update,
    remove,
    reassignCurso,
    isSaving,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}

// ── Count hooks ───────────────────────────────────────────────────────────────

export function useUnidadCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getUnidadCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de unidades.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useUnidadCountByCurso() {
  const [groups, setGroups] = useState<
    Array<{ cursoId: string; cursoNombre: string; count: number }>
  >([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getUnidadCountGroupedByCurso())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar las unidades por curso.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
