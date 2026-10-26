import { requireAccountUser } from '../../utils/auth'
import { getObjectStore } from '../../utils/storage'
import { isAvatarKey } from '../../services/profile-input'
import { workspaceOperation } from '../../utils/workspace-operation'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    if (!isAvatarKey(user.image, user.id))
      throw createError({ statusCode: 404, message: '尚未设置头像。' })
    const data = await getObjectStore().get(user.image)
    setResponseHeader(event, 'Content-Type', 'image/webp')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    return data
  }),
)
