export interface ScrollPosition {
  left: number
  top: number
}

/** 仅保存本标签页的位置；有界缓存防止长会话持续累积 URL。 */
export function createScrollMemory(limit = 100) {
  const positions = new Map<string, ScrollPosition>()
  return {
    get: (path: string) => positions.get(path),
    remember(path: string, position: ScrollPosition) {
      positions.delete(path)
      positions.set(path, { ...position })
      if (positions.size > limit) positions.delete(positions.keys().next().value!)
    },
  }
}

// 只有 .client 插件会写入。SSR 不读取或保存请求的 URL/滚动数据。
export const pageScrollMemory = createScrollMemory()
