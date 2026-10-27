import type { FormulaLibraryPage } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import { mergeLibraryItems } from '~/utils/library-state'
interface LibrarySnapshot extends FormulaLibraryPage {
  context: string
}

/** 单一聚合列表；身份、视图与 URL 筛选共同限定请求归属。 */
export function useAccountLibrary(kind: 'library' | 'favorites', ownerId: string) {
  const route = useRoute()
  const filters = computed(() => ({
    ...(typeof route.query.q === 'string' && route.query.q ? { q: route.query.q } : {}),
    ...(typeof route.query.category === 'string' && route.query.category
      ? { category: route.query.category }
      : {}),
    ...(kind === 'favorites' ? { favorites: 'true' } : {}),
  }))
  const context = computed(() => JSON.stringify(filters.value))
  const cache = useNuxtData<LibrarySnapshot>(`account-library-${kind}-${ownerId}`)
  const fetcher = useRequestFetch()
  const request = useAsyncData<LibrarySnapshot>(
    `account-library-${kind}-${ownerId}`,
    async (_app, { signal }) => {
      const expected = context.value
      const page = await fetcher<FormulaLibraryPage>('/api/account/library', {
        query: { ...filters.value },
        signal,
        retry: 0,
        timeout: 15_000,
      })
      signal.throwIfAborted()
      return { ...page, items: mergeLibraryItems([], page.items), context: expected }
    },
    {
      watch: [context],
      getCachedData(key, app, cause) {
        if (cause.cause !== 'initial') return undefined
        const page = cache.data.value
        return page?.context === context.value ? page : undefined
      },
    },
  )
  const current = computed(() =>
    request.data.value?.context === context.value ? request.data.value : undefined,
  )
  const items = computed(() => current.value?.items ?? [])
  const nextCursor = computed(() => current.value?.nextCursor ?? null)
  const loadingMore = ref(false)
  const feedback = ref('')
  let controller: AbortController | undefined
  let disposed = false
  function cancelMore() {
    controller?.abort()
    controller = undefined
    loadingMore.value = false
    feedback.value = ''
  }
  watch(context, cancelMore, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    cancelMore()
  })
  async function reload() {
    cancelMore()
    await request.refresh()
  }
  async function loadMore() {
    if (!nextCursor.value || loadingMore.value || request.status.value === 'pending' || disposed)
      return
    const expected = context.value
    const cursor = nextCursor.value
    const active = new AbortController()
    controller = active
    loadingMore.value = true
    feedback.value = ''
    try {
      const page = await $fetch<FormulaLibraryPage>('/api/account/library', {
        query: { ...filters.value, cursor },
        signal: active.signal,
        retry: 0,
        timeout: 15_000,
      })
      if (disposed || active.signal.aborted || expected !== context.value || !current.value) return
      request.data.value = {
        ...current.value,
        items: mergeLibraryItems(items.value, page.items),
        nextCursor: page.nextCursor,
      }
    } catch (error) {
      if (!disposed && !active.signal.aborted && expected === context.value)
        feedback.value = workspaceFeedback(error, '加载失败，已有公式保留，请重试。')
    } finally {
      if (controller === active) {
        loadingMore.value = false
        controller = undefined
      }
    }
  }
  function favoriteChanged(id: string, favorite: boolean) {
    if (!current.value) return
    // 收藏修改使正在读取的旧分页快照失效，不让迟到响应覆盖刚提交的状态。
    cancelMore()
    request.data.value = {
      ...current.value,
      items: items.value.flatMap((item) =>
        item.id !== id ? [item] : kind === 'favorites' && !favorite ? [] : [{ ...item, favorite }],
      ),
    }
    // 当前窗口保留，其他视图下次读取最新收藏；继续使用既有缓存前缀。
    clearNuxtData(
      (key) => key.startsWith('account-library-') && key !== `account-library-${kind}-${ownerId}`,
    )
  }
  return {
    ready: request,
    error: request.error,
    status: request.status,
    filters,
    items,
    nextCursor,
    loadingMore,
    feedback,
    reload,
    loadMore,
    favoriteChanged,
  }
}
