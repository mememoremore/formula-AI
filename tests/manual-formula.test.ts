import { isTransientPage, safeReturnPath } from '../shared/navigation'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { randomUUID } from 'node:crypto'
import { manualFormulaFeedback, formulaSyntaxFeedback } from '../shared/formula-validation'
import { parseManualFormula, manualFormulaHash } from '../server/services/manual-formula-input'
import { parseManualCreationReceipt } from '../app/utils/manual-creation'

test('手动公式支持分式、矩阵、多行，首尾空白归一化后摘要一致', () => {
  for (const latex of [
    '\\frac{a}{b}',
    '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
    '\\begin{aligned}x&=1\\\\y&=2\\end{aligned}',
  ])
    assert.equal(manualFormulaFeedback('公式', latex), '')
  const key = randomUUID(),
    a = parseManualFormula({ requestKey: key, title: ' 原名 ', latex: ' x=1\n' }),
    b = parseManualFormula({ requestKey: key.toUpperCase(), title: '原名', latex: 'x=1' })
  assert.deepEqual(a, b)
  assert.equal(manualFormulaHash(a), manualFormulaHash(b))
  assert.notEqual(manualFormulaHash(a), manualFormulaHash({ ...a, latex: 'x=2' }))
})
test('服务端拒绝非法语法、文档、外部资源、控制字符和长度越界', () => {
  for (const latex of [
    '',
    'x'.repeat(5001),
    '\\frac{',
    '\\unknowncommand{x}',
    '\\href{https://invalid.test}{x}',
    '\\htmlClass{a}{x}',
    '\\documentclass{article}',
    '```x```',
    'x\0',
  ])
    assert.throws(() => parseManualFormula({ requestKey: randomUUID(), title: '公式', latex }))
  for (const title of ['', '名'.repeat(101), 'x\ny'])
    assert.throws(() => parseManualFormula({ requestKey: randomUUID(), title, latex: 'x' }))
  assert.throws(() => parseManualFormula({ requestKey: 'bad', title: '公式', latex: 'x' }))
})
test('渲染错误提供有界原因，不返回异常堆栈', () => {
  const reason = formulaSyntaxFeedback('\\unknowncommand{x}')
  assert.match(reason, /unknowncommand/)
  assert.ok(reason.length < 220)
  assert.doesNotMatch(reason, /at .*\.ts:/)
})
test('会话回执绑定账号且能恢复原始请求键和内容', () => {
  const owner = randomUUID(),
    value = { ownerId: owner, input: { requestKey: randomUUID(), title: '公式', latex: 'x^2' } }
  assert.deepEqual(parseManualCreationReceipt(JSON.stringify(value), owner), value)
  assert.equal(parseManualCreationReceipt(JSON.stringify(value), randomUUID()), null)
  assert.equal(parseManualCreationReceipt(null, owner), null)
})
test('损坏或非法会话回执拒绝静默产生新的保存请求', () => {
  const owner = randomUUID()
  assert.throws(() => parseManualCreationReceipt('{bad', owner))
  assert.throws(() =>
    parseManualCreationReceipt(
      JSON.stringify({ ownerId: owner, input: { title: 'x', latex: 'x', requestKey: 'bad' } }),
      owner,
    ),
  )
  assert.throws(() => parseManualCreationReceipt('x'.repeat(40001), owner))
})

test('手动创建入口支持登录返回，保存后的详情返回不再落入新建草稿', () => {
  assert.equal(safeReturnPath('/formulas/new'), '/formulas/new')
  assert.equal(isTransientPage('/formulas/new'), true)
})
