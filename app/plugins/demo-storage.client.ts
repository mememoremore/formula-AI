import { DEMO_STORAGE_KEY, parseDemoState } from '~/utils/demo-storage'

export default defineNuxtPlugin(() => {
  const state = useDemoStore()
  const { showToast } = useToast()
  // Wait for async page hydration as well as the root mount before restoring local data.
  onNuxtReady(() => {
    try {
      const raw = localStorage.getItem(DEMO_STORAGE_KEY)
      if (raw) {
        const restored = parseDemoState(raw)
        if (restored) state.value = restored
        else showToast('本机演示数据格式已变化，已载入默认示例。')
      }
    } catch {
      showToast('浏览器存储不可用，本次修改仅在当前会话保留。')
    }

    let warned = false
    watch(
      state,
      (value) => {
        try {
          localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(value))
        } catch {
          if (!warned) showToast('本机保存失败，请勿关闭页面；浏览器存储可能已满。')
          warned = true
        }
      },
      { deep: true },
    )
  })
})
