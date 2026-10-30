import assert from 'node:assert/strict'
import { test } from 'node:test'
import { displayFormulaTitle } from '../shared/formula-title'
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

test('仅隐藏识别图片产生的随机文件名，保留用户命名', () => {
  const random = '09033e7edee9b9f1866cdf6ae8de538'
  assert.equal(displayFormulaTitle(random, true), '未命名公式')
  assert.equal(displayFormulaTitle('b6874f00-a198-41cb-8000-dde37cd991ca', true), '未命名公式')
  assert.equal(displayFormulaTitle(random, false), random)
  assert.equal(displayFormulaTitle('我的三角函数', true), '我的三角函数')
  assert.equal(displayFormulaTitle('未命名公式', true), '未命名公式')
})
