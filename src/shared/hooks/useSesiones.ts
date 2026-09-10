// src/shared/hooks/useSesiones.ts
// React hooks over the Sesión / Elemento (dpl_sesion) Web API service.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  buildUnidadFilter,
  combineFilters,
  createSesion,
  deleteSesion,
  getSesionById,
  getSesionCount,
  getSesionCountByUnidad,
  listSesiones,
  updateSesion,
  type ListSesionesParams,
} from '../services/sesionService'
import type { CreateSesionInput, Sesion, UpdateSesionInput } from '../../types/sesion'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseSesionesResult {
  items: Sesion[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListSesionesParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useSesiones(
  params?: ListSesionesParams & {
    /** Set to false to keep the hook idle (no request, empty list). Default true. */
    enabled?: boolean
  },
): UseSesionesResult {
  const [items, setItems] = useState<Sesion[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeUnidad, enabled = true } = params ?? {}
  const [isLoading, setIsLoading] = useState(enabled)

  const baseParams = useMemo<ListSesionesParams>(
    () => ({ pageSize, filter, orderBy, includeUnidad }),
    [pageSize, filter, orderBy, includeUnidad],
  )

  const run = useCallback(
    async (overrides: Partial<ListSesionesParams> | undefined, append: boolean) => {
      if (!enabled) {
        setItems([])
        setTotalCount(0)
        setNextLink(undefined)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const result = await listSesiones({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las sesiones.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams, enabled],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListSesionesParams>) => run(overrides, false),
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

// ── Sessions of one Unidad ────────────────────────────────────────────────────

/**
 * The sessions belonging to a single parent Unidad.
 * Passing `undefined` as the unidadId keeps the hook idle (empty list, not loading).
 */
export function useSesionesByUnidad(
  unidadId: string | undefined,
  params?: Omit<ListSesionesParams, 'filter'> & { extraFilter?: string },
): UseSesionesResult {
  const { pageSize, orderBy, includeUnidad, extraFilter } = params ?? {}

  const filter = useMemo(
    () => (unidadId ? combineFilters(buildUnidadFilter(unidadId), extraFilter) : undefined),
    [unidadId, extraFilter],
  )

  // With no Unidad selected the hook stays idle — no unfiltered fetch of every session.
  return useSesiones({ pageSize, orderBy, includeUnidad, filter, enabled: !!unidadId })
}

// ── Single record hook ────────────────────────────────────────────────────────

export interface UseSesionResult {
  sesion: Sesion | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useSesion(
  id: string | undefined,
  options?: { includeUnidad?: boolean },
): UseSesionResult {
  const [sesion, setSesion] = useState<Sesion | null>(null)
  const [isLoading, setIsLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)

  const includeUnidad = options?.includeUnidad

  const load = useCallback(async () => {
    if (!id) {
      setSesion(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setSesion(await getSesionById(id, { includeUnidad }))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la sesión.'))
    } finally {
      setIsLoading(false)
    }
  }, [id, includeUnidad])

  useEffect(() => {
    void load()
  }, [load])

  return { sesion, isLoading, error, refetch: load }
}

// ── Mutation hook ─────────────────────────────────────────────────────────────

export interface UseSesionMutationsResult {
  create: (payload: CreateSesionInput) => Promise<Sesion>
  update: (id: string, payload: UpdateSesionInput) => Promise<Sesion>
  remove: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useSesionMutations(): UseSesionMutationsResult {
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
    (payload: CreateSesionInput) =>
      wrap(() => createSesion(payload), 'No se pudo crear la sesión.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateSesionInput) =>
      wrap(() => updateSesion(id, payload), 'No se pudo actualizar la sesión.'),
    [wrap],
  )

  const remove = useCallback(
    (id: string) => wrap(() => deleteSesion(id), 'No se pudo eliminar la sesión.'),
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

export function useSesionCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getSesionCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de sesiones.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useSesionCountByUnidad() {
  const [groups, setGroups] = useState<Array<{ unidadId: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getSesionCountByUnidad())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar las sesiones por unidad.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
