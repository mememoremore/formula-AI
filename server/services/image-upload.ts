import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient, StoredFile } from '../generated/prisma/client'
import { Prisma } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { normalizeImage } from '../images/normalize-image'
import { WorkspaceError } from './workspace-error'
import { imageMetadata } from '../database/file-metadata'

interface ImageUploadInput {
  ownerId: string
  uploadKey: string
  name: string
  mimeType: string
  data: Buffer
}

/** 文件生命周期与补偿独立于 HTTP，便于故障注入和后续上传适配。 */
export async function uploadPrivateImage(
  db: PrismaClient,
  store: PrivateObjectStore,
  input: ImageUploadInput,
) {
  const name =
    input.name
      .split(/[\\/]/)
      .at(-1)
      ?.replace(/[\u0000-\u001f\u007f]/g, '')
      .trim() ?? ''
  if (!name || name.length > 255) throw new WorkspaceError(400, '图片名称需要包含 1～255 个字符。')
  const contentHash = createHash('sha256').update(input.data).digest('hex')
  const findExisting = () =>
    db.storedFile.findUnique({
      where: { ownerId_uploadKey: { ownerId: input.ownerId, uploadKey: input.uploadKey } },
    })
  const checkExisting = (file: StoredFile) => {
    if (file.contentHash !== contentHash || file.name !== name || file.mimeType !== input.mimeType)
      throw new WorkspaceError(409, '这个上传请求已用于另一张图片，请重新选择后上传。')
    if (file.status === 'PENDING') throw new WorkspaceError(409, '图片仍在上传，请稍后重试。')
    return file.status === 'READY' ? imageMetadata(file) : null
  }
  const existing = await findExisting()
  if (existing) {
    const result = checkExisting(existing)
    if (result) return result
  }
  const normalized = await normalizeImage(input.data, input.mimeType)
  let file: StoredFile
  if (existing) {
    const claimed = await db.storedFile.updateMany({
      where: { id: existing.id, ownerId: input.ownerId, status: 'DELETED' },
      data: { status: 'PENDING' },
    })
    if (!claimed.count) throw new WorkspaceError(409, '这张图片正在重试上传，请稍后再试。')
    file = existing
  } else {
    const id = randomUUID()
    try {
      file = await db.storedFile.create({
        data: {
          id,
          ownerId: input.ownerId,
          uploadKey: input.uploadKey,
          contentHash,
          kind: 'IMAGE',
          status: 'PENDING',
          bucket: store.bucket,
          objectKey: `${input.ownerId}/images/${id}.${normalized.extension}`,
          name,
          mimeType: normalized.mimeType,
          sizeBytes: normalized.data.length,
          width: normalized.width,
          height: normalized.height,
        },
      })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const duplicate = await findExisting()
        if (duplicate) {
          const result = checkExisting(duplicate)
          if (result) return result
        }
        throw new WorkspaceError(409, '图片正在上传，请稍后重试。')
      }
      throw error
    }
  }
  try {
    await store.put(file.objectKey, normalized.data, normalized.mimeType)
    const ready = await db.storedFile.update({ where: { id: file.id }, data: { status: 'READY' } })
    return imageMetadata(ready)
  } catch {
    // 记录不能标记 READY；跨存储的补偿按尽力执行，失败时保留 PENDING 供排查。
    try {
      await store.remove(file.objectKey)
      await db.storedFile.update({ where: { id: file.id }, data: { status: 'DELETED' } })
    } catch {
      /* 未确认对象清理成功时不释放这个上传请求。 */
    }
    throw new WorkspaceError(503, '图片保存失败，请稍后重试。')
  }
}
