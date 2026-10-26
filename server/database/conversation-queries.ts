import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'
import type { ConversationPage } from '../../shared/types/tasks'

/** 搜索整个账号的对话，不局限于前端已经加载的第一页。 */
export async function readConversationList(
  db: PrismaClient,
  ownerId: string,
  filters: { q?: string; cursor?: string },
): Promise<ConversationPage> {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  const conditions = [Prisma.sql`c."ownerId" = ${ownerId}::uuid`]
  if (filters.cursor) {
    const anchor =
      hasValidResourceIdentity(ownerId, filters.cursor) &&
      (await db.conversation.findFirst({
        where: { id: filters.cursor, ownerId },
        select: { id: true, createdAt: true },
      }))
    if (!anchor) throw new WorkspaceError(404, '分页位置无效。')
    conditions.push(
      Prisma.sql`(c."createdAt",c.id) < (${anchor.createdAt}::timestamptz,${anchor.id}::uuid)`,
    )
  }
  if (filters.q)
    conditions.push(Prisma.sql`(
    position(lower(${filters.q}) in lower(c.title)) > 0 OR EXISTS (
      SELECT 1 FROM chat_messages s WHERE s."conversationId"=c.id AND s."ownerId"=${ownerId}::uuid
      AND s.role='USER' AND position(lower(${filters.q}) in lower(s.content)) > 0
    )
  )`)
  const rows = await db.$queryRaw<
    { id: string; title: string; createdAt: Date; preview: string | null; latex: string | null }[]
  >(Prisma.sql`
    SELECT c.id,c.title,c."createdAt",left(m.content,120) AS preview,v.latex
    FROM conversations c
    LEFT JOIN formula_versions v ON v.id=c."formulaVersionId" AND v."ownerId"=${ownerId}::uuid
    LEFT JOIN LATERAL (SELECT content FROM chat_messages WHERE "conversationId"=c.id AND "ownerId"=${ownerId}::uuid AND role='USER' ORDER BY position ASC LIMIT 1) m ON true
    WHERE ${Prisma.join(conditions, ' AND ')}
    ORDER BY c."createdAt" DESC,c.id DESC LIMIT 21
  `)
  const items = rows
    .slice(0, 20)
    .map((row) => ({
      ...row,
      title: row.title === '普通对话' && row.preview ? row.preview.slice(0, 60) : row.title,
      preview: row.preview ?? '',
      createdAt: row.createdAt.toISOString(),
    }))
  return { items, nextCursor: rows.length > 20 ? items.at(-1)!.id : null }
}
