import { test } from 'vitest'
import assert from 'node:assert/strict'
import { loadHomeRecent, homeDemoConversation } from '../app/utils/home-overview'
import { demoFormulas, demoCategories } from '../shared/demo/formulas'
import type { DemoState } from '../shared/types/demo'
import type { RecognitionHistoryPage } from '../shared/types/tasks'

const history: RecognitionHistoryPage = {
  items: Array.from({ length: 12 }, (_, i) => ({
    id: 'recognition-' + i,
    status: 'COMPLETED',
    title: '公式',
    formulaId: 'formula-' + i,
    latex: 'x=' + i,
    createdAt: '2026-11-08',
    errorMessage: null,
  })),
  nextCursor: 'next',
}

test('首页只读取识别历史并截取最新10条，不请求公式库或 AI 会话', async () => {
  const controller = new AbortController()
  const calls: string[] = []
  const result = await loadHomeRecent(
    'owner',
    async <T>(path: string, options: { signal: AbortSignal; retry: 0; timeout: number }) => {
      calls.push(path)
      assert.equal(options.signal, controller.signal)
      assert.equal(options.retry, 0)
      assert.equal(options.timeout, 10_000)
      return history as T
    },
    controller.signal,
  )
  assert.deepEqual(calls, ['/api/account/recognitions'])
  assert.equal(result.ownerId, 'owner')
  assert.deepEqual(result.recognitions, history.items.slice(0, 10))
  assert.equal(result.failed, false)
})

test('最近识别加载失败保留所属账号并明确失败，不替换为演示数据', async () => {
  const result = await loadHomeRecent(
    'owner',
    async () => {
      throw new Error('受控故障')
    },
    new AbortController().signal,
  )
  assert.deepEqual(result, { ownerId: 'owner', recognitions: [], failed: true })
})

test('取消后的旧结果不能作为首页成功结果提交', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    loadHomeRecent('old-owner', async <T>() => history as T, controller.signal),
    { name: 'AbortError' },
  )
})
test('游客继续对话保留旧版本，忽略孤立会话且不伪造时间', () => {
  const state: DemoState = {
    schemaVersion: 1,
    formulas: structuredClone(demoFormulas),
    categories: structuredClone(demoCategories),
    chats: {},
  }
  const formula = state.formulas[0]!
  const oldVersion = formula.versions[0]!
  formula.versions.push({ ...oldVersion, id: 'new-version', latex: 'x=2' })
  formula.versionId = 'new-version'
  state.chats['version:missing'] = [{ role: 'user', content: '孤立' }]
  state.chats['version:' + oldVersion.id] = [{ role: 'user', content: '原版本的问题' }]
  const entry = homeDemoConversation(state)!
  assert.equal(entry.latex, oldVersion.latex)
  assert.equal(entry.subtitle, '原版本的问题')
  assert.ok(entry.to.includes('demoVersionId=' + encodeURIComponent(oldVersion.id)))
  assert.equal(homeDemoConversation({ ...state, chats: {} }), undefined)
  assert.equal(
    homeDemoConversation({ ...state, chats: { general: [{ role: 'user', content: '自由问题' }] } })
      ?.to,
    '/ai/new?space=demo',
  )
})
