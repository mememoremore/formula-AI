import { createHash, randomUUID } from 'node:crypto'
import type { PrismaClient, ResourceLease, StoredFile, Prisma } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { WorkspaceError } from '../services/workspace-error'
import {
  assertCapacity,
  requireLease,
  resourceTransaction,
  releaseBound,
  type ResourceTransaction,
} from './leases'
import { resourcePolicy } from './policy'
export const objectFingerprint = (bucket: string, key: string) =>
  createHash('sha256')
    .update(bucket + '\0' + key)
    .digest('hex')
export async function audit(
  tx: ResourceTransaction,
  file: Pick<StoredFile, 'id' | 'bucket' | 'objectKey'>,
  action: string,
  outcome: string,
  operationId = randomUUID(),
) {
  await tx.storageCleanupAudit.create({
    data: {
      operationId,
      fileId: file.id,
      objectFingerprint: objectFingerprint(file.bucket, file.objectKey),
      action,
      outcome,
    },
  })
}
export async function fileReferenced(tx: ResourceTransaction, file: StoredFile) {
  return Boolean(
    (await tx.recognitionTask.count({ where: { inputFileId: file.id } })) ||
    (await tx.exportTask.count({ where: { fileId: file.id } })) ||
    (await tx.user.count({ where: { image: file.objectKey } })),
  )
}
/** 将预留原子转换为文件占用；超出预留的部分仍在同一锁内检查。 */
export async function prepareFile(
  db: PrismaClient,
  lease: ResourceLease,
  data: Omit<Prisma.StoredFileUncheckedCreateInput, 'ownerId' | 'status'>,
  existingId?: string,
) {
  return resourceTransaction(db, lease.ownerId, async (tx) => {
    const current = await requireLease(tx, lease)
    if (current.fileId) throw new WorkspaceError(409, '请求已经绑定文件。')
    const delta = BigInt(data.sizeBytes) - current.reservedBytes
    if (delta > 0) await assertCapacity(tx, lease.ownerId, delta, resourcePolicy())
    let file: StoredFile
    if (existingId) {
      const previous = await tx.storedFile.findFirst({
        where: { id: existingId, ownerId: lease.ownerId, status: 'DELETED' },
      })
      if (!previous) throw new WorkspaceError(409, '该图片正在处理，请稍后重试。')
      file = await tx.storedFile.update({
        where: { id: existingId },
        data: { ...data, id: undefined, ownerId: lease.ownerId, status: 'PENDING' },
      })
    } else
      file = await tx.storedFile.create({
        data: { ...data, ownerId: lease.ownerId, status: 'PENDING' },
      })
    await tx.resourceLease.update({
      where: { id: lease.id },
      data: { fileId: file.id, reservedBytes: 0 },
    })
    return file
  })
}
/** READY、账号资料/任务结果和许可释放一次提交；回调仅包含数据库操作。 */
export async function publishFile<T>(
  db: PrismaClient,
  lease: ResourceLease,
  file: StoredFile,
  finish: (tx: ResourceTransaction, ready: StoredFile) => Promise<T>,
) {
  return resourceTransaction(db, lease.ownerId, async (tx) => {
    const current = await requireLease(tx, lease)
    if (current.fileId !== file.id) throw new WorkspaceError(409, '文件执行许可不匹配。')
    const changed = await tx.storedFile.updateMany({
      where: { id: file.id, ownerId: lease.ownerId, objectKey: file.objectKey, status: 'PENDING' },
      data: { status: 'READY' },
    })
    if (!changed.count) throw new WorkspaceError(409, '文件状态已经变化。')
    const result = await finish(tx, { ...file, status: 'READY' })
    await releaseBound(tx, lease)
    return result
  })
}
/** 结果不确定时保留占用；特别避免“提交成功但响应丢失”后删除有效成品。 */
export async function quarantineFile(db: PrismaClient, lease: ResourceLease, file: StoredFile) {
  await resourceTransaction(db, lease.ownerId, async (tx) => {
    const current = await tx.storedFile.findUnique({ where: { id: file.id } })
    if (!current || current.objectKey !== file.objectKey || current.status === 'READY') return
    await tx.resourceLease.updateMany({
      where: { id: lease.id, executionToken: lease.executionToken, status: 'ACTIVE' },
      data: { status: 'REVIEW_REQUIRED', executionToken: randomUUID() },
    })
    await audit(tx, current, 'WRITE_RECONCILE', 'REVIEW_REQUIRED')
  })
}
/** 只清理已确定 PUT 完成、数据库未发布的本次对象；失败则保留核对。 */
export async function compensateFile(
  db: PrismaClient,
  store: PrivateObjectStore,
  lease: ResourceLease,
  file: StoredFile,
) {
  const removable = await resourceTransaction(db, lease.ownerId, async (tx) => {
    const current = await tx.resourceLease.findUnique({ where: { id: lease.id } })
    const stored = await tx.storedFile.findUnique({ where: { id: file.id } })
    if (
      !current ||
      current.status !== 'ACTIVE' ||
      current.executionToken !== lease.executionToken ||
      current.expiresAt <= new Date() ||
      !stored ||
      stored.status !== 'PENDING' ||
      stored.objectKey !== file.objectKey ||
      (await fileReferenced(tx, stored))
    )
      return false
    await tx.storedFile.update({ where: { id: file.id }, data: { status: 'DELETING' } })
    await audit(tx, stored, 'COMPENSATE', 'STARTED')
    return true
  })
  if (!removable) return quarantineFile(db, lease, file)
  try {
    await store.remove(file.objectKey)
    if (!store.head || (await store.head(file.objectKey)))
      throw new Error('Compensation deletion not confirmed')
    await resourceTransaction(db, lease.ownerId, async (tx) => {
      await tx.storedFile.updateMany({
        where: { id: file.id, objectKey: file.objectKey, status: 'DELETING' },
        data: { status: 'DELETED' },
      })
      await releaseBound(tx, lease)
      await audit(tx, file, 'COMPENSATE', 'DELETED')
    })
  } catch {
    await quarantineFile(db, lease, file)
  }
}
export async function putAndPublish<T>(
  db: PrismaClient,
  store: PrivateObjectStore,
  lease: ResourceLease,
  file: StoredFile,
  bytes: Buffer,
  finish: (tx: ResourceTransaction, ready: StoredFile) => Promise<T>,
) {
  if (store.bucket !== file.bucket || bytes.length !== file.sizeBytes)
    throw new Error('Object does not match reserved file metadata')
  await resourceTransaction(db, lease.ownerId, async (tx) => {
    await requireLease(tx, lease)
  })
  let putConfirmed = false
  try {
    await store.put(file.objectKey, bytes, file.mimeType)
    putConfirmed = true
    return await publishFile(db, lease, file, finish)
  } catch (error) {
    // 补偿不可用不得掩盖原始错误；数据库仍持有文件/许可供后续核对。
    await (
      putConfirmed ? compensateFile(db, store, lease, file) : quarantineFile(db, lease, file)
    ).catch(() => {})
    throw error
  }
}
