import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { restoreInput } from '../../shared/schemas/learning'
import type { RecycleBinView } from '../../shared/recycle-bin'
import { lockIdentity } from './formula-identities'
import { WorkspaceError } from '../services/workspace-error'

export async function readRecycleBin(
  db: PrismaClient,
  ownerId: string,
  now = new Date(),
): Promise<RecycleBinView> {
  const rows = await db.formulaRecycleEntry.findMany({
    where: {
      ownerId,
      expiresAt: { gt: now },
      formula: { ownerId, deletedAt: { not: null }, canonicalId: null },
    },
    orderBy: [{ deletedAt: 'desc' }, { formulaId: 'asc' }],
    take: 101,
    include: {
      formula: {
        select: {
          title: true,
          versions: {
            where: { ownerId },
            orderBy: { number: 'desc' },
            take: 1,
            select: { latex: true },
          },
        },
      },
    },
  })
  return {
    serverNow: now.toISOString(),
    hasMore: rows.length > 100,
    items: rows.slice(0, 100).map((row) => ({
      id: row.formulaId,
      kind: 'formula',
      title: row.formula.title,
      latex: row.formula.versions[0]?.latex ?? '',
      deletedAt: row.deletedAt.toISOString(),
      expiresAt: row.expiresAt.toISOString(),
    })),
  }
}

export async function restoreRecycled(
  db: PrismaClient,
  ownerId: string,
  raw: unknown,
  now = new Date(),
) {
  const input = restoreInput.safeParse(raw)
  if (!input.success) throw new WorkspaceError(400, '请选择有效的回收站公式。')
  const { ids } = input.data
  return db.$transaction(async (tx) => {
    await lockIdentity(tx, ownerId)
    const rows = await tx.formula.findMany({
      where: { id: { in: ids }, ownerId },
      select: { id: true, canonicalId: true },
    })
    if (rows.length !== ids.length)
      throw new WorkspaceError(404, '部分公式不存在或不属于当前账号。')
    const roots = [...new Set(rows.map((row) => row.canonicalId ?? row.id))]
    const rootRows = await tx.formula.findMany({
      where: { ownerId, id: { in: roots }, canonicalId: null },
      select: { id: true, deletedAt: true },
    })
    if (rootRows.length !== roots.length)
      throw new WorkspaceError(409, '公式关联已变化，请刷新后重试。')
    const deletedRoots = rootRows.filter((row) => row.deletedAt !== null).map((row) => row.id)
    if (!deletedRoots.length) return { restored: 0 }
    const entries = await tx.$queryRaw<{ formulaId: string }[]>(Prisma.sql`
      SELECT "formulaId" FROM formula_recycle_entries
      WHERE "ownerId"=${ownerId}::uuid AND "expiresAt">${now}
      AND "formulaId" IN (${Prisma.join(deletedRoots.map((id) => Prisma.sql`${id}::uuid`))})
      ORDER BY "formulaId" FOR UPDATE
    `)
    if (entries.length !== deletedRoots.length)
      throw new WorkspaceError(410, '部分公式已清空或超过10天，无法恢复。')
    const result = await tx.formula.updateMany({
      where: {
        ownerId,
        deletedAt: { not: null },
        OR: [{ id: { in: deletedRoots } }, { canonicalId: { in: deletedRoots } }],
      },
      data: { deletedAt: null },
    })
    await tx.formulaRecycleEntry.deleteMany({ where: { ownerId, formulaId: { in: deletedRoots } } })
    return { restored: result.count }
  })
}

/** Clear only restoration records; deleted formulas remain referenced by their historical conversations/exports. */
export async function clearRecycleBin(db: PrismaClient, ownerId: string) {
  return db.$transaction(async (tx) => {
    await lockIdentity(tx, ownerId)
    const result = await tx.formulaRecycleEntry.deleteMany({ where: { ownerId } })
    return { cleared: result.count }
  })
}

/** Bounded, multi-instance-safe maintenance; API expiry checks remain effective while maintenance is offline. */
export async function purgeExpiredRecycleEntries(db: PrismaClient, now = new Date()) {
  return db.$executeRaw`
    DELETE FROM formula_recycle_entries WHERE "formulaId" IN (
      SELECT "formulaId" FROM formula_recycle_entries
      WHERE "expiresAt" <= ${now} ORDER BY "expiresAt", "formulaId"
      LIMIT 1000 FOR UPDATE SKIP LOCKED
    )
  `
}
