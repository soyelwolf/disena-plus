// src/shared/hooks/useListaCotejo.ts
// React hooks over the Lista de Cotejo (dpl_listacotejo) + Indicador de Lista de
// Cotejo (dpl_listacotejoindicador) Web API service.
//
// `useListaCotejo(id)` is the main entry point for the checklist screen: it
// returns the header plus its ordered indicador rows and the mutation helpers the
// editable grid needs (answer Sí/No, write observaciones, add/remove/reorder rows).

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  appendIndicador,
  createIndicador,
  createListaCotejo,
  deleteIndicador,
  deleteListaCotejo,
  deleteListaCotejoConIndicadores,
  getListaCotejoById,
  getListaCotejoCount,
  getIndicadorCountByRespuesta,
  listAllIndicadores,
  listIndicadores,
  listListasCotejo,
  reordenarIndicadores,
  saveIndicadoresBatch,
  saveRespuestaIndicador,
  updateIndicador,
  updateListaCotejo,
  type ListIndicadoresParams,
  type ListListasCotejoParams,
} from '../services/listaCotejoService'
import {
  calcularPuntajeObtenido,
  calcularPuntajeTotal,
  sortIndicadores,
  type CreateIndicadorInput,
  type CreateListaCotejoInput,
  type IndicadorListaCotejo,
  type ListaCotejo,
  type RespuestaValue,
  type UpdateIndicadorInput,
  type UpdateListaCotejoInput,
} from '../../types/listaCotejo'

const readErrorMessage = (err: unknown, fallback: string): string =>
  err instanceof Error ? err.message : fallback

// ── List hook (checklist headers) ─────────────────────────────────────────────

