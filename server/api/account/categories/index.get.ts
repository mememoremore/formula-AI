import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readCategories } from '../../../database/library-queries'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const expectedOwner = getHeader(event, 'x-account-id')
    if (expectedOwner && expectedOwner !== user.id)
      throw createError({ statusCode: 403, message: '账号已变化，请刷新页面。' })
    const favorites = getQuery(event).favorites
    if (favorites !== undefined && favorites !== 'true' && favorites !== 'false')
      throw createError({ statusCode: 400, message: '收藏筛选参数无效。' })
    return readCategories(getDatabase(), user.id, favorites === 'true')
  }),
)
