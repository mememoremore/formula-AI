import { beforeEach, expect, test, vi } from 'vitest'
import type { PrismaClient } from '../server/generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import { defaultUsageLimits } from '../server/database/usage'
import { WorkspaceError } from '../server/services/workspace-error'
import { ResourceLimitError } from '../server/resources/policy'
import { advanceRecognitionBatch } from '../server/worker/recognition-batches'
const { submit } = vi.hoisted(() => ({ submit: vi.fn() }))
vi.mock('../server/database/task-submissions', () => ({ submitRecognitionInTransaction: submit }))
vi.mock('../server/diagnostics/operations', () => ({ diagnostic: vi.fn() }))

beforeEach(() => {
  submit.mockReset()
})
function fixture(status?: string) {
  const part = {
    id: 'part',
    ownerId: 'owner',
    fileId: 'file',
    requestKey: 'persisted-key',
    taskId: status ? 'previous-task' : null,
    task: status ? { status } : null,
    errorMessage: null,
  }
  const batchUpdate = vi.fn().mockResolvedValue({ count: 1 }),
    partUpdate = vi.fn().mockResolvedValue({ count: 1 })
  const partRead = vi.fn().mockResolvedValue(part),
    liveRead = vi.fn().mockResolvedValue({ id: 'batch', status: 'RUNNING' })
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue([]),
    recognitionBatch: { updateMany: batchUpdate, findFirst: liveRead },
    recognitionBatchPart: { findFirst: partRead, update: partUpdate },
  }
  const db = {
    $queryRaw: vi.fn().mockResolvedValue([{ id: 'batch', ownerId: 'owner' }]),
    $transaction: async (work: (value: typeof tx) => Promise<unknown>) => work(tx),
    recognitionBatch: { updateMany: batchUpdate },
    recognitionBatchPart: { findMany: vi.fn().mockResolvedValue([part]), updateMany: partUpdate },
  }
  return { db: db as unknown as PrismaClient, batchUpdate, partUpdate, partRead, liveRead, part }
}
const boss = {} as PgBoss
test('队列中的子任务完成前不提交下一条，也不消耗新额度', async () => {
  for (const status of ['QUEUED', 'PROCESSING']) {
    const f = fixture(status)
    await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
    expect(submit).not.toHaveBeenCalled()
    expect(f.batchUpdate).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ leaseToken: null, leaseUntil: null }),
      }),
    )
  }
})
test('重启或响应丢失后沿用持久请求编号，关联结果使用请求编号条件防止覆盖重试', async () => {
  const f = fixture()
  submit.mockResolvedValue({ id: 'same-task' })
  await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
  await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
  expect(submit).toHaveBeenCalledTimes(2)
  for (const call of submit.mock.calls)
    expect(call[3]).toMatchObject({ requestKey: 'persisted-key', fileId: 'file', ownerId: 'owner' })
  expect(f.partRead).toHaveBeenCalledWith({
    where: {
      id: 'part',
      ownerId: 'owner',
      requestKey: 'persisted-key',
      taskId: null,
      errorMessage: null,
    },
  })
  expect(f.partUpdate).toHaveBeenCalledWith({
    where: { id: 'part' },
    data: { taskId: 'same-task' },
  })
})
test('成功和失败的子任务均为终态，全部结束后完成批次', async () => {
  for (const status of ['COMPLETED', 'FAILED']) {
    const f = fixture(status)
    await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
    expect(submit).not.toHaveBeenCalled()
    expect(f.batchUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'COMPLETED', errorMessage: null } }),
    )
  }
})
test('忙碌时保持排队，额度不足时暂停，图片错误只标记当前项失败', async () => {
  for (const [error, paused, failed] of [
    [new ResourceLimitError('RECOGNITION_BUSY', 429, 'busy'), false, false],
    [new WorkspaceError(429, 'quota'), true, false],
    [new WorkspaceError(404, 'file'), false, true],
  ] as const) {
    const f = fixture()
    submit.mockRejectedValue(error)
    await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
    expect(f.batchUpdate.mock.calls.some(([arg]) => arg.data.status === 'PAUSED')).toBe(paused)
    expect(f.partUpdate.mock.calls.length > 0).toBe(failed)
  }
})
test('未知提交结果不生成新编号，不误报失败，释放调度租约以便重新核对', async () => {
  const f = fixture()
  submit.mockRejectedValue(new Error('connection lost'))
  await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
  expect(f.partUpdate).not.toHaveBeenCalled()
  expect(f.batchUpdate).toHaveBeenLastCalledWith(
    expect.objectContaining({
      where: expect.objectContaining({ leaseToken: expect.any(String) }),
      data: expect.objectContaining({ leaseToken: null }),
    }),
  )
})

test('批次历史只允许当前账号的完整已结束选择集，进行中批次不得移除', async () => {
  const { deleteBatchHistory } = await import('../server/database/batch-history-mutations')
  const owner = '11111111-1111-4111-8111-111111111111'
  const id = '22222222-2222-4222-8222-222222222222'
  const write = vi.fn().mockResolvedValue(1)
  let rows: { id: string; status: string }[] = []
  const tx = { $queryRaw: vi.fn(async () => rows), $executeRaw: write }
  const db = {
    $transaction: async (work: (value: typeof tx) => Promise<unknown>) => work(tx),
  } as unknown as PrismaClient
  await expect(deleteBatchHistory(db, owner, [id])).rejects.toMatchObject({ statusCode: 404 })
  for (const status of ['RUNNING', 'PAUSED']) {
    rows = [{ id, status }]
    await expect(deleteBatchHistory(db, owner, [id])).rejects.toMatchObject({ statusCode: 409 })
  }
  expect(write).not.toHaveBeenCalled()
  rows = [{ id, status: 'COMPLETED' }]
  await expect(deleteBatchHistory(db, owner, [id, id])).resolves.toEqual({
    ids: [id],
    deletedCount: 1,
  })
  write.mockResolvedValue(0)
  await expect(deleteBatchHistory(db, owner, [id])).resolves.toEqual({ ids: [id], deletedCount: 0 })
})

test('批次已被停止或替换请求后，旧派发者不再提交或关联子任务', async () => {
  for (const stale of ['batch', 'part']) {
    const f = fixture()
    if (stale === 'batch') f.liveRead.mockResolvedValue(null)
    else f.partRead.mockResolvedValue(null)
    await advanceRecognitionBatch(f.db, boss, defaultUsageLimits)
    expect(submit).not.toHaveBeenCalled()
    expect(f.partUpdate).not.toHaveBeenCalled()
  }
})
