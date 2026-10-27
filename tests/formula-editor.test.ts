import assert from 'node:assert/strict'
import { test } from 'node:test'
import { formulaDraftFeedback, formulaDraftChanged } from '../app/utils/formula-editor'
test('公式编辑允许分式、矩阵、多行和长式，安全限制拒绝非法命令', () => {
  for (const latex of [
    '\\frac{1}{2}',
    '\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}',
    '\\begin{aligned}a&=b\\\\c&=d\\end{aligned}',
    'x+'.repeat(100) + '1',
  ])
    assert.equal(formulaDraftFeedback('公式', latex), '')
  for (const latex of ['\\frac{', '\\unknownCommand{x}', '', 'x'.repeat(5001)])
    assert.ok(formulaDraftFeedback('公式', latex))
  assert.ok(formulaDraftFeedback(' ', 'x'))
  assert.ok(formulaDraftFeedback('名'.repeat(101), 'x'))
})
test('草稿与打开时快照比较，归一化首尾空白不制造无效修改', () => {
  const original = { title: '原名', latex: 'x=1' }
  assert.equal(formulaDraftChanged({ title: ' 原名 ', latex: 'x=1\n' }, original), false)
  assert.equal(formulaDraftChanged({ title: '新名', latex: 'x=1' }, original), true)
  assert.equal(formulaDraftChanged({ title: '原名', latex: 'x=2' }, original), true)
})
