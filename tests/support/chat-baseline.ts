/** R13 frozen reader for repeatable R14 measurements ONLY; not imported by application. */
import type { PrismaClient } from '../../server/generated/prisma/client'
import type { SavedConversation, VersionContext } from '../../shared/types/tasks'
import { WorkspaceError } from '../../server/services/workspace-error'
import { hasValidResourceIdentity } from '../../server/database/private-resources'
export async function readVersionContext(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<VersionContext> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个公式版本。')
  const version = await db.formulaVersion.findFirst({
    where: { id, ownerId },
    include: { formula: { select: { title: true } } },
  })
  if (!version) throw new WorkspaceError(404, '未找到这个公式版本。')
  return {
    id,
    formulaId: version.formulaId,
    title: version.formula.title,
    number: version.number,
    latex: version.latex,
  }
}
export async function readLegacyConversation(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<SavedConversation> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这段对话。')
  const conversation = await db.conversation.findFirst({
    where: { id, ownerId },
    include: {
      messages: {
        where: { ownerId },
        orderBy: { position: 'desc' },
        take: 101,
        select: {
          id: true,
          role: true,
          content: true,
          status: true,
          isMock: true,
          position: true,
          modelVersion: true,
        },
      },
      turns: { where: { ownerId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 1 },
    },
  })
  if (!conversation) throw new WorkspaceError(404, '未找到这段对话。')
  const turn = conversation.turns[0]
  return {
    id,
    title: conversation.title,
    context: conversation.formulaVersionId
      ? await readVersionContext(db, ownerId, conversation.formulaVersionId)
      : null,
    messages: conversation.messages.slice(0, 100).reverse(),
    hasEarlierMessages: conversation.messages.length > 100,
    currentTurn: turn
      ? {
          id: turn.id,
          status: turn.status,
          attemptCount: turn.attemptCount,
          maxAttempts: turn.maxAttempts,
          errorMessage: turn.errorMessage,
          partialContent: turn.partialContent,
          isMock: turn.responseIsMock,
          modelVersion: turn.responseModel,
        }
      : null,
  }
}
