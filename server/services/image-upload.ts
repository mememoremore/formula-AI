import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient, ResourceLease, StoredFile } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { normalizeImage, MAX_IMAGE_BYTES } from '../images/normalize-image'
import { WorkspaceError } from './workspace-error'
import { imageMetadata } from '../database/file-metadata'
import { reserveResource, releaseUnbound } from '../resources/leases'
import { prepareFile, putAndPublish } from '../resources/files'
export interface ImageUploadInput {
  ownerId: string
  uploadKey: string
  name: string
  mimeType: string
  data: Buffer
}
export async function beginImageUpload(
  db: PrismaClient,
  ownerId: string,
  uploadKey: string,
  declaredBytes = MAX_IMAGE_BYTES,
) {
  const existing = await db.storedFile.findUnique({
    where: { ownerId_uploadKey: { ownerId, uploadKey } },
  })
  return reserveResource(db, {
    ownerId,
    purpose: 'IMAGE_UPLOAD',
    requestKey: uploadKey,
    bytes:
      existing?.status === 'READY'
        ? 0
        : Number.isSafeInteger(declaredBytes) &&
            declaredBytes > 0 &&
            declaredBytes <= MAX_IMAGE_BYTES
          ? declaredBytes
          : MAX_IMAGE_BYTES,
    countsTowardRate: existing?.status !== 'READY',
  })
}
/** HTTP 在读取正文前取得许可；非 HTTP 调用也不能绕过资源准入。 */
export async function uploadPrivateImage(
  db: PrismaClient,
  store: PrivateObjectStore,
  input: ImageUploadInput,
  admitted?: ResourceLease,
) {
  const lease = admitted ?? (await beginImageUpload(db, input.ownerId, input.uploadKey))
  try {
    if (
      lease.ownerId !== input.ownerId ||
      lease.requestKey !== input.uploadKey ||
      lease.purpose !== 'IMAGE_UPLOAD'
    )
      throw new WorkspaceError(409, '上传许可不匹配。')
    const name =
      input.name
        .split(/[\\/]/)
        .at(-1)
        ?.replace(/[\u0000-\u001f\u007f]/g, '')
        .trim() ?? ''
    if (!name || name.length > 255)
      throw new WorkspaceError(400, '图片名称需要包含 1～255 个字符。')
    const contentHash = createHash('sha256').update(input.data).digest('hex')
    const existing = await db.storedFile.findUnique({
      where: { ownerId_uploadKey: { ownerId: input.ownerId, uploadKey: input.uploadKey } },
    })
    if (existing) {
      checkReplay(existing, contentHash, name, input.mimeType)
      if (existing.status === 'READY') return imageMetadata(existing)
    }
    const normalized = await normalizeImage(input.data, input.mimeType)
    const id = existing?.id ?? randomUUID()
    const file = await prepareFile(
      db,
      lease,
      {
        id,
        uploadKey: input.uploadKey,
        contentHash,
        kind: 'IMAGE',
        bucket: store.bucket,
        objectKey: `${input.ownerId}/images/${id}/${lease.executionToken}.${normalized.extension}`,
        name,
        mimeType: normalized.mimeType,
        sizeBytes: normalized.data.length,
        width: normalized.width,
        height: normalized.height,
      },
      existing?.id,
    )
    try {
      return await putAndPublish(db, store, lease, file, normalized.data, async (_tx, ready) =>
        imageMetadata(ready),
      )
    } catch {
      throw new WorkspaceError(503, '图片保存结果待核对，请保留请求编号后稍后重试。')
    }
  } finally {
    await releaseUnbound(db, lease).catch(() => {})
  }
}
function checkReplay(file: StoredFile, hash: string, name: string, mime: string) {
  if (file.contentHash !== hash || file.name !== name || file.mimeType !== mime)
    throw new WorkspaceError(409, '这个上传请求已用于另一张图片，请重新选择后上传。')
  if (file.status !== 'READY' && file.status !== 'DELETED')
    throw new WorkspaceError(409, '图片仍在上传或等待核对，请稍后重试。')
}
