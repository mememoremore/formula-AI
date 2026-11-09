import { test, expect } from 'vitest'
import { recycleExpiry, RECYCLE_RETENTION_MS } from '../shared/recycle-bin'
import { restoreInput } from '../shared/schemas/learning'
test('回收站恢复窗口为删除后10天，包含跨月时间', () => {
  const deleted = new Date('2026-10-31T12:34:56Z')
  expect(RECYCLE_RETENTION_MS).toBe(864000000)
  expect(recycleExpiry(deleted).toISOString()).toBe('2026-11-10T12:34:56.000Z')
  expect(deleted.toISOString()).toBe('2026-10-31T12:34:56.000Z')
})
test('回收站只允许公式恢复，识别和批次不能通过旧接口恢复', () => {
  const ids = ['12345678-1234-4234-8234-123456789abc']
  expect(restoreInput.safeParse({ kind: 'formula', ids }).success).toBe(true)
  for (const kind of ['recognition', 'batch'])
    expect(restoreInput.safeParse({ kind, ids }).success).toBe(false)
})
