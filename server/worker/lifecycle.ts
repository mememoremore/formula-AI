import { bumpChatTurn } from '../database/chat-revision'
import { fromPrisma, type PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import type { JobKind } from '../../shared/types/tasks'
import {
  completeClaim,
  touchClaim,
  assertLiveClaim,
  LostJobClaim,
  type RunningJob,
} from '../queue/claim'
import { queues } from '../queue/client'
import { DocumentConversionError } from '../documents/formula-document'
import { InferenceFailure } from '../inference/failure'
import {
  readBusinessTask,
  lockTaskConversation,
  transitionFailure,
} from '../database/task-lifecycle'
export async function beginAttempt(db: PrismaClient, kind: JobKind, job: RunningJob) {
  if (job.name !== queues[kind]) throw new LostJobClaim()
  const task = await readBusinessTask(db, kind, job.data.ownerId, job.data.taskId)
  if (!task || !['QUEUED', 'PROCESSING'].includes(task.status)) return false
  return db.$transaction(async (tx) => {
    await lockTaskConversation(tx, kind, job.data.ownerId, job.data.taskId)
    await assertLiveClaim(tx, job)
    const where = {
      id: job.data.taskId,
      ownerId: job.data.ownerId,
      queueJobId: job.id,
      status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] },
      attemptCount: { lt: job.retryCount + 1 },
    }
    const data = {
      status: 'PROCESSING' as const,
      attemptCount: job.retryCount + 1,
      startedAt: new Date(),
      finishedAt: null,
      errorMessage: null,
    }
    if (kind === 'recognition')
      return (
        (await tx.recognitionTask.updateMany({ where, data: { ...data, errorCode: null } })).count >
        0
      )
    if (kind === 'chat') {
      const changed = (await tx.chatTurn.updateMany({ where, data })).count > 0
      if (changed) await bumpChatTurn(tx, job.data.ownerId, job.data.taskId)
      return changed
    }
    return (await tx.exportTask.updateMany({ where, data })).count > 0
  })
}
export async function runTask(
  db: PrismaClient,
  boss: PgBoss,
  kind: JobKind,
  job: RunningJob,
  process: () => Promise<void>,
) {
  if (!(await beginAttempt(db, kind, job))) return
  try {
    await process()
  } catch (error) {
    if (error instanceof LostJobClaim || job.signal?.aborted) throw new LostJobClaim()
    const fatal =
      (error instanceof DocumentConversionError && error.fatal) ||
      (error instanceof InferenceFailure && !error.retryable)
    const terminal = fatal || job.retryCount >= job.retryLimit
    const message =
      error instanceof DocumentConversionError || error instanceof InferenceFailure
        ? error.message
        : terminal
          ? '任务处理失败，请稍后重新提交。'
          : '处理暂时失败，正在自动重试。'
    await db.$transaction(async (tx) => {
      await lockTaskConversation(tx, kind, job.data.ownerId, job.data.taskId)
      await touchClaim(boss, tx, job)
      const changed = await transitionFailure(
        tx,
        kind,
        {
          id: job.data.taskId,
          ownerId: job.data.ownerId,
          queueJobId: job.id,
          status: 'PROCESSING',
          attemptCount: job.retryCount + 1,
        },
        terminal,
        message,
      )
      if (!changed) throw new LostJobClaim()
      if (fatal) await completeClaim(boss, tx, job)
      else {
        const result = await boss.fail(job.name, { id: job.id, retryCount: job.retryCount }, null, {
          db: fromPrisma(tx),
        })
        if (!('affected' in result) || result.affected !== 1) throw new LostJobClaim()
      }
    })
    // 保留调用方的暂时失败语义；pg-boss外层重复fail已被attempt/state围栏挡住。
    if (!fatal) throw new Error('任务暂时处理失败。')
  }
}
