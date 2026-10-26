import type { RouterConfig } from '@nuxt/schema'
import { pageScrollMemory } from './utils/scroll-memory'

export default {
  scrollBehavior(to, from, saved) {
    // 浏览器前后退提供的历史项优先于同页查询/锚点规则。
    if (saved) return saved
    if (to.hash) return { el: to.hash, top: 24 }
    if (to.path === from.path) return false
    return (import.meta.client && pageScrollMemory.get(to.fullPath)) || { left: 0, top: 0 }
  },
} satisfies RouterConfig
