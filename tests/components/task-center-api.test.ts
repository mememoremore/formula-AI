import { beforeAll, beforeEach, afterEach, expect, test, vi } from 'vitest'
const mocks = vi.hoisted(() => {
  const table = () => ({ count: vi.fn(), findMany: vi.fn() })
  return {
    db: {
      recognitionBatch: table(),
      recognitionTask: table(),
      chatTurn: table(),
      exportTask: table(),
    },
  }
})
vi.mock('../../server/utils/auth', () => ({ requireAccountReader: async () => ({ id: 'owner' }) }))
vi.mock('../../server/utils/database', () => ({ getDatabase: () => mocks.db }))
vi.mock('../../server/utils/workspace-operation', () => ({
  workspaceRequest: (_event: unknown, run: () => unknown) => run(),
}))
let handler: (
  event: unknown,
) => Promise<{ active: number; items: { id: string; createdAt: string }[] }>
beforeAll(async () => {
  vi.stubGlobal('defineEventHandler', (value: unknown) => value)
  handler = (await import('../../server/api/account/tasks/index.get'))
    .default as unknown as typeof handler
})
beforeEach(() => {
  vi.stubGlobal('getQuery', () => ({}))
  for (const table of Object.values(mocks.db)) {
    table.count.mockReset().mockResolvedValue(1)
    table.findMany.mockReset().mockResolvedValue([])
  }
})
afterEach(() => vi.unstubAllGlobals())
test('四类任务合并后只返回全局最新20条，保留账号隔离与历史隐藏过滤', async () => {
  Object.values(mocks.db).forEach((table, kind) =>
    table.findMany.mockResolvedValue(
      Array.from({ length: 20 }, (_, i) => ({
        id: `${kind}-${i}`,
        status: 'COMPLETED',
        requestedTitle: null,
        errorMessage: null,
        conversationId: 'conversation',
        createdAt: new Date(Date.UTC(2026, 10, 9, kind, i)),
      })),
    ),
  )
  const result = await handler({})
  expect(result.items).toHaveLength(20)
  expect(result.items.every((item) => item.id.startsWith('3-'))).toBe(true)
  expect(result.items[0]!.id).toBe('3-19')
  expect(result.active).toBe(4)
  for (const table of Object.values(mocks.db))
    expect(table.findMany.mock.calls[0]![0]).toMatchObject({
      take: 20,
      where: { ownerId: 'owner' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    })
  expect(mocks.db.recognitionTask.findMany.mock.calls[0]![0].where.historyDeletedAt).toBeNull()
})
test('概要查询只统计待处理任务，不额外加载历史', async () => {
  vi.stubGlobal('getQuery', () => ({ summary: 'true' }))
  const result = await handler({})
  expect(result).toEqual({ active: 4, items: [] })
  for (const table of Object.values(mocks.db)) expect(table.findMany).not.toHaveBeenCalled()
})
