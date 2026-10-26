import type { ContentWidth } from '../utils/layout'

declare module '#app' {
  interface PageMeta {
    contentWidth?: ContentWidth
    bottomNav?: boolean
  }
}

export {}
