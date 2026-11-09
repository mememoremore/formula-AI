import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { hasValidResourceIdentity } from './private-resources'
export async function identityRoot(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  id: string,
) {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这条公式。')
  const formula = await db.formula.findFirst({ where: { id, ownerId, deletedAt: null } })
  if (!formula) throw new WorkspaceError(404, '未找到这条公式。')
  if (!formula.canonicalId) return formula
  const root = await db.formula.findFirst({
    where: { id: formula.canonicalId, ownerId, deletedAt: null, canonicalId: null },
  })
  if (!root) throw new WorkspaceError(409, '关联公式已变化，请刷新后重试。')
  return root
}
export async function identityMembers(
  db: PrismaClient | Prisma.TransactionClient,
  ownerId: string,
  id: string,
) {
  const root = await identityRoot(db, ownerId, id)
  return db.formula.findMany({
    where: { ownerId, deletedAt: null, OR: [{ id: root.id }, { canonicalId: root.id }] },
    select: { id: true },
  })
}
export async function lockIdentity(tx: Prisma.TransactionClient, ownerId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId + 'formula-identities'},0))::text`
}
export async function identityTransaction<T>(
  db: PrismaClient,
  work: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await db.$transaction(work, { isolationLevel: 'Serializable' })
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        !['P2034', 'P2002'].includes(error.code) ||
        attempt === 2
      )
        throw error
    }
  }
  throw new WorkspaceError(409, '操作冲突，请重新核对。')
}
