import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { workspaceRequest } from '../../utils/workspace-operation'
import { readRecognitionHistory } from '../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const cursor = getQuery(event).cursor
    if (cursor !== undefined && typeof cursor !== 'string')
      throw createError({ statusCode: 400, message: '分页参数无效。' })
    return readRecognitionHistory(getDatabase(), user.id, cursor)
  }),
)
