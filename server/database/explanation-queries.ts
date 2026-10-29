import type { Prisma } from '../generated/prisma/client'
import { parseExplanation } from '../../shared/explanation'
import type { BaseExplanation } from '../../shared/types/tasks'
export async function readBaseExplanation(
  db: Prisma.TransactionClient,
  ownerId: string,
  conversationId: string,
): Promise<BaseExplanation | null> {
  const message = await db.chatMessage.findFirst({
    where: {
      ownerId,
      conversationId,
      role: 'ASSISTANT',
      status: 'COMPLETED',
      turn: { ownerId, conversationId, responseKind: 'FORMULA_EXPLANATION', status: 'COMPLETED' },
    },
    orderBy: { position: 'asc' },
    include: { turn: { select: { promptVersion: true } } },
  })
  if (!message) return null
  return {
    messageId: message.id,
    isMock: message.isMock,
    modelVersion: message.modelVersion,
    turnId: message.turnId!,
    createdAt: message.createdAt.toISOString(),
    content: message.content,
    structured: parseExplanation(message.structuredContent),
    promptVersion: message.turn!.promptVersion!,
  }
}
