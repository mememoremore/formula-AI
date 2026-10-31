/** 仅公式库使用的 URL 状态；关键词草稿不覆盖路由中已提交的筛选。 */
export function useLibraryFilters(live = false) {
  const route = useRoute()
  const router = useRouter()
  const query = ref(typeof route.query.q === 'string' ? route.query.q : '')
  const activeCategory = computed(() =>
    typeof route.query.category === 'string' ? route.query.category : '',
  )
  watch(
    () => route.query.q,
    (value) => {
      query.value = typeof value === 'string' ? value : ''
    },
  )
  function search() {
    if ((typeof route.query.q === 'string' ? route.query.q : '') === query.value.trim()) return
    return router[live ? 'replace' : 'push']({
      query: { ...route.query, q: query.value.trim() || undefined },
    })
  }
  function selectCategory(id: string) {
    return router.push({ query: { ...route.query, category: id || undefined } })
  }
  return { query, activeCategory, search, selectCategory }
}
