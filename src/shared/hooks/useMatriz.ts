// src/shared/hooks/useMatriz.ts
// React hooks over the Matriz (dpl_matriz) + Pregunta de Matriz
// (dpl_matrizpregunta) Web API services.
//
// The pair is loaded together: `useMatriz` returns the header and its ordered
// preguntas in a single round trip via $expand, then keeps the grid rows in
// local state so row mutations do not force a refetch of the header.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createMatriz,
  deleteMatriz,
  getMatrizById,
  getMatrizCount,
  getMatrizCountByEstado,
  listMatrizs,
  updateMatriz,
  type ListMatrizsParams,
} from '../services/matrizService'
import {
  createPregunta,
  deletePregunta,
  listPreguntasByMatriz,
  normalizePreguntaOrden,
  reorderPreguntas,
  updatePregunta,
} from '../services/matrizPreguntaService'
import type { CreateMatrizInput, Matriz, UpdateMatrizInput } from '../../types/matriz'
import {
  nextOrden,
  sortPreguntasByOrden,
  type CreateMatrizPreguntaInput,
  type MatrizPregunta,
  type PreguntaOrdenChange,
  type UpdateMatrizPreguntaInput,
} from '../../types/matrizPregunta'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── Matriz + preguntas hook ───────────────────────────────────────────────────

export interface UseMatrizResult {
  /** The Matriz header, or null while loading / when not found. */
  matriz: Matriz | null
  /** Child rows, always sorted by `orden` ascending. */
  preguntas: MatrizPregunta[]
  isLoading: boolean
  error: string | null
  /** Reload the header and its preguntas. */
  refetch: () => Promise<void>
  /** Reload only the preguntas grid, leaving the header untouched. */
  refetchPreguntas: () => Promise<void>

  // ── Mutations ──
  /** Patch the header columns. */
  saveHeader: (payload: UpdateMatrizInput) => Promise<Matriz>
  /** Append a row; `orden` defaults to the next free slot. */
  addPregunta: (
    payload: Omit<CreateMatrizPreguntaInput, 'matrizId'> & { matrizId?: string },
  ) => Promise<MatrizPregunta>
  /** Patch one row in place. */
  editPregunta: (id: string, payload: UpdateMatrizPreguntaInput) => Promise<MatrizPregunta>
  /** Delete one row and renumber the remaining rows to 1..n. */
  removePregunta: (id: string) => Promise<void>
  /** Persist explicit new positions after a drag-and-drop. */
  reorder: (changes: PreguntaOrdenChange[]) => Promise<void>
  /** Renumber the rows to 1..n in the order given (e.g. the grid's current order). */
  applyOrder: (ordered: MatrizPregunta[]) => Promise<void>

  isSaving: boolean
  mutationError: string | null
  clearMutationError: () => void
}

