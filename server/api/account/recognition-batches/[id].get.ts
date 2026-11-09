import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readRecognitionBatch } from '../../../database/recognition-batches'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const expectedOwner = getHeader(event, 'x-account-id')
    if (expectedOwner && expectedOwner !== user.id)
      throw createError({ statusCode: 403, message: '账号已变化，请刷新页面。' })
    return readRecognitionBatch(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
