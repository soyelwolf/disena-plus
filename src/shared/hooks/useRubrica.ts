// src/shared/hooks/useRubrica.ts
// React hooks over the Rúbrica (dpl_rubrica) + Criterio de Rúbrica
// (dpl_rubricacriterio) Web API services.
//
// `useRubrica` is the hook a rubric detail screen uses: give it a rubric ID or a
// sesión ID and it returns the header plus the full, `orden`-sorted criteria
// array, together with the mutation helpers an editable grid needs (add, update,
// remove, reorder rows). Row mutations update local state optimistically-ish —
// the affected row is replaced with the server's response, so the grid always
// shows persisted values without refetching the whole rubric.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createRubrica,
  deleteRubrica,
  getRubricaById,
  getRubricaBySesionId,
  getRubricaCount,
  getRubricaCountByEstado,
  listRubricas,
  updateRubrica,
  type ListRubricasParams,
} from '../services/rubricaService'
import {
  createRubricaCriterio,
  deleteRubricaCriterio,
  listCriteriosByRubrica,
  reorderRubricaCriterios,
  updateRubricaCriterio,
} from '../services/rubricaCriterioService'
import {
  sortCriteriosByOrden,
  type CreateRubricaCriterioInput,
  type CreateRubricaInput,
  type Rubrica,
  type RubricaCriterio,
  type UpdateRubricaCriterioInput,
  type UpdateRubricaInput,
} from '../../types/rubrica'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── Rubric detail hook (header + criteria) ────────────────────────────────────

/**
 * Identify the rubric to load. Provide exactly one of the two:
 * - `rubricaId` — load that rubric directly
 * - `sesionId`  — load the most recent rubric attached to that Sesión
 */
export interface UseRubricaTarget {
  rubricaId?: string
  sesionId?: string
}

export interface UseRubricaResult {
  /** Rubric header, or null while loading / when none exists. */
  rubrica: Rubrica | null
  /** Child criterion rows, always sorted by `orden` ascending. */
  criterios: RubricaCriterio[]
  /** Sum of the "Estándar esperado" scores — the rubric's maximum total. */
  puntajeMaximo: number
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>

  // Header mutations
  /** Patch the rubric header. */
  updateHeader: (payload: UpdateRubricaInput) => Promise<Rubrica>

  // Criterion row mutations (editable grid)
  /** Append a criterion row. `orden` defaults to the next free position. */
  addCriterio: (
    payload: Omit<CreateRubricaCriterioInput, 'rubricaId'> &
      Partial<Pick<CreateRubricaCriterioInput, 'rubricaId'>>,
  ) => Promise<RubricaCriterio>
  /** Patch one criterion row. Rich text (HTML) is sent through unchanged. */
  updateCriterio: (
    criterioId: string,
    payload: UpdateRubricaCriterioInput,
  ) => Promise<RubricaCriterio>
  /** Delete one criterion row. */
  removeCriterio: (criterioId: string) => Promise<void>
  /** Persist a new row order; pass the criterion IDs in their display order. */
  reorderCriterios: (orderedIds: string[]) => Promise<void>
  /** Reload only the criteria (cheaper than a full refetch). */
  refetchCriterios: () => Promise<void>

  /** True while any mutation above is in flight. */
  isSaving: boolean
  /** Last mutation error, independent of the load `error`. */
  saveError: string | null
  clearSaveError: () => void
}

