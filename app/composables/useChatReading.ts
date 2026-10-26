import type { WatchSource } from 'vue'
/** 只有读者停留在底部时才跟随增量；上翻阅读不被每个 SSE 快照拉走。 */
export function useChatReading(content: WatchSource<unknown>[]) {
  const following = ref(true)
  const mounted = ref(false)
  let frame = 0
  function check() {
    following.value =
      document.documentElement.scrollHeight - window.scrollY - window.innerHeight < 160
    if (!following.value) cancelAnimationFrame(frame)
  }
  function bottom() {
    following.value = true
    window.scrollTo({ top: document.documentElement.scrollHeight })
  }
  watch(
    content,
    async () => {
      if (!mounted.value || !following.value) return
      await nextTick()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        if (following.value) bottom()
      })
    },
    { flush: 'post' },
  )
  onMounted(() => {
    mounted.value = true
    window.addEventListener('scroll', check, { passive: true })
    nextTick(bottom)
  })
  onScopeDispose(() => {
    if (import.meta.client) {
      window.removeEventListener('scroll', check)
      cancelAnimationFrame(frame)
    }
  })
  return { following, bottom }
}
