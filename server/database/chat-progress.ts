import type { PrismaClient } from '../generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import { fromPrisma } from 'pg-boss'
import { queues } from '../queue/client'
import { appendFailedAnswer } from './task-lifecycle'
import { LostJobClaim, touchClaim, type RunningJob } from '../queue/claim'

/** 锁住当前队列领取记录后更新片段，完成/取消/接管不能与旧Worker写入交错。 */
export async function saveChatProgress(
  db: PrismaClient,
  boss: PgBoss,
  job: RunningJob,
  content: string,
) {
  await db.$transaction(async (tx) => {
    await touchClaim(boss, tx, job)
    const updated = await tx.chatTurn.updateMany({
      where: {
        id: job.data.taskId,
        ownerId: job.data.ownerId,
        queueJobId: job.id,
        status: 'PROCESSING',
        attemptCount: job.retryCount + 1,
      },
      data: { partialContent: content },
    })
    if (!updated.count) throw new LostJobClaim()
  })
}

export async function cancelChatTurn(
  db: PrismaClient,
  boss: PgBoss,
  ownerId: string,
  conversationId: string,
  turnId: string,
) {
  // 权限及UUID由调用者先检查；队列操作和终态消息共同提交。
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversations WHERE id=${conversationId}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`
    const turn = await tx.chatTurn.findFirst({ where: { id: turnId, ownerId, conversationId } })
    if (!turn) return false
    if (['COMPLETED', 'FAILED'].includes(turn.status)) return true
    if (turn.queueJobId) await boss.cancel(queues.chat, turn.queueJobId, { db: fromPrisma(tx) })
    const updated = await tx.chatTurn.updateMany({
      where: { id: turnId, ownerId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'FAILED', finishedAt: new Date(), errorMessage: '已停止生成。' },
    })
    if (!updated.count) return true
    await appendFailedAnswer(tx, ownerId, turnId, '已停止生成。')
    return true
  })
}
