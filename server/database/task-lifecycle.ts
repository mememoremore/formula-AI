import type { Prisma } from '../generated/prisma/client'
import type { JobKind } from '../../shared/types/tasks'
export function readBusinessTask(
  tx: Prisma.TransactionClient,
  kind: JobKind,
  ownerId: string,
  id: string,
) {
  const where = { id, ownerId }
  if (kind === 'recognition') return tx.recognitionTask.findFirst({ where })
  if (kind === 'chat') return tx.chatTurn.findFirst({ where })
  return tx.exportTask.findFirst({ where })
}
/** 聊天完成/停止/失败共同使用会话锁，确保ASSISTANT位置和终态互斥。 */
export async function lockTaskConversation(
  tx: Prisma.TransactionClient,
  kind: JobKind,
  ownerId: string,
  id: string,
) {
  if (kind !== 'chat') return
  const turn = await tx.chatTurn.findFirst({
    where: { id, ownerId },
    select: { conversationId: true },
  })
  if (turn)
    await tx.$queryRaw`SELECT id FROM conversations WHERE id=${turn.conversationId}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`
}
/** 调用方先锁会话并成功转换轮次；去重约束作为最后保护，不覆盖既有完整回答。 */
export async function appendFailedAnswer(
  tx: Prisma.TransactionClient,
  ownerId: string,
  turnId: string,
  message: string,
) {
  const turn = await tx.chatTurn.findFirstOrThrow({ where: { id: turnId, ownerId } })
  const question = await tx.chatMessage.findFirst({ where: { ownerId, turnId, role: 'USER' } })
  if (!question) throw new Error('Chat turn has no user message')
  await tx.chatMessage.createMany({
    data: [
      {
        ownerId,
        conversationId: turn.conversationId,
        turnId,
        position: question.position + 1,
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
export async function transitionFailure(
  tx: Prisma.TransactionClient,
  kind: JobKind,
  where: {
    id: string
    ownerId: string
    queueJobId: string
    status: 'PROCESSING' | { in: ('QUEUED' | 'PROCESSING')[] }
    attemptCount?: number
  },
  terminal: boolean,
  message: string,
  code = 'PROCESSING_FAILED',
) {
  const data = {
    status: terminal ? ('FAILED' as const) : ('QUEUED' as const),
    finishedAt: terminal ? new Date() : null,
    errorMessage: message,
  }
  if (kind === 'recognition')
    return (await tx.recognitionTask.updateMany({ where, data: { ...data, errorCode: code } }))
      .count
  if (kind === 'export') return (await tx.exportTask.updateMany({ where, data })).count
  const changed = (await tx.chatTurn.updateMany({ where, data })).count
  if (changed && terminal) await appendFailedAnswer(tx, where.ownerId, where.id, message)
  return changed
}
