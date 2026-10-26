import type { FormulaLibraryItem, FormulaLibraryPage } from '#shared/types/library'
import { workspaceFeedback } from '~/utils/workspace-feedback'

/** 筛选条件保存在 URL；分页只属于当前筛选，迟到的旧请求不能混入新列表。 */
export function useAccountLibrary(kind: 'library' | 'favorites') {
  const route = useRoute()
  const filters = computed(() => ({
    ...(typeof route.query.q === 'string' && route.query.q ? { q: route.query.q } : {}),
    ...(typeof route.query.category === 'string' && route.query.category
      ? { category: route.query.category }
      : {}),
    ...(kind === 'favorites' ? { favorites: 'true' } : {}),
  }))
  const request = useFetch<FormulaLibraryPage>('/api/account/library', {
    key: `account-library-${kind}`,
    query: filters,
  })
  const items = ref<FormulaLibraryItem[]>([])
  const nextCursor = ref<string | null>(null)
  const loadingMore = ref(false)
  const feedback = ref('')
  let generation = 0
  watch(
    filters,
    () => {
      generation++
      items.value = []
      nextCursor.value = null
      feedback.value = ''
    },
    { flush: 'sync' },
  )
  watch(
    request.data,
    (page) => {
      items.value = [...(page?.items ?? [])]
      nextCursor.value = page?.nextCursor ?? null
      feedback.value = ''
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    generation++
  })

  async function reload() {
    generation++
    feedback.value = ''
    await request.refresh()
    if (!request.error.value) {
      items.value = [...(request.data.value?.items ?? [])]
      nextCursor.value = request.data.value?.nextCursor ?? null
    }
  }
  async function loadMore() {
    if (!nextCursor.value || loadingMore.value || request.status.value === 'pending') return
    const currentGeneration = generation
    const cursor = nextCursor.value
    loadingMore.value = true
    feedback.value = ''
    try {
      const page = await $fetch<FormulaLibraryPage>('/api/account/library', {
        query: { ...filters.value, cursor },
        retry: 0,
        timeout: 15_000,
      })
      if (currentGeneration !== generation) return
      const ids = new Set(items.value.map((item) => item.id))
      items.value.push(...page.items.filter((item) => !ids.has(item.id)))
      nextCursor.value = page.nextCursor
    } catch (error) {
      if (currentGeneration === generation)
        feedback.value = workspaceFeedback(error, '加载失败，已显示的记录仍然保留，请重试。')
    } finally {
      loadingMore.value = false
    }
  }
  function favoriteChanged(id: string, favorite: boolean) {
    items.value = items.value.flatMap((item) => {
      if (item.id !== id) return [item]
      return kind === 'favorites' && !favorite ? [] : [{ ...item, favorite }]
    })
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
