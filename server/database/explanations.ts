import { createHash } from 'node:crypto'
import type { PgBoss } from 'pg-boss'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { EXPLANATION_PROMPT_VERSION, EXPLANATION_QUESTION } from '../../shared/explanation'
import type { ExplanationHistoryPage } from '../../shared/types/tasks'
import { readVersionContext } from './conversations'
import { idempotentTask } from './idempotent-task'
import { reserveUsage, type UsageLimits } from './usage'
import { enqueueTask } from '../queue/enqueue'
import { bumpConversation } from './chat-revision'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'

export async function submitExplanation(
  db: PrismaClient,
  boss: PgBoss,
  limits: UsageLimits,
  input: { ownerId: string; formulaId: string; versionId: string; requestKey: string },
) {
  const requestHash = createHash('sha256')
    .update(
      JSON.stringify({
        formulaId: input.formulaId,
        versionId: input.versionId,
        responseKind: 'FORMULA_EXPLANATION',
      }),
    )
    .digest('hex')
  const read = async () => {
    const row = await db.chatTurn.findUnique({
      where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
    })
    if (row && (row.requestHash !== requestHash || row.responseKind !== 'FORMULA_EXPLANATION'))
      throw new WorkspaceError(409, '这个请求编号已用于其他内容。')
    return row
  }
  return idempotentTask(read, async () => {
    for (let attempt = 0; attempt < 3; attempt++)
      try {
        return await db.$transaction(
          async (tx) => {
            // 与标题触发器相同的Formula→Conversation方向；事务内无外部I/O。
            const rows = await tx.$queryRaw<
              { id: string }[]
            >`SELECT f.id FROM formulas f JOIN formula_versions v ON v."formulaId"=f.id AND v."ownerId"=f."ownerId" WHERE f.id=${input.formulaId}::uuid AND v.id=${input.versionId}::uuid AND f."ownerId"=${input.ownerId}::uuid AND f."deletedAt" IS NULL FOR SHARE OF f`
            if (!rows.length) throw new WorkspaceError(404, '未找到这个公式版本。')
            const context = await readVersionContext(tx, input.ownerId, input.versionId)
            const conversation = await tx.conversation.create({
              data: {
                ownerId: input.ownerId,
                formulaVersionId: input.versionId,
                purpose: 'EXPLANATION',
                requestKey: input.requestKey,
                title: (context.title + ' · v' + context.number + ' 解释').slice(0, 100),
              },
            })
            const turn = await tx.chatTurn.create({
              data: {
                ownerId: input.ownerId,
                conversationId: conversation.id,
                requestKey: input.requestKey,
                question: EXPLANATION_QUESTION,
                responseKind: 'FORMULA_EXPLANATION',
                promptVersion: EXPLANATION_PROMPT_VERSION,
                requestHash,
              },
            })
            await tx.chatMessage.create({
              data: {
                ownerId: input.ownerId,
                conversationId: conversation.id,
                turnId: turn.id,
                position: 1,
                role: 'USER',
                content: EXPLANATION_QUESTION,
              },
            })
            await reserveUsage(tx, input.ownerId, 'CHAT', limits.CHAT)
            const queueJobId = await enqueueTask(boss, tx, 'chat', {
              taskId: turn.id,
              ownerId: input.ownerId,
            })
            await bumpConversation(tx, conversation.id)
            return tx.chatTurn.update({ where: { id: turn.id }, data: { queueJobId } })
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
    throw new Error('未能提交解释任务。')
  })
}
export async function readExplanationHistory(
  db: PrismaClient,
  ownerId: string,
  formulaId: string,
  filters: { versionId?: string; cursor?: string },
): Promise<ExplanationHistoryPage> {
  if (
    !hasValidResourceIdentity(ownerId, formulaId) ||
    !(await db.formula.findFirst({
      where: { id: formulaId, ownerId, deletedAt: null },
      select: { id: true },
    }))
  )
    throw new WorkspaceError(404, '未找到这个公式。')
  const where: Prisma.ConversationWhereInput = {
    ownerId,
    purpose: 'EXPLANATION',
    formulaVersion: { ownerId, formulaId, ...(filters.versionId ? { id: filters.versionId } : {}) },
  }
  if (
    filters.versionId &&
    !(await db.formulaVersion.findFirst({
      where: { id: filters.versionId, formulaId, ownerId },
      select: { id: true },
    }))
  )
    throw new WorkspaceError(404, '未找到这个公式版本。')
  if (filters.cursor) {
    const anchor =
      hasValidResourceIdentity(ownerId, filters.cursor) &&
      (await db.conversation.findFirst({
        where: { ...where, id: filters.cursor },
        select: { id: true, createdAt: true },
      }))
    if (!anchor) throw new WorkspaceError(404, '历史分页位置无效。')
    where.OR = [
      { createdAt: { lt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ]
  }
  const rows = await db.conversation.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 21,
    include: {
      formulaVersion: { select: { number: true } },
      turns: { where: { ownerId, responseKind: 'FORMULA_EXPLANATION' }, take: 1 },
    },
  })
  const items = rows.slice(0, 20).map((row) => ({
    id: row.id,
    versionId: row.formulaVersionId!,
    versionNumber: row.formulaVersion!.number,
    isMock: row.turns[0]?.responseIsMock ?? true,
    modelVersion: row.turns[0]?.responseModel ?? null,
    createdAt: row.createdAt.toISOString(),
    status: row.turns[0]?.status ?? 'FAILED',
    errorMessage: row.turns[0]?.errorMessage ?? null,
    promptVersion: row.turns[0]?.promptVersion ?? null,
  }))
  return { items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null }
}
