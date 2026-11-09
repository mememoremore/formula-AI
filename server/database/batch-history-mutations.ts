import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'
import { recognitionHistoryDeleteSchema } from '../../shared/schemas/recognition-history'

export async function deleteBatchHistory(db: PrismaClient, ownerId: string, inputIds: string[]) {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  const checked = recognitionHistoryDeleteSchema.safeParse({ ids: inputIds })
  if (!checked.success) throw new WorkspaceError(400, '请选择1～100条有效的批次记录。')
  const ids = checked.data.ids
  const resources = Prisma.join(ids.map((id) => Prisma.sql`${id}::uuid`))
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>(Prisma.sql`
      SELECT id, status FROM recognition_batches WHERE "ownerId"=${ownerId}::uuid AND id IN (${resources}) ORDER BY id FOR UPDATE
    `)
    if (rows.length !== ids.length)
      throw new WorkspaceError(404, '部分批次不存在或无权操作，请刷新后重试。')
    if (rows.some((row) => !['COMPLETED', 'CANCELLED'].includes(row.status)))
      throw new WorkspaceError(409, '请先完成运行中或暂停的批次，再删除记录。')
    // Do not modify updatedAt, status or leases: hiding history must not affect dispatch.
    const deletedCount = await tx.$executeRaw(Prisma.sql`
      UPDATE recognition_batches SET "historyDeletedAt"=CURRENT_TIMESTAMP
      WHERE "ownerId"=${ownerId}::uuid AND id IN (${resources}) AND "historyDeletedAt" IS NULL
    `)
    return { ids, deletedCount }
  })
}
