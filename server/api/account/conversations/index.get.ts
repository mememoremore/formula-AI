import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readConversationList } from '../../../database/conversation-queries'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const { q, cursor } = getQuery(event)
    if (q !== undefined && (typeof q !== 'string' || q.length > 100))
      throw createError({ statusCode: 400, message: '搜索关键词不能超过100字。' })
    if (cursor !== undefined && typeof cursor !== 'string')
      throw createError({ statusCode: 400, message: '分页参数无效。' })
    return readConversationList(getDatabase(), user.id, {
      q: typeof q === 'string' ? q.trim() : undefined,
      cursor: typeof cursor === 'string' ? cursor : undefined,
    })
  }),
)
