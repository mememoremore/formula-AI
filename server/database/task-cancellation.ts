import type { Prisma, PrismaClient } from '../generated/prisma/client'
import { fromPrisma, type PgBoss } from 'pg-boss'
import { queues } from '../queue/client'
import { resourceTransaction } from '../resources/leases'
import { cancelChatTurn } from './chat-progress'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'

export const stoppedTaskMessage = '已停止任务。'
async function cancelPlainTask(
  tx: Prisma.TransactionClient,
  boss: PgBoss,
  ownerId: string,
  kind: 'recognition' | 'export',
  id: string,
) {
  const task =
    kind === 'recognition'
      ? await tx.recognitionTask.findFirst({ where: { id, ownerId } })
      : await tx.exportTask.findFirst({ where: { id, ownerId } })
  if (!task) throw new WorkspaceError(404, '未找到这个任务。')
  if (!['QUEUED', 'PROCESSING'].includes(task.status)) return
  // Worker completion also locks the queue before updating the task: the first transaction wins.
  if (task.queueJobId) await boss.cancel(queues[kind], task.queueJobId, { db: fromPrisma(tx) })
  const where = {
    id,
    ownerId,
    status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] },
  }
  const data = {
    status: 'FAILED' as const,
    finishedAt: new Date(),
    errorMessage: stoppedTaskMessage,
  }
  if (kind === 'recognition')
    await tx.recognitionTask.updateMany({ where, data: { ...data, errorCode: 'USER_STOPPED' } })
  else await tx.exportTask.updateMany({ where, data })
}
export async function stopAccountTask(
  db: PrismaClient,
  boss: PgBoss,
  ownerId: string,
  kind: 'batch' | 'recognition' | 'chat' | 'export',
  id: string,
) {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个任务。')
  if (kind === 'chat') {
    const turn = await db.chatTurn.findFirst({
      where: { id, ownerId },
      select: { conversationId: true },
    })
    if (!turn || !(await cancelChatTurn(db, boss, ownerId, turn.conversationId, id)))
      throw new WorkspaceError(404, '未找到这个任务。')
  } else if (kind === 'batch') {
    await resourceTransaction(db, ownerId, async (tx) => {
      await tx.$queryRaw`SELECT id FROM recognition_batches WHERE id=${id}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`
      const batch = await tx.recognitionBatch.findFirst({ where: { id, ownerId } })
      if (!batch) throw new WorkspaceError(404, '未找到这个批次。')
      if (!['RUNNING', 'PAUSED'].includes(batch.status)) return
      await tx.recognitionBatch.update({
        where: { id },
        data: {
          status: 'CANCELLED',
          errorMessage: stoppedTaskMessage,
          leaseToken: null,
          leaseUntil: null,
        },
      })
      const parts = await tx.recognitionBatchPart.findMany({
        where: { ownerId, image: { batchId: id } },
        orderBy: { id: 'asc' },
        select: { id: true, taskId: true },
      })
      for (const part of parts) {
        if (part.taskId) await cancelPlainTask(tx, boss, ownerId, 'recognition', part.taskId)
        else
          await tx.recognitionBatchPart.update({
            where: { id: part.id },
            data: { errorMessage: stoppedTaskMessage },
          })
      }
    })
  } else await db.$transaction((tx) => cancelPlainTask(tx, boss, ownerId, kind, id))
  return { stopped: true }
}
