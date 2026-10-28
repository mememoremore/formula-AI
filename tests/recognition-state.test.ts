import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptRecognitionSnapshot,
  parseRecognitionReceipts,
  recognitionInvalidates,
  recognitionResultOrigin,
  receiptIdentity,
} from '../app/utils/recognition-state'
import type { RecognitionTaskState } from '../shared/types/tasks'
const receipt = { ownerId: 'owner', fileId: 'file', mode: 'printed' as const, requestKey: 'key' }
const task: RecognitionTaskState = {
  id: 'task',
  fileId: 'file',
  mode: 'printed',
  status: 'PROCESSING',
  attemptCount: 2,
  maxAttempts: 3,
  errorMessage: null,
  formulaId: null,
  isMock: false,
}
test('恢复信息仅保留任务字段，不持久化图片、URL或额外字段', () => {
  assert.deepEqual(
    parseRecognitionReceipts(
      JSON.stringify([{ ...receipt, url: 'blob:private', image: 'secret' }]),
    ),
    [receipt],
  )
  assert.notEqual(receiptIdentity(receipt), receiptIdentity({ ...receipt, ownerId: 'other' }))
  assert.notEqual(receiptIdentity(receipt), receiptIdentity({ ...receipt, sourceTaskId: 'failed' }))
})
test('识别结果继承上传前完整库页筛选，直达上传无来源时回最近识别', () => {
  const task = '/recognitions/id',
    upload = '/upload?space=account'
  assert.equal(
    recognitionResultOrigin(
      { [task]: upload, [upload]: '/library?space=account&q=x&category=a' },
      task,
    ),
    '/library?space=account&q=x&category=a',
  )
  assert.equal(
    recognitionResultOrigin({ [task]: upload }, task),
    '/library?space=account&view=recent',
  )
  assert.equal(recognitionResultOrigin({ [task]: '/help' }, task), undefined)
})
test('恢复数据损坏、重复、过多或类型错误时拒绝使用', () => {
  for (const raw of [
    'bad',
    '{}',
    JSON.stringify([receipt, receipt]),
    JSON.stringify(Array(21).fill(receipt)),
    ...['fileId', 'ownerId', 'requestKey', 'mode', 'sourceTaskId'].map((key) =>
      JSON.stringify([{ ...receipt, [key]: 5 }]),
    ),
  ])
    assert.throws(() => parseRecognitionReceipts(raw))
  assert.deepEqual(parseRecognitionReceipts(null), [])
})
test('任务终态和较旧尝试快照不能覆盖当前状态', () => {
  assert.equal(
    acceptRecognitionSnapshot(task, { ...task, status: 'QUEUED', attemptCount: 1 }),
    task,
  )
  for (const status of ['COMPLETED', 'FAILED'] as const) {
    const done = { ...task, status }
    assert.equal(acceptRecognitionSnapshot(done, { ...task, attemptCount: 3 }), done)
  }
})
test('合法后台自动重试可以从处理中回到排队，后续尝试可继续', () => {
  const queued = { ...task, status: 'QUEUED' as const, errorMessage: '等待重试' }
  assert.equal(acceptRecognitionSnapshot(task, queued), queued)
  const next = { ...task, attemptCount: 3 }
  assert.equal(acceptRecognitionSnapshot(queued, next), next)
  assert.equal(acceptRecognitionSnapshot(undefined, task), task)
})
test('不能把其他任务、文件或模式的响应混入当前任务', () => {
  for (const change of [{ id: 'other' }, { fileId: 'other' }, { mode: 'handwritten' as const }])
    assert.throws(() => acceptRecognitionSnapshot(task, { ...task, ...change }), /不匹配/)
})
test('识别缓存规则覆盖历史前缀、首页及账号额度而不清理游客或无关对话', () => {
  for (const key of ['account-history', 'account-history-owner'])
    assert.ok(recognitionInvalidates(key, 'submitted'))
  assert.ok(recognitionInvalidates('account-usage-owner', 'submitted'))
  assert.equal(recognitionInvalidates('home-recent', 'submitted'), false)
  for (const key of ['home-recent', 'account-library-library-owner', 'account-categories'])
    assert.ok(recognitionInvalidates(key, 'completed'))
  assert.equal(recognitionInvalidates('account-usage-owner', 'changed'), false)
  for (const key of ['demo-store', 'saved-formula-id-owner', 'account-conversations'])
    assert.equal(recognitionInvalidates(key, 'completed'), false)
})
