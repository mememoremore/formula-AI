import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { workspaceRequest } from '../../utils/workspace-operation'
import { readRecognitionHistory } from '../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const { cursor, q } = getQuery(event)
    if (
      (cursor !== undefined && typeof cursor !== 'string') ||
      (q !== undefined && (typeof q !== 'string' || q.length > 200 || q.includes('\0')))
    )
      throw createError({ statusCode: 400, message: '搜索或分页参数无效。' })
    return readRecognitionHistory(
      getDatabase(),
      user.id,
      cursor,
      typeof q === 'string' ? q.trim() : '',
    )
  }),
)
