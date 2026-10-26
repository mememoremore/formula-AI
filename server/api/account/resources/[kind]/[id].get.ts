import { requireAccountUser } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { readPrivateResource } from '../../../../database/private-resources'

export default defineEventHandler(async (event) => {
  const user = await requireAccountUser(event)
  const resource = await readPrivateResource(
    getDatabase(),
    user.id,
    getRouterParam(event, 'kind') ?? '',
    getRouterParam(event, 'id') ?? '',
  )
  if (!resource) throw createError({ statusCode: 404, message: '未找到这条记录。' })
  return { resource }
})
