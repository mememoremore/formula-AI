import test from 'node:test'
import assert from 'node:assert/strict'
import {
  parseExplanation,
  decodeExplanation,
  explanationText,
  EXPLANATION_PROMPT_VERSION,
} from '../shared/explanation'
import { explanationFixture as value } from './fixtures/explanation'
import { buildChatMessages } from '../server/chat/prompt'
import { acceptConversationSnapshot, parseConversationSnapshot } from '../app/utils/chat-state'
import type { SavedConversation } from '../shared/types/tasks'
import { parseExplanationIntent } from '../app/utils/explanation-intent'
test('解释契约接受完整结构及空的可选区块', () => {
  assert.deepEqual(decodeExplanation(JSON.stringify(value)), value)
  assert.ok(explanationText(value).includes('适用条件'))
  assert.equal(
    parseExplanation({
      ...value,
      symbols: [],
      conditions: [],
      steps: [],
      examples: [],
      warnings: [],
    }).schemaVersion,
    1,
  )
})
test('拒绝空、截断、围栏、额外字段和错误版本', () => {
  for (const raw of ['', '{', '{}', 'null', '[]', 'not-json-fence'])
    assert.throws(() => decodeExplanation(raw))
  for (const v of [
    { ...value, schemaVersion: 2 },
    { ...value, extra: true },
    { ...value, summary: '' },
    { ...value, steps: [{ title: 'A' }] },
  ])
    assert.throws(() => parseExplanation(v))
})
test('拒绝超长、过多条目、HTML和无法渲染的公式', () => {
  for (const v of [
    { ...value, summary: 'x'.repeat(1201) },
    { ...value, symbols: Array(13).fill(value.symbols[0]) },
    { ...value, examples: ['<script>hi</script>'] },
    { ...value, symbols: [{ latex: '\\notARealCommand', meaning: 'a' }] },
  ])
    assert.throws(() => parseExplanation(v))
})
test('结构化Prompt版本固定且当前问题只出现一次', () => {
  const input = {
    responseKind: 'FORMULA_EXPLANATION' as const,
    promptVersion: EXPLANATION_PROMPT_VERSION,
    formula: { versionId: 'fixed', latex: 'x=1' },
    messages: [{ role: 'user' as const, content: '当前问题' }],
  }
  const rows = buildChatMessages(input)
  assert.match(rows[0]!.content, /json/)
  assert.equal(rows.filter((v) => v.content === '当前问题').length, 1)
  assert.throws(() => buildChatMessages({ ...input, promptVersion: 'future' }))
})
test('长期追问保留首份解释并按完整问答控制预算', () => {
  const rows = buildChatMessages({
    promptVersion: 'formula-followup-v1',
    baseExplanation: { question: '初始解释', answer: '固定解释' },
    messages: [
      ...Array.from({ length: 20 }, (_, i) => [
        { role: 'user' as const, content: 'Q' + i },
        { role: 'assistant' as const, content: 'A' + i },
      ]).flat(),
      { role: 'user', content: '追问' },
    ],
  })
  assert.equal(rows[1]!.content, '初始解释')
  assert.equal(rows[2]!.content, '固定解释')
  assert.equal(rows.at(-1)!.content, '追问')
  assert.ok(rows.length <= 20)
})
const snapshot = (revision: string): SavedConversation => ({
  id: 'c',
  title: '解释',
  protocolVersion: 2,
  revision,
  purpose: 'EXPLANATION',
  baseExplanation: {
    messageId: 'm',
    isMock: true,
    modelVersion: 'fixture',
    turnId: 't',
    createdAt: new Date(0).toISOString(),
    content: explanationText(value),
    structured: value,
    promptVersion: EXPLANATION_PROMPT_VERSION,
  },
  context: { id: 'v', formulaId: 'f', number: 1, title: 'T', latex: 'x=1' },
  messages: [],
  currentTurn: null,
  hasEarlierMessages: false,
})
test('新字段参与同revision冲突与基础解释不可变检查', () => {
  const a = snapshot('2')
  assert.equal(acceptConversationSnapshot(a, snapshot('1')), a)
  assert.throws(() =>
    acceptConversationSnapshot(a, {
      ...snapshot('2'),
      baseExplanation: { ...a.baseExplanation!, promptVersion: 'different' },
    }),
  )
  assert.throws(() => acceptConversationSnapshot(a, { ...snapshot('3'), baseExplanation: null }))
  assert.throws(() =>
    parseConversationSnapshot(
      { ...a, baseExplanation: { ...a.baseExplanation!, structured: {} } },
      'c',
      true,
    ),
  )
})
test('账号回执拒绝损坏内容及其他账号/公式', () => {
  const id = '10000000-0000-4000-8000-000000000001',
    other = '10000000-0000-4000-8000-000000000002'
  const raw = JSON.stringify({ ownerId: id, formulaId: id, versionId: id, requestKey: id })
  assert.ok(parseExplanationIntent(raw, id, id))
  assert.equal(parseExplanationIntent(raw, other, id), null)
  assert.equal(parseExplanationIntent(raw, id, other), null)
  assert.equal(parseExplanationIntent('{', id, id), null)
})

import { explanationCopyText } from '../app/utils/explanation-copy'
test('完整解释复制以确定顺序保留LaTeX，不含协议或内部元数据', () => {
  const output = explanationCopyText(value)
  assert.equal(
    output,
    [
      '概述\n' + value.summary,
      '符号含义\n$x$：待求的未知数',
      '适用条件\n1. 在给定数域中讨论。',
      '理解与推导\n1. 观察结构\n识别运算顺序和等式关系。\n$$x^2-5x+6=0$$',
      '应用例子\n1. 可以用因式分解法核对解。',
      '注意事项\n1. 这是一份受控测试解释，不是数学正确性证明。',
    ].join('\n\n'),
  )
  assert.doesNotMatch(output, /schemaVersion|promptVersion|turnId|messageId/)
})
test('复制空区块不产生标题，不改变原结构', () => {
  const empty = { ...value, symbols: [], conditions: [], steps: [], examples: [], warnings: [] }
  assert.equal(explanationCopyText(empty), '概述\n' + value.summary)
  assert.deepEqual(empty.symbols, [])
})
