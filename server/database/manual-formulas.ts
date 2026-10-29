import type { PrismaClient } from '../generated/prisma/client'
import { createFormulaInTransaction } from './formulas'
import { WorkspaceError } from '../services/workspace-error'
import { manualFormulaHash, type ManualFormulaInput } from '../services/manual-formula-input'
/** One account lock serializes replay and the successful-create rate count across instances. */
export async function createManualFormula(
  db: PrismaClient,
  ownerId: string,
  input: ManualFormulaInput,
) {
  const hash = manualFormulaHash(input)
  const limit = Number(process.env.FORMULA_MANUAL_CREATES_PER_MINUTE ?? 10)
  if (!Number.isSafeInteger(limit) || limit <= 0)
    throw new WorkspaceError(503, '手动创建暂时不可用。')
  return db.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 721018))::text`
      const existing = await tx.formula.findUnique({
        where: { ownerId_creationKey: { ownerId, creationKey: input.requestKey } },
      })
      if (existing) {
        if (existing.creationHash !== hash)
          throw new WorkspaceError(409, '这个创建请求编号已用于其他内容，请先核对已保存公式。')
        return { id: existing.id, replayed: true }
      }
      const recent = await tx.formula.count({
        where: {
          ownerId,
          creationKey: { not: null },
          createdAt: { gte: new Date(Date.now() - 60_000) },
        },
      })
      if (recent >= limit)
        throw new WorkspaceError(429, '手动创建过于频繁，请一分钟后重试；已有请求可以安全重放。')
      const { formula } = await createFormulaInTransaction(tx, {
        ownerId,
        title: input.title,
        latex: input.latex,
        origin: 'MANUAL',
      })
      await tx.formula.update({
        where: { id: formula.id },
        data: { creationKey: input.requestKey, creationHash: hash },
      })
      return { id: formula.id, replayed: false }
    },
    { timeout: 10000 },
  )
}
