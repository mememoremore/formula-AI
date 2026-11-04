import assert from 'node:assert/strict'
import { test } from 'vitest'
import { explanationLayout } from '../app/utils/explanation-layout'
const user = (id: string, content: string) => ({ id, role: 'USER' as const, content })
const answer = (id: string) => ({ id, role: 'ASSISTANT' as const, content: '回答' })
test('首次提问放在结构化解释之前，后续问答保持顺序且不重复原始回答', () => {
  const rows = [
    user('q', '请结构化解释这个固定版本公式。'),
    answer('a'),
    user('q2', '有什么用？'),
    answer('a2'),
  ]
  const result = explanationLayout({
    purpose: 'EXPLANATION',
    baseExplanation: { messageId: 'a' },
    messages: rows,
    hasEarlierMessages: false,
  })
  assert.equal(result.question, '请解释这个公式。')
  assert.deepEqual(
    result.messages.map((row) => row.id),
    ['q2', 'a2'],
  )
  assert.equal(rows.length, 4)
})
test('生成中保留提问在上方，普通聊天不改动，截断窗口不移动后续问题', () => {
  const rows = [user('q', '请解释这个公式。')]
  assert.equal(
    explanationLayout({ purpose: 'EXPLANATION', messages: rows, hasEarlierMessages: false })
      .messages.length,
    0,
  )
  assert.deepEqual(
    explanationLayout({ purpose: 'CHAT', messages: rows, hasEarlierMessages: false }),
    { question: null, messages: rows },
  )
  const follow = [user('q2', '追问'), answer('a2')]
  const result = explanationLayout({
    purpose: 'EXPLANATION',
    baseExplanation: { messageId: 'old' },
    messages: follow,
    hasEarlierMessages: true,
  })
  assert.equal(result.question, '请解释这个公式。')
  assert.deepEqual(result.messages, follow)
})
