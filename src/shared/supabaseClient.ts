// src/shared/supabaseClient.ts
// Single Supabase client instance, shared by every table service.
// Reads the project URL and anon (public) key from Vite env vars — see .env.example.

import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

export const isSupabaseConfigured = !!url && !!anonKey

// A syntactically valid placeholder so the client can always be constructed —
// unconfigured requests fail fast with a network error, which the pages already
// catch and use as the signal to fall back to local sample data.
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  anonKey || 'placeholder-anon-key',
)

// ── Row helpers ────────────────────────────────────────────────────────────────
// Every table keeps the Dataverse-era `dpl_` column names so the existing
// mapXEntity() functions in src/types/*.ts can be reused unchanged: a Supabase
// row already has the same shape as the old raw OData "Entity" the mappers
// expect. These two helpers patch in the handful of properties Dataverse used
// to synthesize automatically (the OData formatted-value annotation for
// statecode, and the `_<column>_value` lookup projection) which Postgres has
// no equivalent for.

/** Add the `statecode` formatted-value annotation the mappers read for estadoLabel. */
export const withStateLabel = <T extends { statecode?: number | null }>(row: T): T => ({
  ...row,
  'statecode@OData.Community.Display.V1.FormattedValue': row.statecode === 1 ? 'Inactivo' : 'Activo',
})

/** Copy a real FK column into the `_<column>_value` key the mappers read for lookups. */
export const withLookupValue = <T extends Record<string, unknown>>(
  row: T,
  column: string,
): T => ({
  ...row,
  [`_${column}_value`]: row[column] ?? null,
})

/** Throw a friendly error when a Supabase call fails, mirroring the old service layer. */
export const assertNoError = (error: { message: string } | null, fallback: string): void => {
  if (error) throw new Error(error.message || fallback)
}

// ── Filters ──────────────────────────────────────────────────────────────────
// The old services exposed `buildXFilter(...)` helpers that returned raw OData
// $filter fragments, composed with `combineFilters(...)` and passed around as a
// plain `filter?: string`. PostgREST has no equivalent string DSL, so every
// filter builder below instead returns a small condition JSON-encoded as a
// string — `filter?: string` keeps working exactly as before at every call
// site, but `applyFilter` (not a raw OData interpreter) is what applies it.

export type FilterOp = 'contains' | 'eq' | 'isNull'
export interface FilterCondition {
  field: string
  op: FilterOp
  value?: string | number | boolean
}

export const encodeFilter = (condition: FilterCondition): string => JSON.stringify(condition)

/** Combine several encoded filter fragments with AND, dropping empty ones. */
export const combineFilterConditions = (
  ...filters: Array<string | undefined>
): string | undefined => {
  const parts = filters.filter((f): f is string => !!f && f.trim() !== '')
  if (parts.length === 0) return undefined
  const conditions = parts.flatMap(p => {
    try {
      const parsed = JSON.parse(p)
      return Array.isArray(parsed) ? parsed : [parsed]
    } catch {
      return []
    }
  })
  return JSON.stringify(conditions)
}

/** Apply an encoded filter (from encodeFilter/combineFilterConditions) to a Supabase query builder. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const applyFilter = <Q extends { ilike: any; eq: any; is: any }>(
  query: Q,
  filter?: string,
): Q => {
  if (!filter) return query
  let conditions: FilterCondition[]
  try {
    const parsed = JSON.parse(filter)
    conditions = Array.isArray(parsed) ? parsed : [parsed]
  } catch {
    return query
  }
  let q = query
  for (const c of conditions) {
    if (c.op === 'contains') q = q.ilike(c.field, `%${c.value}%`)
    else if (c.op === 'eq') q = q.eq(c.field, c.value)
    else if (c.op === 'isNull') q = q.is(c.field, null)
  }
  return q
}

// ── Order by ─────────────────────────────────────────────────────────────────
// The old `orderBy?: string` carried an OData expression like "dpl_nombre asc".
// Parse that same shape into a Supabase `.order()` call so call sites (and any
// caller-supplied default) keep working unchanged.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const applyOrderBy = <Q extends { order: any }>(
  query: Q,
  orderBy: string,
  options?: { nullsFirst?: boolean },
): Q => {
  const [column, direction] = orderBy.trim().split(/\s+/)
  return query.order(column, { ascending: direction?.toLowerCase() !== 'desc', ...options })
}

// ── Pagination ───────────────────────────────────────────────────────────────
// The old `nextLink?: string` carried an opaque @odata.nextLink cursor URL.
// Here it is just the next row offset, encoded as a string — still an opaque
// cursor from the caller's point of view.

export interface PaginatedResult<T> {
  items: T[]
  totalCount: number
  nextLink?: string
}

export const parseOffset = (nextLink?: string): number => {
  const n = nextLink ? parseInt(nextLink, 10) : 0
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export const buildPaginatedResult = <T>(
  items: T[],
  totalCount: number,
  offset: number,
  _pageSize: number,
): PaginatedResult<T> => ({
  items,
  totalCount,
  nextLink: offset + items.length < totalCount ? String(offset + items.length) : undefined,
})

/** Fetch every row of a query in batches, following .range() until exhausted. */
export const fetchAllRows = async <T>(
  buildQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  pageSize = 100,
): Promise<T[]> => {
  const results: T[] = []
  let offset = 0
  for (let iterations = 0; iterations < 100; iterations++) {
    const { data, error } = await buildQuery(offset, offset + pageSize - 1)
    assertNoError(error, 'No se pudieron cargar los registros.')
    const rows = data ?? []
    results.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  return results
}
