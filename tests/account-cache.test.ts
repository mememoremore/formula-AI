import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  usageInvalidated,
  formulaViewsInvalidated,
  chatSubmissionInvalidated,
} from '../app/utils/account-cache'
import { recognitionInvalidates } from '../app/utils/recognition-state'

test('所有导出入口使用同一额度规则，覆盖账号键及旧键', () => {
  for (const key of ['account-usage', 'account-usage-owner-a', 'account-usage-owner-b'])
    assert.equal(usageInvalidated(key), true)
  for (const key of [
    'account-usages',
    'account-session',
    'account-service-status-owner-a',
    'demo-store',
  ])
    assert.equal(usageInvalidated(key), false)
})
test('公式保存和识别完成覆盖同一组公式视图，但不替换固定版本上下文', () => {
  for (const key of [
    'account-library-library-owner-a',
    'account-library-favorites-owner-a',
    'account-history',
    'account-history-owner-a',
    'account-categories',
    'home-recent',
  ]) {
    assert.equal(formulaViewsInvalidated(key), true)
    assert.equal(recognitionInvalidates(key, 'completed'), true)
  }
  for (const key of [
    'saved-formula-id-owner-a',
    'draft-context-owner-a-version',
    'account-conversation-owner-a-id',
    'demo-store',
    'account-session',
  ])
    assert.equal(formulaViewsInvalidated(key), false)
  assert.equal(recognitionInvalidates('home-recent', 'submitted'), false)
  assert.equal(recognitionInvalidates('account-usage-owner-a', 'submitted'), true)
  assert.equal(recognitionInvalidates('account-usage-owner-a', 'completed'), false)
})
test('首次发送与续聊共享提交失效范围，停止和快照协议保持独立', () => {
  for (const key of [
    'account-conversations',
    'account-conversations-owner-a',
    'home-recent',
    'account-usage-owner-a',
  ])
    assert.equal(chatSubmissionInvalidated(key), true)
  for (const key of [
    'account-conversation-owner-a-id',
    'draft-context-owner-a-version',
    'account-library-library-owner-a',
    'account-session',
    'demo-store',
  ])
    assert.equal(chatSubmissionInvalidated(key), false)
})
