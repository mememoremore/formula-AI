import { toRaw } from 'vue'
import {
  QueryClient,
  infiniteQueryOptions,
  queryOptions,
  type InfiniteData,
} from '@tanstack/vue-query'
import type { CategoryCollection, FormulaLibraryPage } from '../../shared/types/library'

export type LibraryKind = 'library' | 'favorites'
export interface LibraryFilters {
  q?: string
  category?: string
}
export type LibraryPages = InfiniteData<FormulaLibraryPage, string | null>
export type AccountQueryFetch = <T>(
  url: string,
  options: {
    query?: Record<string, string | undefined>
    headers: { 'x-account-id': string }
    signal: AbortSignal
    retry: 0
    timeout: number
  },
) => Promise<T>

export const formulaQueryKeys = {
  all: ['account-formula-views'] as const,
  owner: (owner: string | undefined) => ['account-formula-views', owner ?? null] as const,
  categories: (owner: string | undefined) =>
    [...formulaQueryKeys.owner(owner), 'categories'] as const,
  library: (owner: string | undefined, kind: LibraryKind, filters: LibraryFilters) =>
    [
      ...formulaQueryKeys.owner(owner),
      'library',
      kind,
      { q: filters.q ?? '', category: filters.category ?? '' },
    ] as const,
}

export function createAccountQueryClient(server = false) {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: server ? Infinity : 5 * 60_000,
        retry: false,
        refetchOnWindowFocus: false,
      },
    },
  })
}

export function libraryQueryOptions(
  owner: string | undefined,
  kind: LibraryKind,
  filters: LibraryFilters,
  fetcher: AccountQueryFetch,
) {
  // Snapshot the parameters; a delayed response must belong to its original key.
  const params = { ...filters, ...(kind === 'favorites' ? { favorites: 'true' } : {}) }

  return infiniteQueryOptions({
    queryKey: formulaQueryKeys.library(owner, kind, filters),
    enabled: !!owner,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }) => {
      if (!owner) throw new Error('账号尚未确认')

      const page = await fetcher<FormulaLibraryPage>('/api/account/library', {
        query: { ...params, ...(pageParam ? { cursor: pageParam } : {}) },
        headers: { 'x-account-id': owner },
        signal,
        retry: 0,
        timeout: 15_000,
      })

      signal.throwIfAborted()
      return page
    },
    getNextPageParam: (page) => page.nextCursor || undefined,
  })
}

export function categoryQueryOptions(owner: string | undefined, fetcher: AccountQueryFetch) {
  return queryOptions({
    queryKey: formulaQueryKeys.categories(owner),
    enabled: !!owner,
    queryFn: async ({ signal }) => {
      if (!owner) throw new Error('账号尚未确认')

      const result = await fetcher<CategoryCollection>('/api/account/categories', {
        headers: { 'x-account-id': owner },
        signal,
        retry: 0,
        timeout: 15_000,
      })

      signal.throwIfAborted()
      return result
    },
  })
}

/** Existing writes still own their requests; only their read-cache notification changes. */
export function invalidateFormulaQueries(client: QueryClient, owner: string | undefined) {
  if (!owner) return Promise.resolve()
  return client.invalidateQueries({ queryKey: formulaQueryKeys.owner(owner) })
}

/** Vue observers update on a tick. Hide the old observer value as soon as its key changes. */
export function currentQueryData<T>(
  client: QueryClient,
  key: readonly unknown[],
  observed: T | undefined,
): T | undefined {
  return observed !== undefined && toRaw(observed) === toRaw(client.getQueryData<T>(key))
    ? observed
    : undefined
}
export function currentQueryError(
  client: QueryClient,
  key: readonly unknown[],
  observed: Error | null,
) {
  return observed && toRaw(observed) === toRaw(client.getQueryState(key)?.error) ? observed : null
}

export function isAccountQueryDenied(error: unknown) {
  const status =
    (error as { statusCode?: number; status?: number } | null)?.statusCode ??
    (error as { status?: number } | null)?.status

  return status === 401 || status === 403
}
