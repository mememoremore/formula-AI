import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { hasValidResourceIdentity } from './private-resources'
import { idempotentTask } from './idempotent-task'
import { reserveUsage, type UsageLimits } from './usage'
import { enqueueTask } from '../queue/enqueue'
import type { SavedConversation, VersionContext } from '../../shared/types/tasks'

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
export async function createConversation(
  db: PrismaClient,
  ownerId: string,
  formulaVersionId: string | null,
  requestKey: string,
) {
  const read = async () => {
    const existing = await db.conversation.findUnique({
      where: { ownerId_requestKey: { ownerId, requestKey } },
    })
    if (existing && existing.formulaVersionId !== formulaVersionId)
      throw new WorkspaceError(409, '这个对话请求编号已用于其他公式版本。')
    return existing
  }
  return idempotentTask(read, async () => {
    const context = formulaVersionId
      ? await readVersionContext(db, ownerId, formulaVersionId)
      : null
    return db.conversation.create({
      data: {
        ownerId,
        formulaVersionId,
        requestKey,
        title: context ? `${context.title} · v${context.number}`.slice(0, 100) : '普通对话',
      },
    })
  })
}
export async function readConversation(
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
export async function submitChatTurn(
  db: PrismaClient,
  boss: PgBoss,
  limits: UsageLimits,
  input: { ownerId: string; conversationId: string; requestKey: string; question: string },
) {
  const question = input.question.trim()
  if (!question || question.length > 2000 || question.includes('\0'))
    throw new WorkspaceError(400, '提问需要包含1～2000个字符。')
  const read = async () => {
    const turn = await db.chatTurn.findUnique({
      where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
    })
    if (turn && (turn.question !== question || turn.conversationId !== input.conversationId))
      throw new WorkspaceError(409, '这个提问编号已用于其他内容。')
    return turn
  }
  return idempotentTask(read, () =>
    db.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<
        { id: string }[]
      >`SELECT id FROM conversations WHERE id=${input.conversationId}::uuid AND "ownerId"=${input.ownerId}::uuid FOR UPDATE`
      if (!locked.length) throw new WorkspaceError(404, '未找到这段对话。')
      // 同一对话行锁保护位置编号，并在锁内再次处理请求键重放。
      const duplicate = await tx.chatTurn.findUnique({
        where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
      })
      if (duplicate) {
        if (duplicate.question !== question || duplicate.conversationId !== input.conversationId)
          throw new WorkspaceError(409, '这个提问编号已用于其他内容。')
        return duplicate
      }
      if (
        await tx.chatTurn.count({
          where: {
            conversationId: input.conversationId,
            ownerId: input.ownerId,
            status: { in: ['QUEUED', 'PROCESSING'] },
          },
        })
      )
        throw new WorkspaceError(409, '上一轮还在处理中，请等回答完成后再发送。')
      const last = await tx.chatMessage.aggregate({
        where: { conversationId: input.conversationId, ownerId: input.ownerId },
        _max: { position: true },
      })
      const turn = await tx.chatTurn.create({ data: { ...input, question } })
      await tx.chatMessage.create({
        data: {
          ownerId: input.ownerId,
          conversationId: input.conversationId,
          turnId: turn.id,
          position: (last._max.position ?? 0) + 1,
          role: 'USER',
          content: question,
        },
      })
      await reserveUsage(tx, input.ownerId, 'CHAT', limits.CHAT)
      const queueJobId = await enqueueTask(boss, tx, 'chat', {
        taskId: turn.id,
        ownerId: input.ownerId,
      })
      await tx.conversation.update({
        where: { id: input.conversationId },
        data: { updatedAt: new Date() },
      })
      return tx.chatTurn.update({ where: { id: turn.id }, data: { queueJobId } })
    }),
  )
}
