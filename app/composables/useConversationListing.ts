import type { ConversationPage } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
/** URL 搜索限定列表快照，首屏与追加请求都不能跨关键词写入。 */
export function useConversationListing(ownerId: string) {
  const route = useRoute(),
    fetcher = useRequestFetch()
  const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
  const request = useAsyncData(
    `account-conversations-${ownerId}`,
    async (_app, { signal }) => {
      const q = query.value
      const page = await fetcher<ConversationPage>('/api/account/conversations', {
        query: { q },
        signal,
        retry: 0,
        timeout: 15000,
      })
      signal.throwIfAborted()
      return { ...page, q }
    },
    {
      watch: [query],
      getCachedData: (_key, app, ctx) =>
        ctx.cause === 'initial' && app.isHydrating
          ? app.payload.data[`account-conversations-${ownerId}`]
          : undefined,
    },
  )
  const current = computed(() =>
    request.data.value?.q === query.value ? request.data.value : undefined,
  )
  const items = computed(() => current.value?.items ?? []),
    cursor = computed(() => current.value?.nextCursor ?? null)
  const loading = ref(false),
    feedback = ref('')
  let controller: AbortController | undefined,
    disposed = false
  function cancel() {
    controller?.abort()
    controller = undefined
    loading.value = false
    feedback.value = ''
  }
  watch(query, cancel, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    cancel()
    if (import.meta.client) request.clear()
  })
  async function more() {
    if (!cursor.value || loading.value || request.status.value === 'pending' || disposed) return
    const q = query.value,
      after = cursor.value,
      active = new AbortController()
    controller = active
    loading.value = true
    feedback.value = ''
    try {
      const page = await $fetch<ConversationPage>('/api/account/conversations', {
        query: { q, cursor: after },
        signal: active.signal,
        retry: 0,
        timeout: 15000,
      })
      if (disposed || active.signal.aborted || query.value !== q || !current.value) return
      const ids = new Set(items.value.map((item) => item.id))
      request.data.value = {
        ...current.value,
        items: [...items.value, ...page.items.filter((item) => !ids.has(item.id))],
        nextCursor: page.nextCursor,
      }
    } catch (error) {
      if (!disposed && !active.signal.aborted)
        feedback.value = workspaceFeedback(error, '暂时无法加载更多对话，已有记录保留。')
    } finally {
      if (controller === active) {
        loading.value = false
        controller = undefined
      }
    }
  }
  return { request, query, items, cursor, loading, feedback, more }
}
