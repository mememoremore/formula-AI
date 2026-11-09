import type { Prisma, PrismaClient } from '../generated/prisma/client'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'

async function lockOwnedConversation(tx: Prisma.TransactionClient, ownerId: string, id: string) {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这段对话。')
  const rows = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM conversations WHERE id=${id}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE
  `
  if (!rows.length) throw new WorkspaceError(404, '未找到这段对话。')
}

export function renameConversation(db: PrismaClient, ownerId: string, id: string, title: string) {
  return db.$transaction(async (tx) => {
    await lockOwnedConversation(tx, ownerId, id)
    return tx.conversation.update({
      where: { id_ownerId: { id, ownerId } },
      data: { title, customTitle: title, revision: { increment: 1 } },
      select: { id: true, title: true },
    })
  })
}

/** 与提交提问共用会话锁；生成中的任务必须先结束，避免删除正在调用 AI 的会话。 */
export function deleteConversation(db: PrismaClient, ownerId: string, id: string) {
  return db.$transaction(async (tx) => {
    await lockOwnedConversation(tx, ownerId, id)
    const active = await tx.chatTurn.findFirst({
      where: { conversationId: id, ownerId, status: { in: ['QUEUED', 'PROCESSING'] } },
      select: { id: true },
    })
    if (active) throw new WorkspaceError(409, '回答正在生成，请停止后再删除。')
    await tx.conversation.delete({ where: { id_ownerId: { id, ownerId } } })
    return { deleted: true }
  })
}
