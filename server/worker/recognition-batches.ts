import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import { submitRecognitionInTransaction } from '../database/task-submissions'
import { defaultUsageLimits, type UsageLimits } from '../database/usage'
import { ResourceLimitError } from '../resources/policy'
import { WorkspaceError } from '../services/workspace-error'
import { diagnostic } from '../diagnostics/operations'
import { resourceTransaction } from '../resources/leases'

/** Durable dispatcher: one outstanding child per batch; request keys survive process restarts. */
export async function advanceRecognitionBatch(db: PrismaClient, boss: PgBoss, limits: UsageLimits) {
  const token = randomUUID()
  const claimed = await db.$queryRaw<{ id: string; ownerId: string }[]>`
    WITH candidate AS (SELECT id FROM recognition_batches WHERE status='RUNNING'
      AND ("leaseUntil" IS NULL OR "leaseUntil" < CURRENT_TIMESTAMP)
      ORDER BY "updatedAt",id FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE recognition_batches b SET "leaseToken"=${token}::uuid,"leaseUntil"=CURRENT_TIMESTAMP+INTERVAL '30 seconds'
    FROM candidate WHERE b.id=candidate.id RETURNING b.id,b."ownerId"
  `
  const batch = claimed[0]
  if (!batch) return false
  const fence = { id: batch.id, ownerId: batch.ownerId, leaseToken: token }
  try {
    const parts = await db.recognitionBatchPart.findMany({
      where: { ownerId: batch.ownerId, image: { batchId: batch.id } },
      orderBy: [{ image: { position: 'asc' } }, { position: 'asc' }],
      include: { task: { select: { status: true } } },
    })
    if (parts.some((part) => part.task && ['QUEUED', 'PROCESSING'].includes(part.task.status)))
      return true
    const next = parts.find((part) => !part.taskId && !part.errorMessage)
    if (!next) {
      await db.recognitionBatch.updateMany({
        where: fence,
        data: { status: 'COMPLETED', errorMessage: null },
      })
      return true
    }
    try {
      await resourceTransaction(db, batch.ownerId, async (tx) => {
        await tx.$queryRaw`SELECT id FROM recognition_batches WHERE id=${batch.id}::uuid AND "ownerId"=${batch.ownerId}::uuid FOR UPDATE`
        const live = await tx.recognitionBatch.findFirst({ where: { ...fence, status: 'RUNNING' } })
        if (!live) return
        const part = await tx.recognitionBatchPart.findFirst({
          where: {
            id: next.id,
            ownerId: batch.ownerId,
            requestKey: next.requestKey,
            taskId: null,
            errorMessage: null,
          },
        })
        if (!part) return
        const task = await submitRecognitionInTransaction(tx, boss, limits, {
          ownerId: batch.ownerId,
          fileId: part.fileId,
          requestKey: part.requestKey,
          mode: 'handwritten',
          requestedTitle: null,
        })
        await tx.recognitionBatchPart.update({ where: { id: part.id }, data: { taskId: task.id } })
        await tx.recognitionBatch.updateMany({ where: fence, data: { errorMessage: null } })
      })
    } catch (error) {
      if (error instanceof ResourceLimitError && error.code === 'RECOGNITION_BUSY') return true
      if (error instanceof WorkspaceError && error.statusCode === 429)
        await db.recognitionBatch.updateMany({
          where: fence,
          data: { status: 'PAUSED', errorMessage: error.message },
        })
      else if (
        error instanceof WorkspaceError &&
        [400, 404, 413, 415, 422].includes(error.statusCode)
      )
        await db.recognitionBatchPart.updateMany({
          where: { id: next.id, requestKey: next.requestKey, taskId: null },
          data: { errorMessage: error.message },
        })
      else {
        await db.recognitionBatch.updateMany({
          where: fence,
          data: { errorMessage: '提交结果正在核对，后台会使用原请求继续处理。' },
        })
        diagnostic('recognition.batch', {
          outcome: 'unconfirmed',
          code: 'BATCH_DISPATCH_PENDING',
          resourceId: batch.id,
        })
      }
    }
    return true
  } finally {
    await db.recognitionBatch.updateMany({
      where: fence,
      data: { leaseToken: null, leaseUntil: null, updatedAt: new Date() },
    })
  }
}

export async function startRecognitionBatches(db: PrismaClient, boss: PgBoss, signal: AbortSignal) {
  const limit = Number(process.env.NUXT_RECOGNITION_DAILY_LIMIT ?? defaultUsageLimits.RECOGNITION)
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 10000)
    throw new Error('Invalid batch recognition quota')
  const limits = { ...defaultUsageLimits, RECOGNITION: limit }
  let timer: NodeJS.Timeout | undefined,
    pending: Promise<void> | undefined,
    stopped = false
  async function tick() {
    try {
      for (let i = 0; i < 3 && !stopped && !signal.aborted; i++)
        if (!(await advanceRecognitionBatch(db, boss, limits))) break
    } catch {
      diagnostic('recognition.batch', {
        outcome: 'unconfirmed',
        code: 'BATCH_RECONCILIATION_PENDING',
      })
    }
  }
  function schedule() {
    if (stopped || signal.aborted) return
    timer = setTimeout(() => {
      pending = tick().finally(schedule)
    }, 2000)
    timer.unref()
  }
  await tick()
  schedule()
  return {
    async stop() {
      stopped = true
      clearTimeout(timer)
      await pending
    },
  }
}
