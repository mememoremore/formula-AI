import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  acceptExportSnapshot,
  exportDownloadPath,
  exportFilename,
  parseExportReceipts,
} from '../app/utils/export-state'
import type { ExportTaskState } from '../shared/types/tasks'
const task: ExportTaskState = {
  id: 'task-1',
  status: 'PROCESSING',
  attemptCount: 2,
  maxAttempts: 3,
  errorMessage: null,
  title: '公式',
  formulaId: 'formula-1',
  formulaVersionId: 'version-1',
  versionNumber: 1,
  downloadUrl: null,
}
test('导出快照保护身份、固定版本、尝试次数及终态，但允许合法自动重试', () => {
  assert.equal(acceptExportSnapshot(task, { ...task, status: 'QUEUED' }).status, 'QUEUED')
  assert.equal(acceptExportSnapshot(task, { ...task, attemptCount: 1 }), task)
  const completed = { ...task, status: 'COMPLETED' as const }
  assert.equal(acceptExportSnapshot(completed, task), completed)
  assert.ok(acceptExportSnapshot(completed, { ...completed, downloadUrl: '/ready' }).downloadUrl)
  for (const field of ['id', 'formulaId', 'formulaVersionId'])
    assert.throws(() => acceptExportSnapshot(task, { ...task, [field]: 'other' }))
})
test('下载只接受当前已完成任务的受认证同源路径', () => {
  const ready = {
    ...task,
    status: 'COMPLETED' as const,
    downloadUrl: '/api/account/exports/task-1/download',
  }
  assert.equal(exportDownloadPath(ready), ready.downloadUrl)
  for (const downloadUrl of [
    'https://outside.test/file',
    '//outside.test/file',
    '/api/account/exports/other/download',
    null,
  ])
    assert.equal(exportDownloadPath({ ...ready, downloadUrl }), null)
  assert.equal(exportDownloadPath({ ...ready, status: 'FAILED' }), null)
  assert.equal(exportFilename('../公式\n.docx'), '.._公式_.docx')
})
test('未知提交结果的回执必须可复用且损坏配置拒绝创建新请求', () => {
  const receipt = {
    ownerId: 'owner-a',
    taskId: 'task-1',
    versionId: 'version-1',
    requestKey: 'request-1',
  }
  assert.deepEqual(parseExportReceipts(JSON.stringify([receipt])), [receipt])
  assert.deepEqual(parseExportReceipts(null), [])
  for (const raw of [
    'broken',
    '{}',
    JSON.stringify([receipt, receipt]),
    JSON.stringify([{ ...receipt, requestKey: '' }]),
    JSON.stringify(Array(11).fill(receipt)),
  ])
    assert.throws(() => parseExportReceipts(raw))
  assert.equal(
    parseExportReceipts(JSON.stringify([receipt])).find((row) => row.ownerId === 'owner-b'),
    undefined,
  )
})
