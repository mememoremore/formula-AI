import test from 'node:test'
import assert from 'node:assert/strict'
import { acceptConversationSnapshot, parseConversationSnapshot } from '../app/utils/chat-state'
import { buildChatMessages } from '../server/chat/prompt'
import { providerUsage } from '../server/chat/call-metadata'
import type { SavedConversation } from '../shared/types/tasks'

const snapshot = (revision: string, text = ''): SavedConversation => ({
  protocolVersion: 2,
  revision,
  id: 'c',
  title: '对话',
  context: null,
  hasEarlierMessages: false,
  messages: [],
  currentTurn: {
    id: 't',
    status: 'PROCESSING',
    attemptCount: 2,
    maxAttempts: 3,
    partialContent: text,
    errorMessage: null,
    isMock: true,
    modelVersion: 'fixture',
  },
})
test('v2 GET/SSE/停止响应任意乱序均保留最大服务端revision', () => {
  const get = snapshot('3', '旧'),
    sse = snapshot('4', '新'),
    stop = snapshot('5', '新')
  stop.currentTurn!.status = 'FAILED'
  for (const order of [
    [get, sse, stop],
    [stop, get, sse],
    [sse, stop, get],
    [sse, get, stop],
    [get, stop, sse],
    [stop, sse, get],
  ]) {
    let accepted: SavedConversation | undefined
    for (const value of order) accepted = acceptConversationSnapshot(accepted, value)
    assert.equal(accepted, stop)
  }
})
test('合法同attempt重置可接受；相同revision冲突必须拒绝并进入重读', () => {
  assert.equal(acceptConversationSnapshot(snapshot('9', '旧片段'), snapshot('10')).revision, '10')
  assert.throws(() => acceptConversationSnapshot(snapshot('10', 'A'), snapshot('10', 'B')), /冲突/)
  const current = snapshot('10')
  assert.equal(acceptConversationSnapshot(current, structuredClone(current)), current)
  const large = snapshot('9007199254740993')
  assert.equal(acceptConversationSnapshot(snapshot('9007199254740992'), large), large)
})
test('v2拒绝缺失/负数/不安全修订号及会话错配，旧协议仍可解析', () => {
  const old = snapshot('0')
  delete old.revision
  delete old.protocolVersion
  assert.equal(parseConversationSnapshot(old, 'c'), old)
  assert.throws(() => parseConversationSnapshot(old, 'c', true))
  for (const revision of ['-1', '1.1', '01', '9223372036854775808'])
    assert.throws(() => parseConversationSnapshot({ ...snapshot('0'), revision }, 'c', true))
  assert.throws(() => acceptConversationSnapshot(snapshot('1'), { ...snapshot('2'), id: 'other' }))
})
test('完整问答按整对预算裁剪，当前问题只加入一次', () => {
  const messages = buildChatMessages({
    messages: [
      { role: 'user', content: '早期问题' },
      { role: 'assistant', content: 'x'.repeat(20000) },
      { role: 'user', content: '近期问题' },
      { role: 'assistant', content: '近期回答' },
      { role: 'user', content: '当前问题' },
    ],
  })
  assert.deepEqual(
    messages.slice(1).map((m) => m.content),
    ['近期问题', '近期回答', '当前问题'],
  )
  assert.equal(messages.filter((m) => m.content === '当前问题').length, 1)
})
test('仅接受供应商原始整数用量，不推算未知用量或费用', () => {
  assert.equal(providerUsage(undefined), undefined)
  assert.equal(providerUsage({ input_tokens: 10 }), undefined)
  assert.equal(providerUsage({ prompt_tokens: -1 }), undefined)
  assert.deepEqual(providerUsage({ prompt_tokens: 0, completion_tokens: 12 }), {
    inputTokens: 0,
    outputTokens: 12,
  })
  assert.equal(providerUsage({ total_tokens: 1.2 }), undefined)
})
