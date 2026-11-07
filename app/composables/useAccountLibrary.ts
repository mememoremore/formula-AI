import { computed, type MaybeRefOrGetter } from 'vue'
import { useInfiniteQuery } from '@tanstack/vue-query'
import {
  libraryQueryOptions,
  currentQueryData,
  currentQueryError,
  isAccountQueryDenied,
  type LibraryKind,
} from '../queries/formula-queries'
import { workspaceFeedback } from '../utils/workspace-feedback'
import { mergeLibraryItems } from '../utils/library-state'
import { useAccountFetch } from './useAccountFetch'
import { useAccountQueryOwner } from './useAccountQueryOwner'

/** Query owns pages and cancellation; route state and account authorization remain explicit. */
export function useAccountLibrary(
  kind: LibraryKind,
  expected: MaybeRefOrGetter<string | undefined>,
) {
  const client = useNuxtApp().$queryClient
  const owner = useAccountQueryOwner(expected)
  const fetcher = useAccountFetch()
  const route = useRoute()
  const filters = computed(() => ({
    ...(typeof route.query.q === 'string' && route.query.q ? { q: route.query.q } : {}),
    ...(typeof route.query.category === 'string' && route.query.category
      ? { category: route.query.category }
      : {}),
  }))
  const options = computed(() => libraryQueryOptions(owner.value, kind, filters.value, fetcher))
  const query = useInfiniteQuery(options, client)
  const data = computed(() =>
    owner.value && !isAccountQueryDenied(query.error.value)
      ? currentQueryData(client, options.value.queryKey, query.data.value)
      : undefined,
  )
  const items = computed(() =>
    mergeLibraryItems([], data.value?.pages.flatMap((page) => page.items) ?? []),
  )
  const observedError = computed(() =>
    currentQueryError(client, options.value.queryKey, query.error.value),
  )
  const error = computed(() => (owner.value && !data.value ? observedError.value : null))
  const feedback = computed(() =>
    owner.value && data.value && observedError.value
      ? workspaceFeedback(
          observedError.value,
          query.isFetchNextPageError.value
            ? '加载失败，已有公式保留，请重试。'
            : '刷新失败，已有公式保留，请重试。',
        )
      : '',
  )

  async function loadMore() {
    if (!owner.value || !query.hasNextPage.value || query.isFetching.value) return
    await query.fetchNextPage({ cancelRefetch: false })
  }

  async function reload() {
    if (!owner.value) return

    const key = options.value.queryKey

    await client.cancelQueries({ queryKey: key, exact: true })
    if (!owner.value || JSON.stringify(key) !== JSON.stringify(options.value.queryKey)) return
    await query.refetch({ cancelRefetch: false })
  }

  return {
    ready: owner.value ? query.suspense().catch(() => undefined) : Promise.resolve(),
    items,
    error,
    feedback,
    filters,
    status: computed(() =>
      !owner.value ? 'idle' : error.value ? 'error' : data.value ? 'success' : 'pending',
    ),
    nextCursor: computed(() => data.value?.pages.at(-1)?.nextCursor ?? null),
    loadingMore: query.isFetchingNextPage,
    refreshing: query.isFetching,
    reload,
    loadMore,
  }
}