export function useMatriz(
  id: string | undefined,
  options?: { includeSesion?: boolean },
): UseMatrizResult {
  const [matriz, setMatriz] = useState<Matriz | null>(null)
  const [preguntas, setPreguntas] = useState<MatrizPregunta[]>([])
  const [isLoading, setIsLoading] = useState(!!id)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [mutationError, setMutationError] = useState<string | null>(null)

  const includeSesion = options?.includeSesion

  const load = useCallback(async () => {
    if (!id) {
      setMatriz(null)
      setPreguntas([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      // One round trip: header + expanded, ordered child collection.
      const record = await getMatrizById(id, { includePreguntas: true, includeSesion })
      setMatriz(record)
      setPreguntas(record?.preguntas ?? [])

      // A Matriz holds 1–10 rows, so the expand is never expected to truncate.
      // If Dataverse ever returns a cursor, fall back to the standalone query so
      // the grid still shows the complete set.
      if (record?.preguntasNextLink) {
        setPreguntas(await listPreguntasByMatriz(id))
      }
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la matriz.'))
    } finally {
      setIsLoading(false)
    }
  }, [id, includeSesion])

  useEffect(() => {
    void load()
  }, [load])

  const refetchPreguntas = useCallback(async () => {
    if (!id) return
    try {
      setPreguntas(await listPreguntasByMatriz(id))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudieron cargar las preguntas de la matriz.'))
    }
  }, [id])

  const wrap = useCallback(
    async <T>(action: () => Promise<T>, fallbackMessage: string): Promise<T> => {
      setIsSaving(true)
      setMutationError(null)
      try {
        return await action()
      } catch (err) {
        setMutationError(readErrorMessage(err, fallbackMessage))
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [],
  )

  const saveHeader = useCallback(
    (payload: UpdateMatrizInput) =>
      wrap(async () => {
        if (!id) throw new Error('No hay una matriz seleccionada para actualizar.')
        const updated = await updateMatriz(id, payload)
        // updateMatriz refetches without the expand, so keep the loaded rows.
        setMatriz({ ...updated, preguntas })
        return updated
      }, 'No se pudo actualizar la matriz.'),
    [id, preguntas, wrap],
  )

  const addPregunta = useCallback(
    (payload: Omit<CreateMatrizPreguntaInput, 'matrizId'> & { matrizId?: string }) =>
      wrap(async () => {
        const parentId = payload.matrizId ?? id
        if (!parentId) throw new Error('No hay una matriz seleccionada para agregar la pregunta.')

        const created = await createPregunta({
          ...payload,
          matrizId: parentId,
          orden: payload.orden ?? nextOrden(preguntas),
        })
        setPreguntas(prev => sortPreguntasByOrden([...prev, created]))
        return created
      }, 'No se pudo agregar la pregunta a la matriz.'),
    [id, preguntas, wrap],
  )

  const editPregunta = useCallback(
    (preguntaId: string, payload: UpdateMatrizPreguntaInput) =>
      wrap(async () => {
        const updated = await updatePregunta(preguntaId, payload)
        setPreguntas(prev =>
          sortPreguntasByOrden(prev.map(p => (p.id === preguntaId ? updated : p))),
        )
        return updated
      }, 'No se pudo actualizar la pregunta.'),
    [wrap],
  )

  const removePregunta = useCallback(
    (preguntaId: string) =>
      wrap(async () => {
        await deletePregunta(preguntaId)
        const remaining = sortPreguntasByOrden(preguntas.filter(p => p.id !== preguntaId))
        // Close the gap left in dpl_orden so the grid stays 1..n.
        setPreguntas(await normalizePreguntaOrden(remaining))
      }, 'No se pudo eliminar la pregunta.'),
    [preguntas, wrap],
  )

  const reorder = useCallback(
    (changes: PreguntaOrdenChange[]) =>
      wrap(async () => {
        await reorderPreguntas(changes)
        const byId = new Map(changes.map(c => [c.id, c.orden]))
        setPreguntas(prev =>
          sortPreguntasByOrden(prev.map(p => ({ ...p, orden: byId.get(p.id) ?? p.orden }))),
        )
      }, 'No se pudo reordenar las preguntas.'),
    [wrap],
  )

  const applyOrder = useCallback(
    (ordered: MatrizPregunta[]) =>
      wrap(async () => {
        setPreguntas(await normalizePreguntaOrden(ordered))
      }, 'No se pudo guardar el nuevo orden de las preguntas.'),
    [wrap],
  )

  return {
    matriz,
    preguntas,
    isLoading,
    error,
    refetch: load,
    refetchPreguntas,
    saveHeader,
    addPregunta,
    editPregunta,
    removePregunta,
    reorder,
    applyOrder,
    isSaving,
    mutationError,
    clearMutationError: useCallback(() => setMutationError(null), []),
  }
}

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseMatrizsResult {
  items: Matriz[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListMatrizsParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useMatrizs(params?: ListMatrizsParams): UseMatrizsResult {
  const [items, setItems] = useState<Matriz[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includePreguntas, includeSesion } = params ?? {}

  const baseParams = useMemo<ListMatrizsParams>(
    () => ({ pageSize, filter, orderBy, includePreguntas, includeSesion }),
    [pageSize, filter, orderBy, includePreguntas, includeSesion],
  )

  const run = useCallback(
    async (overrides: Partial<ListMatrizsParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listMatrizs({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las matrices.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListMatrizsParams>) => run(overrides, false),
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

// ── Header mutation hook (create / delete outside a loaded record) ────────────

export interface UseMatrizMutationsResult {
  create: (payload: CreateMatrizInput) => Promise<Matriz>
  update: (id: string, payload: UpdateMatrizInput) => Promise<Matriz>
  remove: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useMatrizMutations(): UseMatrizMutationsResult {
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const wrap = useCallback(
    async <T>(action: () => Promise<T>, fallbackMessage: string): Promise<T> => {
      setIsSaving(true)
      setError(null)
      try {
        return await action()
      } catch (err) {
        setError(readErrorMessage(err, fallbackMessage))
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [],
  )

  const create = useCallback(
    (payload: CreateMatrizInput) =>
      wrap(() => createMatriz(payload), 'No se pudo crear la matriz.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateMatrizInput) =>
      wrap(() => updateMatriz(id, payload), 'No se pudo actualizar la matriz.'),
    [wrap],
  )

  const remove = useCallback(
    (id: string) => wrap(() => deleteMatriz(id), 'No se pudo eliminar la matriz.'),
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

export function useMatrizCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getMatrizCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de matrices.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useMatrizCountByEstado() {
  const [groups, setGroups] = useState<Array<{ estado: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getMatrizCountByEstado())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudieron agrupar las matrices por estado.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
