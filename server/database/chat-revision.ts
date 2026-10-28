import type { Prisma } from '../generated/prisma/client'

/** 调用方已按 conversation → queue → turn 顺序持锁；与可见变更同事务提交。 */
export function bumpConversation(tx: Prisma.TransactionClient, id: string) {
  return tx.conversation.update({ where: { id }, data: { revision: { increment: 1 } } })
}
export async function bumpChatTurn(tx: Prisma.TransactionClient, ownerId: string, id: string) {
  const turn = await tx.chatTurn.findFirstOrThrow({
    where: { id, ownerId },
    select: { conversationId: true },
  })
  await bumpConversation(tx, turn.conversationId)
}
