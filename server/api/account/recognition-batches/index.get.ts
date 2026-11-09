import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const expectedOwner = getHeader(event, 'x-account-id')
    if (expectedOwner && expectedOwner !== user.id)
      throw createError({ statusCode: 403, message: '账号已变化，请刷新页面。' })
    const items = await getDatabase().recognitionBatch.findMany({
      where: { ownerId: user.id, historyDeletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 20,
      select: { id: true, mode: true, status: true, createdAt: true },
    })
    return { items: items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })) }
  }),
)
