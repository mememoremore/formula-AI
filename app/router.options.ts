import type { RouterConfig } from '@nuxt/schema'
const positions = new Map<string, { left: number; top: number }>()
export default <RouterConfig>{
  scrollBehavior(to, from, saved) {
    if (import.meta.client)
      positions.set(from.fullPath, { left: window.scrollX, top: window.scrollY })
    if (to.hash) return { el: to.hash, top: 24 }
    if (to.path === from.path) return false
    return saved ?? positions.get(to.fullPath) ?? { left: 0, top: 0 }
  },
}
