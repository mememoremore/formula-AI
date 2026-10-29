import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { isAvatarKey } from '../services/profile-input'
import { resourceTransaction } from './leases'
import { objectFingerprint, fileReferenced, audit } from './files'
/** 正常替换的明确旧头像可以立即退役；失败/未知对象的批量清理仍有七天宽限。 */
export async function retireAvatar(
  db: PrismaClient,
  store: PrivateObjectStore,
  ownerId: string,
  key: string | null,
) {
  if (!isAvatarKey(key, ownerId)) return
  const operationId = randomUUID()
  const candidate = await resourceTransaction(db, ownerId, async (tx) => {
    if (await tx.user.count({ where: { image: key } })) return null
    const file = await tx.storedFile.findUnique({
      where: { bucket_objectKey: { bucket: store.bucket, objectKey: key } },
    })
    if (file) {
      if (
        file.ownerId !== ownerId ||
        file.kind !== 'AVATAR' ||
        file.status !== 'READY' ||
        (await fileReferenced(tx, file)) ||
        (await tx.resourceLease.count({ where: { fileId: file.id, status: { not: 'RELEASED' } } }))
      )
        return null
      await tx.storedFile.update({ where: { id: file.id }, data: { status: 'DELETING' } })
      await audit(tx, file, 'AVATAR_RETIRE', 'STARTED', operationId)
    } else
      await tx.storageCleanupAudit.create({
        data: {
          operationId,
          objectFingerprint: objectFingerprint(store.bucket, key),
          action: 'LEGACY_AVATAR_RETIRE',
          outcome: 'STARTED',
        },
      })
    return { fileId: file?.id }
  })
  if (!candidate) return
  try {
    await store.remove(key)
    if (!store.head || (await store.head(key))) throw new Error('Avatar deletion not confirmed')
    await resourceTransaction(db, ownerId, async (tx) => {
      if (candidate.fileId)
        await tx.storedFile.updateMany({
          where: { id: candidate.fileId, objectKey: key, status: 'DELETING' },
          data: { status: 'DELETED' },
        })
      await tx.storageCleanupAudit.create({
        data: {
          operationId,
          fileId: candidate.fileId,
          objectFingerprint: objectFingerprint(store.bucket, key),
          action: 'AVATAR_RETIRE',
          outcome: 'DELETED',
        },
      })
    })
  } catch {
    await db.storageCleanupAudit
      .create({
        data: {
          operationId,
          fileId: candidate.fileId,
          objectFingerprint: objectFingerprint(store.bucket, key),
          action: 'AVATAR_RETIRE',
          outcome: 'REVIEW_REQUIRED',
        },
      })
      .catch(() => {})
  }
}
