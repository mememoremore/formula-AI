import type { ContentWidth } from '../utils/layout'

declare module '#app' {
  interface PageMeta {
    compactTop?: boolean
    contentWidth?: ContentWidth
    bottomNav?: boolean
  }
}

export {}
