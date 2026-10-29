import type { PrismaClient, StoredFile } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { resourceTransaction } from './leases'
import { audit, fileReferenced, objectFingerprint } from './files'
import { randomUUID } from 'node:crypto'
import { resourcePolicy } from './policy'
import { diagnostic } from '../diagnostics/operations'
export type InventoryFinding = {
  fileId?: string
  leaseId?: string
  fingerprint: string
  state: string
}
/** 默认只读。未知 key 仅报告指纹，不凭年龄删除；没有 HEAD/LIST 能力则拒绝扫描。 */
export async function scanStorage(
  db: PrismaClient,
  store: PrivateObjectStore,
): Promise<InventoryFinding[]> {
  if (!store.head || !store.list) throw new Error('Storage inventory capability unavailable')
  await store.check()
  const findings: InventoryFinding[] = []
  let after: string | undefined
  while (true) {
    const files = await db.storedFile.findMany({
      where: { bucket: store.bucket },
      orderBy: { id: 'asc' },
      take: 200,
      ...(after ? { cursor: { id: after }, skip: 1 } : {}),
    })
    if (!files.length) break
    for (const file of files) {
      const object = await store.head(file.objectKey)
      const state = await resourceTransaction(db, file.ownerId, async (tx) => {
        const latest = await tx.storedFile.findUniqueOrThrow({ where: { id: file.id } })
        if (latest.updatedAt.getTime() !== file.updatedAt.getTime()) return 'CHANGED_RESCAN'
        if (!object) return file.status === 'DELETED' ? 'DELETED_CONFIRMED' : 'MISSING_OBJECT'
        if (object.size !== file.sizeBytes) return 'SIZE_MISMATCH_REVIEW'
        if (await fileReferenced(tx, file)) return 'REFERENCED_KEEP'
        if (
          file.status === 'PENDING' &&
          Date.now() - file.updatedAt.getTime() >= resourcePolicy().leaseSeconds * 1000
        )
          return 'STALE_PENDING_REVIEW_KEEP'
        if (
          await tx.resourceLease.count({ where: { fileId: file.id, status: { not: 'RELEASED' } } })
        )
          return 'LEASE_REVIEW_KEEP'
        return cleanupAgeEligible(file) ? 'UNREFERENCED_CANDIDATE' : 'GRACE_KEEP'
      })
      findings.push({
        fileId: file.id,
        fingerprint: objectFingerprint(file.bucket, file.objectKey),
        state,
      })
    }
    after = files.at(-1)!.id
  }
  let cursor: string | undefined
  const seen = new Set<string>()
  do {
    const page = await store.list(cursor)
    for (const object of page.objects) {
      const file = await db.storedFile.findUnique({
        where: { bucket_objectKey: { bucket: store.bucket, objectKey: object.key } },
      })
      if (!file) {
        const referenced = await db.user.count({ where: { image: object.key } })
        findings.push({
          fingerprint: objectFingerprint(store.bucket, object.key),
          state: referenced ? 'LEGACY_AVATAR_KEEP' : 'UNKNOWN_OBJECT_REVIEW_KEEP',
        })
      }
    }
    cursor = page.cursor
    if (cursor && seen.has(cursor)) throw new Error('Storage inventory pagination loop')
    if (cursor) seen.add(cursor)
  } while (cursor)
  const unbound = await db.resourceLease.findMany({
    where: { fileId: null, status: { not: 'RELEASED' } },
  })
  for (const lease of unbound)
    findings.push({
      leaseId: lease.id,
      fingerprint: objectFingerprint('lease', lease.id),
      state:
        lease.expiresAt <= new Date() || lease.status === 'REVIEW_REQUIRED'
          ? 'UNBOUND_LEASE_REVIEW_KEEP'
          : 'UNBOUND_LEASE_KEEP',
    })
  return findings
}
export function cleanupAgeEligible(
  file: Pick<StoredFile, 'kind' | 'status' | 'updatedAt'>,
  now = Date.now(),
) {
  if (file.status === 'PENDING') return false
  const policy = resourcePolicy()
  const grace =
    (file.kind === 'AVATAR' ? policy.avatarGraceSeconds : policy.fileGraceSeconds) * 1000
  return now - file.updatedAt.getTime() >= grace
}
/** 撤销过期执行 token，但不释放字节或槽位；TTL 本身不能证明对象不存在。 */
export async function reconcileExpiredLeases(
  db: PrismaClient,
  now = new Date(),
  options: { batchSize?: number; signal?: AbortSignal } = {},
) {
  const batchSize = options.batchSize ?? 500
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 500)
    throw new Error('Invalid lease reconciliation batch')
  if (options.signal?.aborted) return { reviewed: 0, releasedBytes: 0 }
  const leases = await db.resourceLease.findMany({
    where: { status: 'ACTIVE', expiresAt: { lte: now } },
    select: { id: true, ownerId: true },
    take: batchSize,
    orderBy: { id: 'asc' },
  })
  let reviewed = 0
  for (const lease of leases) {
    if (options.signal?.aborted) break
    await resourceTransaction(db, lease.ownerId, async (tx) => {
      const result = await tx.resourceLease.updateMany({
        where: { id: lease.id, status: 'ACTIVE', expiresAt: { lte: now } },
        data: { status: 'REVIEW_REQUIRED', executionToken: randomUUID() },
      })
      reviewed += result.count
      if (result.count) {
        const record = await tx.storageCleanupAudit.create({
          data: {
            operationId: lease.id,
            objectFingerprint: objectFingerprint('lease', lease.id),
            action: 'LEASE_REVOKE',
            outcome: 'REVIEW_REQUIRED',
          },
        })
        diagnostic('storage.audit', {
          ownerId: lease.ownerId,
          leaseId: lease.id,
          auditId: record.id,
          operationId: lease.id,
          auditAction: 'LEASE_REVOKE',
          auditOutcome: 'REVIEW_REQUIRED',
          stage: 'audit',
          outcome: 'observed',
        })
      }
    })
    // 上面的持久审计仍与token撤销同事务；这里才表示该项事务已返回。
    diagnostic('resource.lease', { ownerId: lease.ownerId, leaseId: lease.id, outcome: 'returned' })
  }
  return { reviewed, releasedBytes: 0 }
}
/** apply 只能由已完成 R1 身份核验的入口调用；文件删除没有后台调度器或 GET 隐式清理。 */
export async function cleanupFile(
  db: PrismaClient,
  store: PrivateObjectStore,
  fileId: string,
  options: { apply?: boolean; verifiedTestBucket?: string } = {},
) {
  if (
    options.apply &&
    (options.verifiedTestBucket !== store.bucket ||
      !/^formula-test-[a-f0-9]{12}$/.test(store.bucket))
  )
    throw new Error('Cleanup apply requires verified isolated test storage')
  if (!store.head) throw new Error('Object HEAD required before cleanup')
  const file = await db.storedFile.findUnique({ where: { id: fileId } })
  if (!file || file.bucket !== store.bucket) return { outcome: 'NOT_FOUND_KEEP' }
  const object = await store.head(file.objectKey)
  const operationId = randomUUID()
  const candidate = await resourceTransaction(db, file.ownerId, async (tx) => {
    const current = await tx.storedFile.findUniqueOrThrow({ where: { id: file.id } })
    await tx.$queryRaw`SELECT id FROM stored_files WHERE id = ${file.id}::uuid FOR UPDATE`
    if (current.objectKey !== file.objectKey) return 'CHANGED_RESCAN'
    if (current.status === 'DELETED' && !object) return 'ALREADY_DELETED'
    if (object && object.size !== current.sizeBytes) return 'SIZE_MISMATCH_REVIEW_KEEP'
    if (await fileReferenced(tx, current)) return 'REFERENCED_KEEP'
    // DELETING 是 PUT 已结束后持久登记的删除意图，可重试删除；PENDING 的未知写入永不凭 TTL 释放。
    const leases = await tx.resourceLease.findMany({
      where: { fileId: file.id, status: { not: 'RELEASED' } },
    })
    if (
      leases.some((lease) => lease.status === 'ACTIVE') ||
      (leases.length && current.status !== 'DELETING')
    )
      return 'LEASE_REVIEW_KEEP'
    if (!cleanupAgeEligible(current)) return 'GRACE_KEEP'
    if (!options.apply) return 'DRY_RUN_CANDIDATE'
    await tx.storedFile.update({ where: { id: file.id }, data: { status: 'DELETING' } })
    await audit(tx, current, 'DELETE', 'STARTED', operationId)
    return 'DELETE_CLAIMED'
  })
  if (candidate !== 'DELETE_CLAIMED') return { outcome: candidate }
  try {
    await store.remove(file.objectKey)
    if (await store.head(file.objectKey)) throw new Error('Object remains after deletion')
    await resourceTransaction(db, file.ownerId, async (tx) => {
      const current = await tx.storedFile.findUniqueOrThrow({ where: { id: file.id } })
      if (
        current.status !== 'DELETING' ||
        current.objectKey !== file.objectKey ||
        (await fileReferenced(tx, current))
      )
        throw new Error('Cleanup state changed')
      await tx.storedFile.update({ where: { id: file.id }, data: { status: 'DELETED' } })
      await tx.resourceLease.updateMany({
        where: { fileId: file.id, status: 'REVIEW_REQUIRED' },
        data: { status: 'RELEASED', reservedBytes: 0, finishedAt: new Date() },
      })
      await audit(tx, current, 'DELETE', 'DELETED', operationId)
    })
    return { outcome: 'DELETED' }
  } catch {
    // 删除响应不确定、HEAD 不可用、数据库落账失败均保留 DELETING 的计量和审计。
    await resourceTransaction(db, file.ownerId, (tx) =>
      audit(tx, file, 'DELETE', 'REVIEW_REQUIRED', operationId),
    ).catch(() => {})
    return { outcome: 'REVIEW_REQUIRED' }
  }
}