export interface UseListasCotejoResult {
  items: ListaCotejo[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  /** Re-run the query. Pass overrides to change a single parameter for this run. */
  refetch: (overrides?: Partial<ListListasCotejoParams>) => Promise<void>
  /** Load the next cursor page, replacing the current items. */
  fetchNextPage: () => Promise<void>
  /** Append the next cursor page to the current items (infinite-scroll style). */
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

export function useListasCotejo(params?: ListListasCotejoParams): UseListasCotejoResult {
  const [items, setItems] = useState<ListaCotejo[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy, includeIndicadores, includeSesion, indicadoresTop } =
    params ?? {}

  const baseParams = useMemo<ListListasCotejoParams>(
    () => ({ pageSize, filter, orderBy, includeIndicadores, includeSesion, indicadoresTop }),
    [pageSize, filter, orderBy, includeIndicadores, includeSesion, indicadoresTop],
  )

  const run = useCallback(
    async (overrides: Partial<ListListasCotejoParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listListasCotejo({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar las listas de cotejo.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  const refetch = useCallback(
    (overrides?: Partial<ListListasCotejoParams>) => run(overrides, false),
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

// ── Main hook: one checklist with its ordered indicadores ─────────────────────

export interface UseListaCotejoResult {
  /** The checklist header, null while loading or when not found. */
  listaCotejo: ListaCotejo | null
  /** Indicador rows, always sorted by dpl_orden. */
  indicadores: IndicadorListaCotejo[]
  isLoading: boolean
  /** True while a mutation (answer, add, delete, reorder) is in flight. */
  isSaving: boolean
  error: string | null
  clearError: () => void
  /** Reload header + indicadores from Dataverse. */
  refetch: () => Promise<void>

  // Header mutations
  updateHeader: (payload: UpdateListaCotejoInput) => Promise<ListaCotejo>
  removeListaCotejo: (options?: { withIndicadores?: boolean }) => Promise<void>

  // Row mutations — the editable checklist grid
  /** Set the Sí/No answer (and optionally the observación) for one row. */
  setRespuesta: (
    indicadorId: string,
    respuesta: RespuestaValue | null,
    observaciones?: string,
  ) => Promise<IndicadorListaCotejo>
  /** Write the observación text for one row. */
  setObservaciones: (indicadorId: string, observaciones: string) => Promise<IndicadorListaCotejo>
  /** Patch any subset of a row's columns. */
  updateRow: (indicadorId: string, payload: UpdateIndicadorInput) => Promise<IndicadorListaCotejo>
  /** Persist several row edits in one go (the grid's "Guardar" button). */
  saveRows: (
    edits: Array<{ id: string } & UpdateIndicadorInput>,
  ) => Promise<IndicadorListaCotejo[]>
  /** Append a new row, auto-numbering dpl_orden after the current last row. */
  addRow: (
    payload: Omit<CreateIndicadorInput, 'listaCotejoId' | 'orden'> & { orden?: number },
  ) => Promise<IndicadorListaCotejo>
  /** Delete one row. */
  removeRow: (indicadorId: string) => Promise<void>
  /** Renumber rows 1..n from an ordered list of ids. */
  reorderRows: (orderedIds: string[]) => Promise<IndicadorListaCotejo[]>

  // Derived values for the summary tile
  /** Sum of puntaje across rows answered "Sí". */
  puntajeObtenido: number
  /** Sum of puntaje across all rows. */
  puntajeTotal: number
  /** Rows with an answer / total rows. */
  respondidos: number
  totalIndicadores: number
}

export interface UseListaCotejoOptions {
  /**
   * Fetch the indicadores in the same request via $expand (default true).
   * Set false to load them with a separate query — useful while the child table's
   * Web API site settings / table permissions are not yet configured, since a
   * blocked expand silently returns an empty collection.
   */
  expandIndicadores?: boolean
  /** Also expand the parent Sesión lookup. Off by default. */
  includeSesion?: boolean
}

export function useListaCotejo(
  id: string | undefined,
  options?: UseListaCotejoOptions,
): UseListaCotejoResult {
  const [listaCotejo, setListaCotejo] = useState<ListaCotejo | null>(null)
  const [indicadores, setIndicadores] = useState<IndicadorListaCotejo[]>([])
  const [isLoading, setIsLoading] = useState(!!id)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const expandIndicadores = options?.expandIndicadores ?? true
  const includeSesion = options?.includeSesion ?? false

  const load = useCallback(async () => {
    if (!id) {
      setListaCotejo(null)
      setIndicadores([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      const header = await getListaCotejoById(id, {
        includeIndicadores: expandIndicadores,
        includeSesion,
      })
      setListaCotejo(header)

      if (!header) {
        setIndicadores([])
      } else if (expandIndicadores) {
        setIndicadores(header.indicadores)
      } else {
        setIndicadores(await listAllIndicadores(id))
      }
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo cargar la lista de cotejo.'))
    } finally {
      setIsLoading(false)
    }
  }, [id, expandIndicadores, includeSesion])

  useEffect(() => {
    void load()
  }, [load])

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

  /** Replace one row in local state without a full refetch. */
  const mergeRow = useCallback((row: IndicadorListaCotejo) => {
    setIndicadores(prev =>
      sortIndicadores(prev.some(r => r.id === row.id) ? prev.map(r => (r.id === row.id ? row : r)) : [...prev, row]),
    )
  }, [])

  const updateHeader = useCallback(
    (payload: UpdateListaCotejoInput) =>
      wrap(async () => {
        if (!id) throw new Error('No hay una lista de cotejo seleccionada.')
        const updated = await updateListaCotejo(id, payload)
        setListaCotejo(prev => (prev ? { ...updated, indicadores: prev.indicadores } : updated))
        return updated
      }, 'No se pudo actualizar la lista de cotejo.'),
    [id, wrap],
  )

  const removeListaCotejo = useCallback(
    (opts?: { withIndicadores?: boolean }) =>
      wrap(async () => {
        if (!id) throw new Error('No hay una lista de cotejo seleccionada.')
        if (opts?.withIndicadores) {
          await deleteListaCotejoConIndicadores(id)
        } else {
          await deleteListaCotejo(id)
        }
        setListaCotejo(null)
        setIndicadores([])
      }, 'No se pudo eliminar la lista de cotejo.'),
    [id, wrap],
  )

  const setRespuesta = useCallback(
    (indicadorId: string, respuesta: RespuestaValue | null, observaciones?: string) =>
      wrap(async () => {
        const saved = await saveRespuestaIndicador(indicadorId, respuesta, observaciones)
        mergeRow(saved)
        return saved
      }, 'No se pudo guardar la respuesta del indicador.'),
    [mergeRow, wrap],
  )

  const setObservaciones = useCallback(
    (indicadorId: string, observaciones: string) =>
      wrap(async () => {
        const saved = await updateIndicador(indicadorId, { observaciones })
        mergeRow(saved)
        return saved
      }, 'No se pudo guardar la observación del indicador.'),
    [mergeRow, wrap],
  )

  const updateRow = useCallback(
    (indicadorId: string, payload: UpdateIndicadorInput) =>
      wrap(async () => {
        const saved = await updateIndicador(indicadorId, payload)
        mergeRow(saved)
        return saved
      }, 'No se pudo actualizar el indicador.'),
    [mergeRow, wrap],
  )

  const saveRows = useCallback(
    (edits: Array<{ id: string } & UpdateIndicadorInput>) =>
      wrap(async () => {
        const saved = await saveIndicadoresBatch(edits)
        setIndicadores(prev =>
          sortIndicadores(prev.map(row => saved.find(s => s.id === row.id) ?? row)),
        )
        return saved
      }, 'No se pudieron guardar los cambios de la lista de cotejo.'),
    [wrap],
  )

  const addRow = useCallback(
    (payload: Omit<CreateIndicadorInput, 'listaCotejoId' | 'orden'> & { orden?: number }) =>
      wrap(async () => {
        if (!id) throw new Error('No hay una lista de cotejo seleccionada.')
        const created = await appendIndicador(id, payload, indicadores)
        mergeRow(created)
        return created
      }, 'No se pudo agregar el indicador.'),
    [id, indicadores, mergeRow, wrap],
  )

  const removeRow = useCallback(
    (indicadorId: string) =>
      wrap(async () => {
        await deleteIndicador(indicadorId)
        setIndicadores(prev => prev.filter(r => r.id !== indicadorId))
      }, 'No se pudo eliminar el indicador.'),
    [wrap],
  )

  const reorderRows = useCallback(
    (orderedIds: string[]) =>
      wrap(async () => {
        const saved = await reordenarIndicadores(orderedIds)
        setIndicadores(prev =>
          sortIndicadores(prev.map(row => saved.find(s => s.id === row.id) ?? row)),
        )
        return saved
      }, 'No se pudo reordenar los indicadores.'),
    [wrap],
  )

  const puntajeObtenido = useMemo(() => calcularPuntajeObtenido(indicadores), [indicadores])
  const puntajeTotal = useMemo(() => calcularPuntajeTotal(indicadores), [indicadores])
  const respondidos = useMemo(
    () => indicadores.filter(i => i.respuesta !== null).length,
    [indicadores],
  )

  return {
    listaCotejo,
    indicadores,
    isLoading,
    isSaving,
    error,
    clearError: useCallback(() => setError(null), []),
    refetch: load,
    updateHeader,
    removeListaCotejo,
    setRespuesta,
    setObservaciones,
    updateRow,
    saveRows,
    addRow,
    removeRow,
    reorderRows,
    puntajeObtenido,
    puntajeTotal,
    respondidos,
    totalIndicadores: indicadores.length,
  }
}

// ── Standalone indicador list hook ────────────────────────────────────────────

export interface UseIndicadoresResult {
  items: IndicadorListaCotejo[]
  totalCount: number
  nextLink?: string
  isLoading: boolean
  error: string | null
  refetch: (overrides?: Partial<ListIndicadoresParams>) => Promise<void>
  loadMore: () => Promise<void>
  hasNextPage: boolean
}

/** Paginated indicador rows independent of a specific checklist header. */
export function useIndicadores(params?: ListIndicadoresParams): UseIndicadoresResult {
  const [items, setItems] = useState<IndicadorListaCotejo[]>([])
  const [totalCount, setTotalCount] = useState(0)
  const [nextLink, setNextLink] = useState<string | undefined>(undefined)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const { pageSize, filter, orderBy } = params ?? {}

  const baseParams = useMemo<ListIndicadoresParams>(
    () => ({ pageSize, filter, orderBy }),
    [pageSize, filter, orderBy],
  )

  const run = useCallback(
    async (overrides: Partial<ListIndicadoresParams> | undefined, append: boolean) => {
      setIsLoading(true)
      setError(null)
      try {
        const result = await listIndicadores({ ...baseParams, ...overrides })
        setItems(prev => (append ? [...prev, ...result.items] : result.items))
        setTotalCount(result.totalCount)
        setNextLink(result.nextLink)
      } catch (err) {
        setError(readErrorMessage(err, 'No se pudieron cargar los indicadores.'))
      } finally {
        setIsLoading(false)
      }
    },
    [baseParams],
  )

  useEffect(() => {
    void run(undefined, false)
  }, [run])

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
    refetch: useCallback(
      (overrides?: Partial<ListIndicadoresParams>) => run(overrides, false),
      [run],
    ),
    loadMore,
    hasNextPage: !!nextLink,
  }
}

// ── Mutation hook (creating headers / rows outside a loaded checklist) ────────

export interface UseListaCotejoMutationsResult {
  createLista: (payload: CreateListaCotejoInput) => Promise<ListaCotejo>
  updateLista: (id: string, payload: UpdateListaCotejoInput) => Promise<ListaCotejo>
  removeLista: (id: string, options?: { withIndicadores?: boolean }) => Promise<void>
  createRow: (payload: CreateIndicadorInput) => Promise<IndicadorListaCotejo>
  updateRow: (id: string, payload: UpdateIndicadorInput) => Promise<IndicadorListaCotejo>
  removeRow: (id: string) => Promise<void>
  isSaving: boolean
  error: string | null
  clearError: () => void
}

export function useListaCotejoMutations(): UseListaCotejoMutationsResult {
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

  return {
    createLista: useCallback(
      (payload: CreateListaCotejoInput) =>
        wrap(() => createListaCotejo(payload), 'No se pudo crear la lista de cotejo.'),
      [wrap],
    ),
    updateLista: useCallback(
      (id: string, payload: UpdateListaCotejoInput) =>
        wrap(() => updateListaCotejo(id, payload), 'No se pudo actualizar la lista de cotejo.'),
      [wrap],
    ),
    removeLista: useCallback(
      (id: string, options?: { withIndicadores?: boolean }) =>
        wrap(
          () =>
            options?.withIndicadores
              ? deleteListaCotejoConIndicadores(id)
              : deleteListaCotejo(id),
          'No se pudo eliminar la lista de cotejo.',
        ),
      [wrap],
    ),
    createRow: useCallback(
      (payload: CreateIndicadorInput) =>
        wrap(() => createIndicador(payload), 'No se pudo crear el indicador.'),
      [wrap],
    ),
    updateRow: useCallback(
      (id: string, payload: UpdateIndicadorInput) =>
        wrap(() => updateIndicador(id, payload), 'No se pudo actualizar el indicador.'),
      [wrap],
    ),
    removeRow: useCallback(
      (id: string) => wrap(() => deleteIndicador(id), 'No se pudo eliminar el indicador.'),
      [wrap],
    ),
    isSaving,
    error,
    clearError: useCallback(() => setError(null), []),
  }
}

// ── Count hooks ───────────────────────────────────────────────────────────────

export function useListaCotejoCount(filter?: string) {
  const [count, setCount] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      setCount(await getListaCotejoCount(filter))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo obtener el total de listas de cotejo.'))
    } finally {
      setIsLoading(false)
    }
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  return { count, isLoading, error, refetch: load }
}

/** Grouped counts of indicadores per answer, for a progress tile. */
export function useIndicadorCountByRespuesta(listaCotejoId: string | undefined) {
  const [groups, setGroups] = useState<Array<{ respuesta: number | null; count: number }>>([])
  const [isLoading, setIsLoading] = useState(!!listaCotejoId)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!listaCotejoId) {
      setGroups([])
      setIsLoading(false)
      return
    }
    setIsLoading(true)
    setError(null)
    try {
      setGroups(await getIndicadorCountByRespuesta(listaCotejoId))
    } catch (err) {
      setError(readErrorMessage(err, 'No se pudo agrupar los indicadores por respuesta.'))
    } finally {
      setIsLoading(false)
    }
  }, [listaCotejoId])

  useEffect(() => {
    void load()
  }, [load])

  return { groups, isLoading, error, refetch: load }
}