export function useRubrica(target?: UseRubricaTarget): UseRubricaResult {
  const rubricaId = target?.rubricaId
  const sesionId = target?.sesionId

  const [rubrica, setRubrica] = useState<Rubrica | null>(null)
  const [isLoading, setIsLoading] = useState(!!(rubricaId || sesionId))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!rubricaId && !sesionId) {
      setRubrica(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const loaded = rubricaId
        ? await getRubricaById(rubricaId, { includeCriterios: true })
        : await getRubricaBySesionId(sesionId!, { includeCriterios: true })
      setRubrica(loaded)
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la rúbrica.'))
    } finally {
      setIsLoading(false)
    }
  }, [rubricaId, sesionId])

  useEffect(() => {
    void load()
  }, [load])

  // The rubric actually loaded — may differ from `rubricaId` when resolved by sesión.
  const loadedRubricaId = rubrica?.id

  const refetchCriterios = useCallback(async () => {
    if (!loadedRubricaId) return
    const criterios = await listCriteriosByRubrica(loadedRubricaId)
    setRubrica(prev => (prev ? { ...prev, criterios } : prev))
  }, [loadedRubricaId])

  // ── Mutation plumbing ───────────────────────────────────────────────────────

  const wrap = useCallback(
    async <T>(action: () => Promise<T>, fallbackMessage: string): Promise<T> => {
      setIsSaving(true)
      setSaveError(null)
      try {
        return await action()
      } catch (err) {
        setSaveError(readErrorMessage(err, fallbackMessage))
        throw err
      } finally {
        setIsSaving(false)
      }
    },
    [],
  )

  /** Replace the criteria array in local state, keeping it `orden`-sorted. */
  const setCriterios = useCallback(
    (updater: (current: RubricaCriterio[]) => RubricaCriterio[]) => {
      setRubrica(prev =>
        prev ? { ...prev, criterios: sortCriteriosByOrden(updater(prev.criterios)) } : prev,
      )
    },
    [],
  )

  // ── Header mutation ─────────────────────────────────────────────────────────

  const updateHeader = useCallback(
    (payload: UpdateRubricaInput) =>
      wrap(async () => {
        if (!loadedRubricaId) throw new Error('No hay una rúbrica cargada.')
        const updated = await updateRubrica(loadedRubricaId, payload, {
          includeCriterios: true,
        })
        setRubrica(updated)
        return updated
      }, 'No se pudo actualizar la rúbrica.'),
    [loadedRubricaId, wrap],
  )

  // ── Criterion row mutations ─────────────────────────────────────────────────

  const addCriterio = useCallback(
    (
      payload: Omit<CreateRubricaCriterioInput, 'rubricaId'> &
        Partial<Pick<CreateRubricaCriterioInput, 'rubricaId'>>,
    ) =>
      wrap(async () => {
        const parentId = payload.rubricaId ?? loadedRubricaId
        if (!parentId) throw new Error('No hay una rúbrica cargada.')

        // Default `orden` to the next free position in the grid.
        const nextOrden =
          payload.orden ??
          (rubrica?.criterios.reduce((max, c) => Math.max(max, c.orden), 0) ?? 0) + 1

        const created = await createRubricaCriterio({
          ...payload,
          rubricaId: parentId,
          orden: nextOrden,
        })
        setCriterios(current => [...current, created])
        return created
      }, 'No se pudo agregar el criterio.'),
    [loadedRubricaId, rubrica, setCriterios, wrap],
  )

  const updateCriterio = useCallback(
    (criterioId: string, payload: UpdateRubricaCriterioInput) =>
      wrap(async () => {
        const updated = await updateRubricaCriterio(criterioId, payload)
        setCriterios(current =>
          current.map(c => (c.id === criterioId ? updated : c)),
        )
        return updated
      }, 'No se pudo actualizar el criterio.'),
    [setCriterios, wrap],
  )

  const removeCriterio = useCallback(
    (criterioId: string) =>
      wrap(async () => {
        await deleteRubricaCriterio(criterioId)
        setCriterios(current => current.filter(c => c.id !== criterioId))
      }, 'No se pudo eliminar el criterio.'),
    [setCriterios, wrap],
  )

  const reorderCriterios = useCallback(
    (orderedIds: string[]) =>
      wrap(async () => {
        await reorderRubricaCriterios(orderedIds)
        setCriterios(current =>
          current.map(c => {
            const index = orderedIds.indexOf(c.id)
            return index === -1 ? c : { ...c, orden: index + 1 }
          }),
        )
      }, 'No se pudo reordenar los criterios.'),
    [setCriterios, wrap],
  )

  // ── Derived ─────────────────────────────────────────────────────────────────

  const criterios = useMemo(() => rubrica?.criterios ?? [], [rubrica])

  const puntajeMaximo = useMemo(
    () => criterios.reduce((total, c) => total + c.puntajeEstandar, 0),
    [criterios],
  )

  return {
    rubrica,
    criterios,
    puntajeMaximo,
    isLoading,
    error,
    refetch: load,
    updateHeader,
    addCriterio,
    updateCriterio,
    removeCriterio,
    reorderCriterios,
    refetchCriterios,
    isSaving,
    saveError,
    clearSaveError: useCallback(() => setSaveError(null), []),
  }
}

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseRubricasResult {
  items: Rubrica[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListRubricasParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useRubricas(params?: ListRubricasParams): UseRubricasResult {
  const [items, setItems] = useState<Rubrica[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeCriterios, criteriosCompletos } =
    params ?? {}

  const baseParams = useMemo<ListRubricasParams>(
    () => ({ pageSize, filter, orderBy, includeCriterios, criteriosCompletos }),
    [pageSize, filter, orderBy, includeCriterios, criteriosCompletos],
  )

  const run = useCallback(
    async (overrides: Partial<ListRubricasParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listRubricas({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las rúbricas.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListRubricasParams>) => run(overrides, false),
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

// ── Header mutation hook ──────────────────────────────────────────────────────
// For screens that create or delete rubrics outside a loaded detail view
// (a rubric list with "Nueva rúbrica" / "Eliminar" actions).

export interface UseRubricaMutationsResult {
  create: (payload: CreateRubricaInput) => Promise<Rubrica>
  update: (id: string, payload: UpdateRubricaInput) => Promise<Rubrica>
  remove: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useRubricaMutations(): UseRubricaMutationsResult {
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
    (payload: CreateRubricaInput) =>
      wrap(() => createRubrica(payload), 'No se pudo crear la rúbrica.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateRubricaInput) =>
      wrap(() => updateRubrica(id, payload), 'No se pudo actualizar la rúbrica.'),
    [wrap],
  )

  const remove = useCallback(
    (id: string) => wrap(() => deleteRubrica(id), 'No se pudo eliminar la rúbrica.'),
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

export function useRubricaCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getRubricaCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de rúbricas.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useRubricaCountByEstado() {
  const [groups, setGroups] = useState<Array<{ estado: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getRubricaCountByEstado())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar las rúbricas por estado.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
