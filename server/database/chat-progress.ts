import type { PrismaClient } from '../generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import { fromPrisma } from 'pg-boss'
import { queues } from '../queue/client'
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
    if (turn.queueJobId) await boss.cancel(queues.chat, turn.queueJobId, { db: fromPrisma(tx) })
    const latest = await tx.chatTurn.findUniqueOrThrow({ where: { id: turnId } })
    const updated = await tx.chatTurn.updateMany({
      where: { id: turnId, ownerId, status: { in: ['QUEUED', 'PROCESSING'] } },
      data: { status: 'FAILED', finishedAt: new Date(), errorMessage: '已停止生成。' },
    })
    if (!updated.count) return true
    const question = await tx.chatMessage.findFirstOrThrow({
      where: { turnId, ownerId, role: 'USER' },
    })
    await tx.chatMessage.createMany({
      data: [
        {
          ownerId,
          conversationId,
          turnId,
          position: question.position + 1,
          role: 'ASSISTANT',
          status: 'FAILED',
          content: latest.partialContent
            ? `${latest.partialContent}\n\n【回答未完成】已停止生成。`
            : '已停止生成。',
          isMock: latest.responseIsMock,
          modelVersion: latest.responseModel,
        },
      ],
      skipDuplicates: true,
    })
    return true
  })
}
