import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  recognitionResultState,
  recognitionResultPresentation,
  recognitionHistoryTitle,
} from '../shared/recognition-result'
test('识别完成后区分可查看、已删除和缺失关联，不把已删除说成暂时失败', () => {
  assert.equal(recognitionResultState('PROCESSING', null), 'pending')
  assert.equal(recognitionResultState('COMPLETED', { id: 'f', deletedAt: null }), 'available')
  assert.equal(recognitionResultState('COMPLETED', { id: 'f', deletedAt: new Date() }), 'deleted')
  assert.equal(recognitionResultState('COMPLETED', null), 'missing')
  assert.equal(recognitionResultPresentation({ status: 'COMPLETED', formulaId: 'f' }), null)
  assert.match(
    recognitionResultPresentation({ status: 'COMPLETED', formulaId: null, resultState: 'deleted' })!
      .description,
    /已从公式库删除/,
  )
  assert.match(
    recognitionResultPresentation({ status: 'COMPLETED', formulaId: null })!.description,
    /缺少/,
  )
  assert.equal(recognitionResultPresentation({ status: 'FAILED', formulaId: null }), null)
})
test('识别记录不使用随机文件名作为主标题，用户命名仍保留', () => {
  const row = {
    status: 'COMPLETED' as const,
    formulaId: null,
    title: '09033e7edee9b9f1866cdf6ae8de538.jpg',
  }
  assert.equal(recognitionHistoryTitle({ ...row, resultState: 'deleted' }), '已删除的识别结果')
  assert.equal(recognitionHistoryTitle(row), '公式识别记录')
  assert.equal(recognitionHistoryTitle({ ...row, title: '我的三角函数.jpg' }), '我的三角函数.jpg')
})
