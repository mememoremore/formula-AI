import type { RecognitionHistoryPage } from '#shared/types/tasks'
import { mergeLibraryItems, readHistoryWindow } from '~/utils/library-state'
import { workspaceFeedback } from '~/utils/workspace-feedback'

export function useAccountHistory(ownerId: string, query = '') {
  const key = 'account-history-' + ownerId + (query ? ':' + encodeURIComponent(query) : '')
  const cached = useNuxtData<RecognitionHistoryPage>(key)
  const revalidate = !!cached.data.value && !useNuxtApp().isHydrating
  const boundary = ref(cached.data.value?.items.at(-1)?.id ?? null)
  const loadingMore = ref(false)
  const feedback = ref('')
  const fetcher = useRequestFetch()
  let moreController: AbortController | undefined
  let disposed = false
  const request = useTaskPolling<RecognitionHistoryPage>(
    key,
    '/api/account/recognitions',
    (page) => page.items.some((item) => item.status === 'QUEUED' || item.status === 'PROCESSING'),
    {
      paused: loadingMore,
      getCachedData: () => cached.data.value,
      read: (signal) =>
        readHistoryWindow(
          (cursor) =>
            fetcher<RecognitionHistoryPage>('/api/account/recognitions', {
              query: { cursor, q: query || undefined },
              signal,
              retry: 0,
            }),
          boundary.value,
          signal,
        ),
    },
  )
  const items = computed(() => request.data.value?.items ?? [])
  onMounted(() => {
    if (revalidate) void request.refresh()
  })
  watch(
    request.data,
    (page) => {
      if (!boundary.value && page?.items.length) boundary.value = page.items.at(-1)!.id
    },
    { immediate: true },
  )
  async function more() {
    const cursor = request.data.value?.nextCursor
    if (!cursor || loadingMore.value || request.status.value === 'pending' || disposed) return
    const controller = new AbortController()
    moreController = controller
    loadingMore.value = true
    feedback.value = ''
    try {
      const page = await $fetch<RecognitionHistoryPage>('/api/account/recognitions', {
        query: { cursor, q: query || undefined },
        signal: controller.signal,
        retry: 0,
        timeout: 15_000,
      })
      if (disposed || controller.signal.aborted) return
      const merged = mergeLibraryItems(items.value, page.items)
      boundary.value = merged.at(-1)?.id ?? null
      request.data.value = { items: merged, nextCursor: page.nextCursor }
    } catch (error) {
      if (!disposed && !controller.signal.aborted)
        feedback.value = workspaceFeedback(error, '加载失败，已有记录保留，请重试。')
    } finally {
      if (moreController === controller) {
        loadingMore.value = false
        moreController = undefined
      }
    }
  }
  function reload() {
    feedback.value = ''
    return request.refresh()
  }
  onScopeDispose(() => {
    disposed = true
    moreController?.abort()
  })
  return { request, items, loadingMore, feedback, more, reload }
}
