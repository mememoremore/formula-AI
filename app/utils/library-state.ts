import type { RecognitionHistoryPage } from '../../shared/types/tasks'

/** 保留首次出现顺序，但采用最新值；同时去重跨页与同一页的重复项。 */
export function mergeLibraryItems<T extends { id: string }>(before: T[], incoming: T[]): T[] {
  return [...new Map([...before, ...incoming].map((item) => [item.id, item])).values()]
}

/** 沿既有 cursor 协议读取到已加载尾项，避免只刷新第一页。 */
export async function readHistoryWindow(
  read: (cursor?: string) => Promise<RecognitionHistoryPage>,
  boundary: string | null,
  signal: AbortSignal,
): Promise<RecognitionHistoryPage> {
  let items: RecognitionHistoryPage['items'] = []
  let cursor: string | undefined
  const visited = new Set<string>()
  while (true) {
    signal.throwIfAborted()
    const page = await read(cursor)
    signal.throwIfAborted()
    items = mergeLibraryItems(items, page.items)
    const end = boundary ? items.findIndex((item) => item.id === boundary) : -1
    if (!boundary) return { items, nextCursor: page.nextCursor }
    if (end >= 0)
      return {
        items: items.slice(0, end + 1),
        nextCursor: end < items.length - 1 || page.nextCursor ? boundary : null,
      }
    if (!page.nextCursor) return { items, nextCursor: null }
    if (visited.has(page.nextCursor)) throw new Error('识别历史分页位置重复，请重新加载。')
    visited.add(page.nextCursor)
    cursor = page.nextCursor
  }
}
