import type { Prisma, PrismaClient } from '../generated/prisma/client'
import { lockQueueRecord, queueOwnsTask } from '../queue/record'
import { queues } from '../queue/client'
import { lockTaskConversation } from './task-lifecycle'

export async function recordCallObservation(
  db: PrismaClient,
  id: string,
  data: Prisma.ChatCallAttemptUpdateManyMutationInput,
) {
  // 事务已提交但响应丢失时，异常路径不得覆盖已确认结果。
  await db.chatCallAttempt.updateMany({ where: { id, resultCommittedAt: null }, data })
}

/** 独立于业务活跃轮次扫描；UNKNOWN表示计费/调用结果不确定，不触发退款或重调。 */
export async function reconcileChatCalls(db: PrismaClient, limit: number, after?: string) {
  const rows = await db.chatCallAttempt.findMany({
    where: {
      status: { in: ['PREPARED', 'IN_FLIGHT', 'SUCCEEDED'] },
      resultCommittedAt: null,
      ...(after ? { id: { gt: after } } : {}),
    },
    orderBy: { id: 'asc' },
    take: limit,
  })
  for (const row of rows) {
    await db.$transaction(async (tx) => {
      await lockTaskConversation(tx, 'chat', row.ownerId, row.turnId)
      const job = await lockQueueRecord(tx, queues.chat, row.queueJobId)
      if (
        job &&
        queueOwnsTask(job, row.ownerId, row.turnId) &&
        job.state === 'active' &&
        !job.expired &&
        job.retryCount + 1 === row.workerAttempt
      )
        return
      await tx.chatCallAttempt.updateMany({
        where: {
          id: row.id,
          resultCommittedAt: null,
          status: { in: ['PREPARED', 'IN_FLIGHT', 'SUCCEEDED'] },
        },
        data: { status: 'UNKNOWN', closedAt: new Date() },
      })
    })
  }
  return rows.length === limit ? rows.at(-1)?.id : undefined
}
