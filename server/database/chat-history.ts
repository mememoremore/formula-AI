import type { PrismaClient } from '../generated/prisma/client'
import type { ChatRequest } from '../../shared/types/api'

/** 只采用有持久化成功轮次证明的完整问答；旧无turnId记录仍可展示。 */
export async function readPromptHistory(db: PrismaClient, ownerId: string, conversationId: string) {
  const questions = await db.chatMessage.findMany({
    where: {
      ownerId,
      conversationId,
      role: 'USER',
      status: 'COMPLETED',
      turn: { ownerId, conversationId, status: 'COMPLETED' },
    },
    // position是持锁分配的业务顺序；同毫秒createdAt或随机UUID不能代替它。
    orderBy: { position: 'desc' },
    take: 9,
    include: { turn: { include: { messages: { orderBy: { position: 'asc' } } } } },
  })
  const messages: ChatRequest['messages'] = []
  for (const question of questions.reverse()) {
    const turn = question.turn
    if (!turn) continue
    const [user, assistant] = turn.messages
    if (
      turn.messages.length !== 2 ||
      !user ||
      !assistant ||
      user.ownerId !== ownerId ||
      assistant.ownerId !== ownerId ||
      user.conversationId !== conversationId ||
      assistant.conversationId !== conversationId ||
      user.role !== 'USER' ||
      assistant.role !== 'ASSISTANT' ||
      user.status !== 'COMPLETED' ||
      assistant.status !== 'COMPLETED' ||
      user.position + 1 !== assistant.position ||
      user.content !== turn.question
    )
      continue
    messages.push(
      { role: 'user', content: user.content },
      { role: 'assistant', content: assistant.content },
    )
  }
  return messages
}
