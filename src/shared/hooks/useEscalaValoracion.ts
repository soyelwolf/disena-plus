// src/shared/hooks/useEscalaValoracion.ts
// React hooks over the Escala de Valoración (dpl_escalavaloracion) + Indicador de
// Escala (dpl_escalaindicador) Web API services.
//
// `useEscalaValoracion` is the hook an evaluation screen uses: give it a scale ID
// or a sesión ID and it returns the header plus the full, `orden`-sorted
// indicador array, together with the mutation helpers an editable grid needs
// (add, save a grade, remove, reorder rows). Row mutations update local state
// with the server's response, so the grid always shows persisted values without
// refetching the whole scale.

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  createEscalaValoracion,
  deleteEscalaValoracion,
  getEscalaValoracionById,
  getEscalaValoracionBySesionId,
  getEscalaValoracionCount,
  getEscalaValoracionCountByEstado,
  listEscalaValoraciones,
  updateEscalaValoracion,
  type ListEscalaValoracionesParams,
} from '../services/escalaValoracionService'
import {
  createEscalaIndicador,
  deleteEscalaIndicador,
  listIndicadoresByEscala,
  reorderEscalaIndicador,
  saveEvaluacionIndicador,
  updateEscalaIndicador,
} from '../services/escalaIndicadorService'
import {
  isEvaluacionCompleta,
  sortIndicadores,
  sumPuntajeMaximo,
  sumPuntajeObtenido,
  type CreateEscalaIndicadorInput,
  type EscalaIndicador,
  type EvaluacionIndicadorInput,
  type UpdateEscalaIndicadorInput,
} from '../../types/escalaIndicador'
import type {
  CreateEscalaValoracionInput,
  EscalaValoracion,
  UpdateEscalaValoracionInput,
} from '../../types/escalaValoracion'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── Escala detail hook (header + indicadores) ─────────────────────────────────

/**
 * Identify the scale to load. Provide exactly one of the two:
 * - `escalaValoracionId` — load that scale directly
 * - `sesionId`           — load the most recent scale attached to that Sesión
 */
export interface UseEscalaValoracionTarget {
  escalaValoracionId?: string
  sesionId?: string
}

export interface UseEscalaValoracionResult {
  /** Scale header, or null while loading / when none exists. */
  escala: EscalaValoracion | null
  /** Child indicador rows, always sorted by `orden` ascending. */
  indicadores: EscalaIndicador[]
  /** Sum of the selected tier's score across the loaded indicadores. */
  puntajeObtenido: number
  /** Maximum achievable score (best tier per row) across the loaded indicadores. */
  puntajeMaximo: number
  /** True once every indicador has a tier selected. */
  isCompleta: boolean
  isLoading: boolean
  error: string | null
  refetch: () => Promise<void>

  // Header mutations
  /** Patch the scale header. */
  updateHeader: (payload: UpdateEscalaValoracionInput) => Promise<EscalaValoracion>

  // Indicador row mutations (editable grid)
  /** Append an indicador row. `orden` defaults to the next free position. */
  addIndicador: (
    payload: Omit<CreateEscalaIndicadorInput, 'escalaValoracionId'> &
      Partial<Pick<CreateEscalaIndicadorInput, 'escalaValoracionId'>>,
  ) => Promise<EscalaIndicador>
  /** Patch one indicador row (text, orden, or the puntaje-per-tier definitions). */
  updateIndicador: (
    indicadorId: string,
    payload: UpdateEscalaIndicadorInput,
  ) => Promise<EscalaIndicador>
  /** Save what the teacher picks in the grid: the selected tier + observaciones. */
  saveEvaluacion: (input: EvaluacionIndicadorInput) => Promise<EscalaIndicador>
  /** Delete one indicador row. */
  removeIndicador: (indicadorId: string) => Promise<void>
  /** Persist a new row order; pass the indicador IDs in their display order. */
  reorderIndicadores: (orderedIds: string[]) => Promise<void>
  /** Reload only the indicadores (cheaper than a full refetch). */
  refetchIndicadores: () => Promise<void>

