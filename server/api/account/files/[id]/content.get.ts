import { requireAccountUser } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getObjectStore } from '../../../../utils/storage'
import { workspaceOperation } from '../../../../utils/workspace-operation'
import { hasValidResourceIdentity } from '../../../../database/private-resources'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    if (!hasValidResourceIdentity(user.id, id))
      throw createError({ statusCode: 404, message: '未找到这张图片。' })
    const file = await getDatabase().storedFile.findFirst({
      where: { id, ownerId: user.id, kind: 'IMAGE', status: 'READY' },
    })
    if (!file) throw createError({ statusCode: 404, message: '未找到这张图片。' })
    let data: Buffer
    try {
      data = await getObjectStore().get(file.objectKey)
    } catch {
      throw createError({ statusCode: 503, message: '原始图片暂时无法读取，请稍后重试。' })
    }
    setResponseHeader(event, 'Content-Type', file.mimeType)
    setResponseHeader(event, 'Content-Length', data.length)
    setResponseHeader(event, 'Content-Disposition', 'inline')
    setResponseHeader(event, 'X-Content-Type-Options', 'nosniff')
    return data
  }),
)
