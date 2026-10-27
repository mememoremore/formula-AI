import test from 'node:test'
import assert from 'node:assert/strict'
import { mergeLibraryItems, readHistoryWindow } from '../app/utils/library-state'
import type { RecognitionHistoryItem, RecognitionHistoryPage } from '../shared/types/tasks'

const item = (
  id: string,
  status: RecognitionHistoryItem['status'] = 'COMPLETED',
): RecognitionHistoryItem => ({
  id,
  status,
  title: id,
  formulaId: null,
  latex: null,
  createdAt: '2026-10-27',
  errorMessage: null,
})
test('列表合并去除跨页和页内重复，采用最新状态但保留顺序', () => {
  assert.deepEqual(
    mergeLibraryItems(
      [{ id: 'a', n: 1 }],
      [
        { id: 'a', n: 2 },
        { id: 'b', n: 3 },
        { id: 'b', n: 4 },
      ],
    ),
    [
      { id: 'a', n: 2 },
      { id: 'b', n: 4 },
    ],
  )
})
test('历史轮询覆盖后页活动项，插入新记录后保留原窗口边界', async () => {
  const pages: Record<string, RecognitionHistoryPage> = {
    first: { items: [item('new'), item('a')], nextCursor: 'a' },
    a: { items: [item('b'), item('c', 'COMPLETED')], nextCursor: 'c' },
    c: { items: [item('d'), item('e')], nextCursor: null },
  }
  const calls: string[] = []
  const page = await readHistoryWindow(
    async (cursor) => {
      calls.push(cursor ?? 'first')
      return pages[cursor ?? 'first']!
    },
    'd',
    new AbortController().signal,
  )
  assert.deepEqual(calls, ['first', 'a', 'c'])
  assert.deepEqual(
    page.items.map((value) => value.id),
    ['new', 'a', 'b', 'c', 'd'],
  )
  assert.equal(page.nextCursor, 'd')
})
test('历史首次读取不额外分页，读到列表尽头不伪造下一页', async () => {
  const first = { items: [item('a')], nextCursor: null }
  assert.deepEqual(
    await readHistoryWindow(async () => first, null, new AbortController().signal),
    first,
  )
  assert.deepEqual(
    await readHistoryWindow(async () => first, 'missing', new AbortController().signal),
    first,
  )
})
test('异常 cursor 循环拒绝而非无限读取', async () => {
  await assert.rejects(
    readHistoryWindow(
      async () => ({ items: [item('a')], nextCursor: 'a' }),
      'z',
      new AbortController().signal,
    ),
    /分页位置重复/,
  )
})
test('历史取消和中间页失败不提交部分窗口', async () => {
  const controller = new AbortController()
  controller.abort()
  let called = false
  await assert.rejects(
    readHistoryWindow(
      async () => {
        called = true
        return { items: [], nextCursor: null }
      },
      'a',
      controller.signal,
    ),
    { name: 'AbortError' },
  )
  assert.equal(called, false)
  await assert.rejects(
    readHistoryWindow(
      async (cursor) => {
        if (cursor) throw new Error('后页失败')
        return { items: [item('a')], nextCursor: 'a' }
      },
      'z',
      new AbortController().signal,
    ),
    /后页失败/,
  )
})
