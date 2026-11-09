import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { hasValidResourceIdentity } from './private-resources'
import { formulaBatchDeleteSchema } from '../../shared/schemas/formula-input'
import { lockIdentity } from './formula-identities'
import { recycleExpiry } from '../../shared/recycle-bin'

/** Hide the same formula everywhere, preserving immutable versions, conversations and exports. */
export async function deleteFormulaBatch(db: PrismaClient, ownerId: string, inputIds: string[]) {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  const checked = formulaBatchDeleteSchema.safeParse({ ids: inputIds })
  if (!checked.success) throw new WorkspaceError(400, '请选择1～100条有效的公式。')
  let ids = checked.data.ids
  return db.$transaction(async (tx) => {
    await lockIdentity(tx, ownerId)
    const originals = await tx.formula.findMany({
      where: { ownerId, id: { in: ids } },
      select: { id: true, canonicalId: true },
    })
    if (originals.length !== ids.length) throw new WorkspaceError(404, '部分公式不存在或无权操作。')
    const roots = [...new Set(originals.map((f) => f.canonicalId ?? f.id))]
    ids = (
      await tx.formula.findMany({
        where: { ownerId, OR: [{ id: { in: roots } }, { canonicalId: { in: roots } }] },
        select: { id: true },
      })
    ).map((f) => f.id)
    const rows = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
      SELECT id FROM formulas WHERE "ownerId"=${ownerId}::uuid AND id IN (${Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))}) ORDER BY id FOR UPDATE
    `)
    if (rows.length !== ids.length)
      throw new WorkspaceError(404, '部分公式不存在或无权操作，请刷新后重试。')
    const newlyDeleted = await tx.formula.findMany({
      where: { ownerId, id: { in: roots }, deletedAt: null },
      select: { id: true },
    })
    const deletedAt = new Date()
    const result = await tx.formula.updateMany({
      where: { ownerId, id: { in: ids }, deletedAt: null },
      data: { deletedAt },
    })
    if (newlyDeleted.length)
      await tx.formulaRecycleEntry.createMany({
        data: newlyDeleted.map((row) => ({
          formulaId: row.id,
          ownerId,
          deletedAt,
          expiresAt: recycleExpiry(deletedAt),
        })),
        skipDuplicates: true,
      })
    await tx.favorite.deleteMany({ where: { ownerId, formulaId: { in: ids } } })
    return { ids, deletedCount: result.count }
  })
}
