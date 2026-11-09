import type { PrismaClient, Prisma } from '../generated/prisma/client'
import { parseExplanation } from '../../shared/explanation'

/** Read only completed explanations of the current identity/version; never generate one here. */
export async function explanationConditions(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  formulaId: string,
) {
  const version = await db.formulaVersion.findFirst({
    where: { ownerId, formulaId },
    orderBy: { number: 'desc' },
    select: { id: true },
  })
  if (!version) return ''
  const messages = await db.chatMessage.findMany({
    where: {
      ownerId,
      role: 'ASSISTANT',
      status: 'COMPLETED',
      conversation: { ownerId, purpose: 'EXPLANATION', formulaVersionId: version.id },
    },
    orderBy: [{ createdAt: 'desc' }, { position: 'desc' }],
    take: 5,
    select: { structuredContent: true },
  })
  for (const message of messages) {
    try {
      return parseExplanation(message.structuredContent).conditions.join('\n').slice(0, 2000)
    } catch {
      /* Older text-only records do not provide structured conditions. */
    }
  }
  return ''
}
