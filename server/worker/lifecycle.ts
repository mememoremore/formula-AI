import type { PgBoss } from 'pg-boss'
import type { Prisma, PrismaClient } from '../generated/prisma/client'
import type { JobKind } from '../../shared/types/tasks'
import { completeClaim, touchClaim, LostJobClaim, type RunningJob } from '../queue/claim'
import { DocumentConversionError } from '../documents/formula-document'
import { InferenceFailure } from '../inference/failure'

export async function beginAttempt(db: PrismaClient, kind: JobKind, job: RunningJob) {
  const where = {
    id: job.data.taskId,
    ownerId: job.data.ownerId,
    queueJobId: job.id,
    status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] },
    attemptCount: { lte: job.retryCount + 1 },
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
      (await db.recognitionTask.updateMany({ where, data: { ...data, errorCode: null } })).count > 0
    )
  if (kind === 'chat') return (await db.chatTurn.updateMany({ where, data })).count > 0
  return (await db.exportTask.updateMany({ where, data })).count > 0
}
async function recordFailure(
  tx: Prisma.TransactionClient,
  kind: JobKind,
  job: RunningJob,
  terminal: boolean,
  message: string,
) {
  const where = {
    id: job.data.taskId,
    ownerId: job.data.ownerId,
    queueJobId: job.id,
    status: 'PROCESSING' as const,
    attemptCount: job.retryCount + 1,
  }
  const data = {
    status: terminal ? ('FAILED' as const) : ('QUEUED' as const),
    finishedAt: terminal ? new Date() : null,
    errorMessage: message,
  }
  if (kind === 'recognition')
    await tx.recognitionTask.updateMany({
      where,
      data: { ...data, errorCode: 'PROCESSING_FAILED' },
    })
  else if (kind === 'export') await tx.exportTask.updateMany({ where, data })
  else {
    const updated = await tx.chatTurn.updateMany({ where, data })
    if (terminal && updated.count) {
      const turn = await tx.chatTurn.findUniqueOrThrow({ where: { id: job.data.taskId } })
      const userMessage = await tx.chatMessage.findFirst({
        where: { turnId: job.data.taskId, ownerId: job.data.ownerId, role: 'USER' },
      })
      if (userMessage)
        await tx.chatMessage.createMany({
          data: [
            {
              ownerId: job.data.ownerId,
              conversationId: userMessage.conversationId,
              turnId: job.data.taskId,
              position: userMessage.position + 1,
              role: 'ASSISTANT',
              status: 'FAILED',
              content: turn.partialContent
                ? `${turn.partialContent}\n\n【回答未完成】${message}`
                : message,
              isMock: turn.responseIsMock,
              modelVersion: turn.responseModel,
            },
          ],
          skipDuplicates: true,
        })
    }
  }
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
      if (fatal) {
        if (kind === 'chat') {
          const turn = await tx.chatTurn.findUniqueOrThrow({ where: { id: job.data.taskId } })
          await tx.$queryRaw`SELECT id FROM conversations WHERE id=${turn.conversationId}::uuid AND "ownerId"=${job.data.ownerId}::uuid FOR UPDATE`
        }
        await touchClaim(boss, tx, job)
      }
      await recordFailure(tx, kind, job, terminal, message)
      if (fatal) await completeClaim(boss, tx, job)
    })
    if (!fatal) throw new Error('任务暂时处理失败。')
  }
}
