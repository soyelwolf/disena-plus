// src/shared/hooks/useConsignas.ts
// React hooks over the Consigna (dpl_consigna) Web API service.
//
// The Consigna rich text fields (queSeEvaluara, indicacionGeneral,
// indicacionesEspecificas, recomendaciones, anexo) are plain HTML strings.
// These hooks move them around untouched — the rich text editor/viewer component
// owns sanitization and rendering.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createConsigna,
  deleteConsigna,
  getConsignaById,
  getConsignaCount,
  getConsignaCountByEstado,
  getConsignaCountBySesion,
  listConsignas,
  listConsignasBySesion,
  updateConsigna,
  updateConsignaRichText,
  type ConsignaRichTextField,
  type ListConsignasParams,
} from '../services/consignaService'
import type {
  Consigna,
  CreateConsignaInput,
  UpdateConsignaInput,
} from '../../types/consigna'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseConsignasResult {
  items: Consigna[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListConsignasParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useConsignas(params?: ListConsignasParams): UseConsignasResult {
  const [items, setItems] = useState<Consigna[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeSesion, includeRichText } = params ?? {}

  const baseParams = useMemo<ListConsignasParams>(
    () => ({ pageSize, filter, orderBy, includeSesion, includeRichText }),
    [pageSize, filter, orderBy, includeSesion, includeRichText],
  )

  const run = useCallback(
    async (overrides: Partial<ListConsignasParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listConsignas({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las consignas.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListConsignasParams>) => run(overrides, false),
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

// ── Consignas of one Sesion ───────────────────────────────────────────────────

export interface UseConsignasBySesionResult {
  items: Consigna[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

/**
 * Load the Consignas that belong to one Sesion.
 * Rich text (HTML) columns are included by default — a Sesion has few Consignas
 * and the caller normally renders their content.
 */
export function useConsignasBySesion(
  sesionId: string | undefined,
  options?: {
    pageSize?: number
    orderBy?: string
    includeSesion?: boolean
    includeRichText?: boolean
  },
): UseConsignasBySesionResult {
  const [items, setItems] = useState<Consigna[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(!!sesionId)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, orderBy, includeSesion, includeRichText } = options ?? {}

  const run = useCallback(
    async (cursor: string | undefined, append: boolean) => {
      if (!sesionId) {
        setItems([])
        setTotalCount(0)
        setNextLink(undefined)
        setIsLoading(false)
        return
      }
      setIsLoading(true)
      setError(null)
      try {
        const result = await listConsignasBySesion(sesionId, {
          pageSize,
          orderBy,
          includeSesion,
          includeRichText,
          nextLink: cursor,
        })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las consignas de la sesión.'))
      } finally {
        setIsLoading(false)
      }
    },
    [sesionId, pageSize, orderBy, includeSesion, includeRichText],
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

export interface UseConsignaResult {
  consigna: Consigna | null
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>
}

export function useConsigna(
  id: string | undefined,
  options?: { includeSesion?: boolean },
): UseConsignaResult {
  const [consigna, setConsigna] = useState<Consigna | null>(null)
  const [isLoading, setIsLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)

  const includeSesion = options?.includeSesion

  const load = useCallback(async () => {
    if (!id) {
      setConsigna(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setConsigna(await getConsignaById(id, { includeSesion }))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la consigna.'))
    } finally {
      setIsLoading(false)
    }
  }, [id, includeSesion])

  useEffect(() => {
    void load()
  }, [load])

  return { consigna, isLoading, error, refetch: load }
}

// ── Mutation hook ─────────────────────────────────────────────────────────────

export interface UseConsignaMutationsResult {
  create: (payload: CreateConsignaInput) => Promise<Consigna>
  update: (id: string, payload: UpdateConsignaInput) => Promise<Consigna>
  /** Save one rich text (HTML) column on its own — for per-field editor autosave. */
  saveRichText: (
    id: string,
    field: ConsignaRichTextField,
    html: string,
  ) => Promise<Consigna>
  remove: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useConsignaMutations(): UseConsignaMutationsResult {
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
    (payload: CreateConsignaInput) =>
      wrap(() => createConsigna(payload), 'No se pudo crear la consigna.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateConsignaInput) =>
      wrap(() => updateConsigna(id, payload), 'No se pudo actualizar la consigna.'),
    [wrap],
  )

  const saveRichText = useCallback(
    (id: string, field: ConsignaRichTextField, html: string) =>
      wrap(
        () => updateConsignaRichText(id, field, html),
        'No se pudo guardar el contenido de la consigna.',
      ),
    [wrap],
  )

  const remove = useCallback(
    (id: string) => wrap(() => deleteConsigna(id), 'No se pudo eliminar la consigna.'),
    [wrap],
  )

  return {
    create,
    update,
    saveRichText,
    remove,
    isSaving,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}

// ── Count hooks ───────────────────────────────────────────────────────────────

export function useConsignaCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getConsignaCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de consignas.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useConsignaCountByEstado() {
  const [groups, setGroups] = useState<Array<{ estado: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getConsignaCountByEstado())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar las consignas por estado.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}

export function useConsignaCountBySesion() {
  const [groups, setGroups] = useState<Array<{ sesionId: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getConsignaCountBySesion())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar las consignas por sesión.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
