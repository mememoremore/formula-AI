import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient, ResourceLease } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { normalizeAvatar } from '../images/avatar'
import { type ProfileUpdate } from './profile-input'
import { WorkspaceError } from './workspace-error'
import {
  reserveResource,
  releaseUnbound,
  resourceTransaction,
  assertCapacity,
  requireLease,
  type ResourceTransaction,
} from '../resources/leases'
import { prepareFile, putAndPublish } from '../resources/files'
import { MAX_AVATAR_BYTES, resourcePolicy, ResourceLimitError } from '../resources/policy'
import { retireAvatar } from '../resources/avatar-lifecycle'
/** 头像的元数据与新资料原子发布；失败不删除仍在使用的旧头像。 */
export async function saveProfile(
  db: PrismaClient,
  store: PrivateObjectStore | null,
  ownerId: string,
  input: ProfileUpdate,
  admitted?: ResourceLease,
) {
  const previous = await db.user.findUniqueOrThrow({ where: { id: ownerId } })
  const update = async (tx: ResourceTransaction, image: string | null) => {
    const updated = await tx.user.updateMany({
      where: { id: ownerId, updatedAt: previous.updatedAt },
      data: { displayName: input.name, image },
    })
    if (!updated.count) throw new WorkspaceError(409, '资料已在其他窗口更新，请重新读取后保存。')
    return { saved: true }
  }
  if (input.avatar === undefined || input.avatar === null) {
    const result = await resourceTransaction(db, ownerId, (tx) =>
      update(tx, input.avatar === null ? null : previous.image),
    )
    if (input.avatar === null && store)
      await retireAvatar(db, store, ownerId, previous.image).catch(() => {})
    return result
  }
  if (!store) throw new WorkspaceError(503, '头像存储暂时不可用。')
  const hash = createHash('sha256').update(input.avatar).digest('hex')
  const current = previous.image
    ? await db.storedFile.findFirst({
        where: {
          ownerId,
          objectKey: previous.image,
          kind: 'AVATAR',
          status: 'READY',
          contentHash: hash,
        },
      })
    : null
  // 同一头像的成功重放无需再次占用空间；昵称仍沿用原有 CAS 保护。
  if (current) return resourceTransaction(db, ownerId, (tx) => update(tx, current.objectKey))
  const lease =
    admitted ??
    (await reserveResource(db, {
      ownerId,
      purpose: 'AVATAR_UPLOAD',
      requestKey: hash,
      bytes: MAX_AVATAR_BYTES,
    }))
  try {
    if (admitted)
      await resourceTransaction(db, ownerId, async (tx) => {
        if (lease.ownerId !== ownerId || lease.purpose !== 'AVATAR_UPLOAD')
          throw new WorkspaceError(409, '头像许可不匹配。')
        await requireLease(tx, lease)
        const policy = resourcePolicy()
        const recent = await tx.resourceLease.count({
          where: {
            ownerId,
            purpose: { in: ['IMAGE_UPLOAD', 'AVATAR_UPLOAD'] },
            countsTowardRate: true,
            createdAt: { gte: new Date(Date.now() - 60000) },
          },
        })
        if (recent >= policy.uploadsPerMinute)
          throw new ResourceLimitError('UPLOAD_RATE', 429, '上传过于频繁，请一分钟后重试。')
        await assertCapacity(tx, ownerId, BigInt(MAX_AVATAR_BYTES), policy)
        await tx.resourceLease.update({
          where: { id: lease.id },
          data: { reservedBytes: MAX_AVATAR_BYTES, countsTowardRate: true, requestKey: hash },
        })
      })
    const bytes = await normalizeAvatar(input.avatar)
    const id = randomUUID()
    const file = await prepareFile(db, lease, {
      id,
      uploadKey: `avatar:${id}`,
      kind: 'AVATAR',
      bucket: store.bucket,
      objectKey: `avatars/${ownerId}/${id}.webp`,
      name: 'avatar.webp',
      mimeType: 'image/webp',
      contentHash: hash,
      sizeBytes: bytes.length,
      width: 512,
      height: 512,
    })
    const result = await putAndPublish(db, store, lease, file, bytes, (tx) =>
      update(tx, file.objectKey),
    )
    await retireAvatar(db, store, ownerId, previous.image).catch(() => {})
    return result
  } finally {
    await releaseUnbound(db, lease).catch(() => {})
  }
}
