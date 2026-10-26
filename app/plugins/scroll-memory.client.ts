import { pageScrollMemory } from '~/utils/scroll-memory'

export default defineNuxtPlugin((nuxtApp) => {
  const router = useRouter()
  // 必须在路由切换、旧长页面卸载之前采集，不能在新页面已渲染后读取旧位置。
  const removeGuard = router.beforeEach((_to, from) => {
    if (from.name)
      pageScrollMemory.remember(from.fullPath, { left: window.scrollX, top: window.scrollY })
  })
  nuxtApp.vueApp.onUnmount(removeGuard)
})
