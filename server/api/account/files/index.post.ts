import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getObjectStore } from '../../../utils/storage'
import { readLimitedBody } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { hasValidResourceIdentity } from '../../../database/private-resources'
import { MAX_IMAGE_BYTES } from '../../../images/normalize-image'
import { beginImageUpload, uploadPrivateImage } from '../../../services/image-upload'
import { releaseUnbound } from '../../../resources/leases'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const uploadKey = getHeader(event, 'x-upload-key') ?? ''
    if (!hasValidResourceIdentity(user.id, uploadKey))
      throw createError({ statusCode: 400, message: '缺少有效的上传请求编号。' })
    const mimeType = getHeader(event, 'content-type')?.split(';')[0] ?? ''
    if (!['image/jpeg', 'image/png'].includes(mimeType))
      throw createError({ statusCode: 415, message: '只支持 JPEG 或 PNG 图片。' })
    let name: string
    try {
      name = decodeURIComponent(getHeader(event, 'x-file-name') ?? '')
    } catch {
      throw createError({ statusCode: 400, message: '图片名称编码无效。' })
    }
    const db = getDatabase()
    const lease = await beginImageUpload(
      db,
      user.id,
      uploadKey,
      Number(getHeader(event, 'content-length')),
    )
    try {
      const data = await readLimitedBody(event, MAX_IMAGE_BYTES)
      return {
        image: await uploadPrivateImage(
          db,
          getObjectStore(),
          {
            ownerId: user.id,
            uploadKey,
            name,
            mimeType,
            data,
          },
          lease,
        ),
      }
    } finally {
      await releaseUnbound(db, lease).catch(() => {})
    }
  }),
)
