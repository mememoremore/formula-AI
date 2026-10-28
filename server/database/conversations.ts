import type { PgBoss } from 'pg-boss'
import { bumpConversation } from './chat-revision'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { hasValidResourceIdentity } from './private-resources'
import { idempotentTask } from './idempotent-task'
import { reserveUsage, type UsageLimits } from './usage'
import { enqueueTask } from '../queue/enqueue'
import type { SavedConversation, VersionContext } from '../../shared/types/tasks'

export async function readVersionContext(
  db: Prisma.TransactionClient,
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
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await db.$transaction(
          async (tx) => {
            if (formulaVersionId) {
              if (!hasValidResourceIdentity(ownerId, formulaVersionId))
                throw new WorkspaceError(404, '未找到这个公式版本。')
              // 与标题UPDATE互斥；Serializable同时捕获触发器快照遗漏新会话的phantom竞争。
              const rows = await tx.$queryRaw<
                { id: string }[]
              >`SELECT f.id FROM formulas f JOIN formula_versions v ON v."formulaId"=f.id AND v."ownerId"=f."ownerId" WHERE v.id=${formulaVersionId}::uuid AND v."ownerId"=${ownerId}::uuid FOR SHARE OF f`
              if (!rows.length) throw new WorkspaceError(404, '未找到这个公式版本。')
            }
            const context = formulaVersionId
              ? await readVersionContext(tx, ownerId, formulaVersionId)
              : null
            return tx.conversation.create({
              data: {
                ownerId,
                formulaVersionId,
                requestKey,
                title: context ? `${context.title} · v${context.number}`.slice(0, 100) : '普通对话',
              },
            })
          },
          { isolationLevel: 'Serializable' },
        )
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2034' ||
          attempt === 2
        )
          throw error
      }
    }
    throw new Error('未能完成会话创建事务。')
  })
}
export async function readConversation(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<SavedConversation> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这段对话。')
  return db.$transaction((tx) => readConversationSnapshot(tx, ownerId, id), {
    isolationLevel: 'RepeatableRead',
  })
}
/** 探测不会拼装DTO；变化时再在一致性事务中读取完整权威快照。 */
export async function readConversationForStream(
  db: PrismaClient,
  ownerId: string,
  id: string,
  previous?: SavedConversation,
) {
  if (!previous) return readConversation(db, ownerId, id)
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这段对话。')
  const row = await db.conversation.findFirst({
    where: { id, ownerId },
    select: { revision: true },
  })
  if (!row) throw new WorkspaceError(404, '未找到这段对话。')
  if (previous?.id === id && previous.revision === row.revision.toString()) return previous
  return readConversation(db, ownerId, id)
}
async function readConversationSnapshot(
  db: Prisma.TransactionClient,
  ownerId: string,
  id: string,
): Promise<SavedConversation> {
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
    protocolVersion: 2,
    revision: conversation.revision.toString(),
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
      await bumpConversation(tx, input.conversationId)
      return tx.chatTurn.update({ where: { id: turn.id }, data: { queueJobId } })
    }),
  )
}
