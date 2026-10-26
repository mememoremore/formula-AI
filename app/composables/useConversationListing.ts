import type { ConversationPage } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
/** URL 管搜索，分页只属于当前关键词，迟到请求不混入新结果。 */
export function useConversationListing() {
  const route = useRoute()
  const query = computed(() => (typeof route.query.q === 'string' ? route.query.q : ''))
  const request = useFetch<ConversationPage>('/api/account/conversations', {
    key: 'account-conversations',
    query: { q: query },
  })
  const items = ref<ConversationPage['items']>([])
  const cursor = ref<string | null>(null),
    loading = ref(false),
    feedback = ref('')
  let generation = 0
  watch(
    query,
    () => {
      generation++
      items.value = []
      cursor.value = null
      feedback.value = ''
    },
    { flush: 'sync' },
  )
  watch(
    request.data,
    (page) => {
      items.value = page?.items ?? []
      cursor.value = page?.nextCursor ?? null
    },
    { immediate: true },
  )
  onScopeDispose(() => {
    generation++
  })
  async function more() {
    if (!cursor.value || loading.value) return
    const current = generation
    loading.value = true
    feedback.value = ''
    try {
      const page = await $fetch<ConversationPage>('/api/account/conversations', {
        query: { q: query.value, cursor: cursor.value },
        retry: 0,
        timeout: 15000,
      })
      if (current !== generation) return
      const ids = new Set(items.value.map((item) => item.id))
      items.value.push(...page.items.filter((item) => !ids.has(item.id)))
      cursor.value = page.nextCursor
    } catch (error) {
      if (current === generation)
        feedback.value = workspaceFeedback(error, '暂时无法加载更多对话。')
    } finally {
      loading.value = false
    }
  }
  return { request, query, items, cursor, loading, feedback, more }
}
