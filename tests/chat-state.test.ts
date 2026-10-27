import assert from 'node:assert/strict'
import { test } from 'node:test'
import { acceptConversationSnapshot, parseConversationSnapshot } from '../app/utils/chat-state'
import type { SavedConversation } from '../shared/types/tasks'
function snapshot(
  status: 'QUEUED' | 'PROCESSING' | 'COMPLETED' | 'FAILED' = 'PROCESSING',
  partialContent = '已生成一段内容',
  attemptCount = 1,
): SavedConversation {
  return {
    id: 'conversation',
    title: '对话',
    context: null,
    hasEarlierMessages: false,
    messages: [
      {
        id: 'q1',
        position: 1,
        role: 'USER',
        content: '问题',
        status: 'COMPLETED',
        isMock: true,
        modelVersion: null,
      },
    ],
    currentTurn: {
      id: 't1',
      status,
      partialContent,
      attemptCount,
      maxAttempts: 3,
      errorMessage: null,
      isMock: true,
      modelVersion: null,
    },
  }
}
test('GET 在 SSE 片段之后返回不能缩短同尝试回答', () => {
  const sse = snapshot(),
    get = snapshot('PROCESSING', '已生成')
  assert.equal(acceptConversationSnapshot(sse, get), sse)
})
test('停止结果不能被旧 SSE 或 GET 重新激活', () => {
  const stop = snapshot('FAILED')
  assert.equal(acceptConversationSnapshot(stop, snapshot()), stop)
})
test('生成完成后迟到的停止响应不能改成失败', () => {
  const completed = snapshot('COMPLETED')
  assert.equal(acceptConversationSnapshot(completed, snapshot('FAILED')), completed)
})
test('较低尝试拒绝，但新尝试可重置片段，合法重新排队可展示', () => {
  const retry = snapshot('QUEUED', '', 2)
  assert.equal(acceptConversationSnapshot(retry, snapshot()), retry)
  assert.equal(acceptConversationSnapshot(snapshot(), retry), retry)
  const queued = snapshot('QUEUED', '')
  assert.equal(acceptConversationSnapshot(snapshot(), queued), queued)
})
test('后续轮次的消息位置阻止旧轮次回写', () => {
  const next = snapshot()
  next.messages.push({ ...next.messages[0]!, id: 'q2', position: 3 })
  next.currentTurn!.id = 't2'
  assert.equal(acceptConversationSnapshot(next, snapshot()), next)
  assert.equal(acceptConversationSnapshot(snapshot('COMPLETED'), next), next)
})
test('其他会话和无效 SSE 快照拒绝', () => {
  assert.throws(() => parseConversationSnapshot({ ...snapshot(), id: 'other' }, 'conversation'))
  assert.throws(() =>
    parseConversationSnapshot({ ...snapshot(), messages: [{ position: 1 }] }, 'conversation'),
  )
  assert.throws(() =>
    parseConversationSnapshot(
      { ...snapshot(), currentTurn: { status: 'CANCELLED' } },
      'conversation',
    ),
  )
})
test('同轮无法比较的非前缀片段不冒称更新；不使用客户端时间', () => {
  const current = snapshot()
  assert.equal(
    acceptConversationSnapshot(current, snapshot('PROCESSING', '完全不同的内容')),
    current,
  )
  const longer = snapshot('PROCESSING', '已生成一段内容，继续')
  assert.equal(acceptConversationSnapshot(current, longer), longer)
})
test('不可变消息冲突拒绝，终态首次新增的持久化回答可进入', () => {
  const current = snapshot(),
    bad = snapshot()
  bad.messages[0]!.content = '篡改问题'
  assert.equal(acceptConversationSnapshot(current, bad), current)
  const done = snapshot('COMPLETED')
  done.messages.push({
    ...done.messages[0]!,
    id: 'a1',
    position: 2,
    role: 'ASSISTANT',
    content: '完整回答',
  })
  assert.equal(acceptConversationSnapshot(current, done), done)
})