  /** True while any mutation above is in flight. */
  isSaving: boolean
  /** Last mutation error, independent of the load `error`. */
  saveError: string | null
  clearSaveError: () => void
}

export function useEscalaValoracion(
  target?: UseEscalaValoracionTarget,
): UseEscalaValoracionResult {
  const escalaValoracionId = target?.escalaValoracionId
  const sesionId = target?.sesionId

  const [escala, setEscala] = useState<EscalaValoracion | null>(null)
  const [isLoading, setIsLoading] = useState(!!(escalaValoracionId || sesionId))
  const [error, setError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // ── Load ────────────────────────────────────────────────────────────────────

  const load = useCallback(async () => {
    if (!escalaValoracionId && !sesionId) {
      setEscala(null)
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const loaded = escalaValoracionId
        ? await getEscalaValoracionById(escalaValoracionId, { includeIndicadores: true })
        : await getEscalaValoracionBySesionId(sesionId!, { includeIndicadores: true })
      setEscala(loaded)
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la escala de valoración.'))
    } finally {
      setIsLoading(false)
    }
  }, [escalaValoracionId, sesionId])

  useEffect(() => {
    void load()
  }, [load])

  // The scale actually loaded — may differ from `escalaValoracionId` when resolved by sesión.
  const loadedEscalaId = escala?.id

  const refetchIndicadores = useCallback(async () => {
    if (!loadedEscalaId) return
    const indicadores = await listIndicadoresByEscala(loadedEscalaId)
    setEscala(prev => (prev ? { ...prev, indicadores } : prev))
  }, [loadedEscalaId])

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

  /** Replace the indicadores array in local state, keeping it `orden`-sorted. */
  const setIndicadores = useCallback(
    (updater: (current: EscalaIndicador[]) => EscalaIndicador[]) => {
      setEscala(prev =>
        prev ? { ...prev, indicadores: sortIndicadores(updater(prev.indicadores)) } : prev,
      )
    },
    [],
  )

  // ── Header mutation ─────────────────────────────────────────────────────────

  const updateHeader = useCallback(
    (payload: UpdateEscalaValoracionInput) =>
      wrap(async () => {
        if (!loadedEscalaId) throw new Error('No hay una escala de valoración cargada.')
        const updated = await updateEscalaValoracion(loadedEscalaId, payload, {
          includeIndicadores: true,
        })
        setEscala(updated)
        return updated
      }, 'No se pudo actualizar la escala de valoración.'),
    [loadedEscalaId, wrap],
  )

  // ── Indicador row mutations ──────────────────────────────────────────────────

  const addIndicador = useCallback(
    (
      payload: Omit<CreateEscalaIndicadorInput, 'escalaValoracionId'> &
        Partial<Pick<CreateEscalaIndicadorInput, 'escalaValoracionId'>>,
    ) =>
      wrap(async () => {
        const parentId = payload.escalaValoracionId ?? loadedEscalaId
        if (!parentId) throw new Error('No hay una escala de valoración cargada.')

        // Default `orden` to the next free position in the grid.
        const nextOrden =
          payload.orden ??
          (escala?.indicadores.reduce((max, i) => Math.max(max, i.orden), 0) ?? 0) + 1

        const created = await createEscalaIndicador({
          ...payload,
          escalaValoracionId: parentId,
          orden: nextOrden,
        })
        setIndicadores(current => [...current, created])
        return created
      }, 'No se pudo agregar el indicador.'),
    [loadedEscalaId, escala, setIndicadores, wrap],
  )

  const updateIndicador = useCallback(
    (indicadorId: string, payload: UpdateEscalaIndicadorInput) =>
      wrap(async () => {
        const updated = await updateEscalaIndicador(indicadorId, payload)
        setIndicadores(current =>
          current.map(i => (i.id === indicadorId ? updated : i)),
        )
        return updated
      }, 'No se pudo actualizar el indicador.'),
    [setIndicadores, wrap],
  )

  const saveEvaluacion = useCallback(
    (input: EvaluacionIndicadorInput) =>
      wrap(async () => {
        const updated = await saveEvaluacionIndicador(input)
        setIndicadores(current =>
          current.map(i => (i.id === input.id ? updated : i)),
        )
        return updated
      }, 'No se pudo guardar la evaluación.'),
    [setIndicadores, wrap],
  )

  const removeIndicador = useCallback(
    (indicadorId: string) =>
      wrap(async () => {
        await deleteEscalaIndicador(indicadorId)
        setIndicadores(current => current.filter(i => i.id !== indicadorId))
      }, 'No se pudo eliminar el indicador.'),
    [setIndicadores, wrap],
  )

  const reorderIndicadores = useCallback(
    (orderedIds: string[]) =>
      wrap(async () => {
        for (let index = 0; index < orderedIds.length; index++) {
          await reorderEscalaIndicador(orderedIds[index], index + 1)
        }
        setIndicadores(current =>
          current.map(i => {
            const index = orderedIds.indexOf(i.id)
            return index === -1 ? i : { ...i, orden: index + 1 }
          }),
        )
      }, 'No se pudo reordenar los indicadores.'),
    [setIndicadores, wrap],
  )

  // ── Derived ─────────────────────────────────────────────────────────────────

  const indicadores = useMemo(() => escala?.indicadores ?? [], [escala])
  const puntajeObtenido = useMemo(() => sumPuntajeObtenido(indicadores), [indicadores])
  const puntajeMaximo = useMemo(() => sumPuntajeMaximo(indicadores), [indicadores])
  const isCompleta = useMemo(() => isEvaluacionCompleta(indicadores), [indicadores])

  return {
    escala,
    indicadores,
    puntajeObtenido,
    puntajeMaximo,
    isCompleta,
    isLoading,
    error,
    refetch: load,
    updateHeader,
    addIndicador,
    updateIndicador,
    saveEvaluacion,
    removeIndicador,
    reorderIndicadores,
    refetchIndicadores,
    isSaving,
    saveError,
    clearSaveError: useCallback(() => setSaveError(null), []),
  }
}

// ── List hook ─────────────────────────────────────────────────────────────────

export interface UseEscalaValoracionesResult {
  items: EscalaValoracion[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListEscalaValoracionesParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useEscalaValoraciones(
  params?: ListEscalaValoracionesParams,
): UseEscalaValoracionesResult {
  const [items, setItems] = useState<EscalaValoracion[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeIndicadores } = params ?? {}

  const baseParams = useMemo<ListEscalaValoracionesParams>(
    () => ({ pageSize, filter, orderBy, includeIndicadores }),
    [pageSize, filter, orderBy, includeIndicadores],
  )

  const run = useCallback(
    async (
      overrides: Partial<ListEscalaValoracionesParams> | undefined,
      append: boolean,
    ) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listEscalaValoraciones({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las escalas de valoración.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListEscalaValoracionesParams>) => run(overrides, false),
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
// For screens that create or delete scales outside a loaded detail view (a
// scale list with "Nueva escala" / "Eliminar" actions).

export interface UseEscalaValoracionMutationsResult {
  create: (payload: CreateEscalaValoracionInput) => Promise<EscalaValoracion>
  update: (id: string, payload: UpdateEscalaValoracionInput) => Promise<EscalaValoracion>
  remove: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useEscalaValoracionMutations(): UseEscalaValoracionMutationsResult {
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
    (payload: CreateEscalaValoracionInput) =>
      wrap(() => createEscalaValoracion(payload), 'No se pudo crear la escala de valoración.'),
    [wrap],
  )

  const update = useCallback(
    (id: string, payload: UpdateEscalaValoracionInput) =>
      wrap(
        () => updateEscalaValoracion(id, payload),
        'No se pudo actualizar la escala de valoración.',
      ),
    [wrap],
  )

  const remove = useCallback(
    (id: string) =>
      wrap(() => deleteEscalaValoracion(id), 'No se pudo eliminar la escala de valoración.'),
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

export function useEscalaValoracionCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getEscalaValoracionCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de escalas de valoración.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

export function useEscalaValoracionCountByEstado() {
  const [groups, setGroups] = useState<Array<{ estado: string; count: number }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getEscalaValoracionCountByEstado())
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar las escalas de valoración por estado.'))
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
