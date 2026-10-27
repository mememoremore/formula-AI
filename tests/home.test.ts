import test from 'node:test'
import assert from 'node:assert/strict'
import { loadHomeRecent, homeDemoConversation } from '../app/utils/home-overview'
import { demoFormulas, demoCategories } from '../shared/demo/formulas'
import type { DemoState } from '../shared/types/demo'
import type { FormulaLibraryPage } from '../shared/types/library'
import type { ConversationPage } from '../shared/types/tasks'

const library: FormulaLibraryPage = {
  items: [
    {
      id: 'f',
      title: '公式',
      latex: 'x=1',
      createdAt: '2026-10-26',
      versionNumber: 1,
      isMock: false,
      category: null,
      favorite: false,
    },
  ],
  nextCursor: null,
}
const conversations: ConversationPage = {
  items: [{ id: 'c', title: '对话', createdAt: '2026-10-26' }],
  nextCursor: null,
}
for (const failure of ['', 'library', 'conversations', 'both']) {
  test('首页部分失败隔离：' + (failure || '成功'), async () => {
    const controller = new AbortController()
    const calls: string[] = []
    const result = await loadHomeRecent(
      'owner',
      async <T>(path: string, options: { signal: AbortSignal; retry: 0; timeout: number }) => {
        calls.push(path)
        assert.equal(options.signal, controller.signal)
        assert.equal(options.retry, 0)
        assert.equal(options.timeout, 10_000)
        if (failure === 'both' || (failure && path.endsWith(failure))) throw new Error('受控故障')
        // 此替身只实现两个已声明 DTO；断言不进入生产代码。
        return (path.endsWith('library') ? library : conversations) as T
      },
      controller.signal,
    )
    assert.equal(result.ownerId, 'owner')
    assert.equal(calls.length, 2)
    assert.equal(result.formulas.length, failure === 'library' || failure === 'both' ? 0 : 1)
    assert.equal(
      result.conversation?.id,
      failure === 'conversations' || failure === 'both' ? undefined : 'c',
    )
    assert.equal(result.failed.length, failure === 'both' ? 2 : failure ? 1 : 0)
  })
}
test('取消后的旧结果不能作为首页成功结果提交', async () => {
  const controller = new AbortController()
  controller.abort()
  await assert.rejects(
    loadHomeRecent(
      'old-owner',
      async <T>(path: string) => (path.endsWith('library') ? library : conversations) as T,
      controller.signal,
    ),
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
