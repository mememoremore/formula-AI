import { diagnostic } from '../diagnostics/operations'
import { randomUUID } from 'node:crypto'
import type {
  PrismaClient,
  Prisma,
  ResourceLease,
  ResourcePurpose,
} from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { resourcePolicy, ResourceLimitError, type ResourcePolicy } from './policy'
export type ResourceTransaction = Prisma.TransactionClient
/** 所有资源写入固定全局→账号→文件顺序；不持锁调用 S3、Sharp 或模型。 */
export async function lockResources(tx: ResourceTransaction, ownerId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(721012::bigint)::text`
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${ownerId}, 721012))::text`
}
export async function resourceTransaction<T>(
  db: PrismaClient,
  ownerId: string,
  action: (tx: ResourceTransaction) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(
        async (tx) => {
          await lockResources(tx, ownerId)
          return action(tx)
        },
        { timeout: 10000 },
      )
    } catch (error) {
      // 仅重试已确定回滚的数据库冲突；不重试连接结果不确定或任何外部 I/O。
      if (attempt >= 2 || !(error instanceof Error) || !('code' in error) || error.code !== 'P2034')
        throw error
    }
  }
}
export async function assertCapacity(
  tx: ResourceTransaction,
  ownerId: string,
  additional: bigint,
  policy: ResourcePolicy,
) {
  if (additional <= BigInt(0)) return
  const totals = await tx.$queryRaw<{ owner: bigint; total: bigint }[]>`
    SELECT COALESCE(sum(bytes) FILTER (WHERE owner = ${ownerId}::uuid), 0)::bigint AS owner,
           COALESCE(sum(bytes), 0)::bigint AS total FROM (
      SELECT "ownerId" AS owner, "sizeBytes"::bigint AS bytes FROM stored_files WHERE status <> 'DELETED'
      UNION ALL SELECT "ownerId", "reservedBytes" FROM resource_leases WHERE status <> 'RELEASED'
    ) usage`
  const current = totals[0]!
  if (
    current.owner + additional > BigInt(policy.ownerBytes) ||
    current.total + additional > BigInt(policy.globalBytes)
  )
    throw new ResourceLimitError('STORAGE_CAPACITY', 429, '存储容量不足，请稍后重试或联系管理员。')
}
export async function reserveResource(
  db: PrismaClient,
  input: {
    ownerId: string
    purpose: ResourcePurpose
    requestKey: string
    bytes: number
    countsTowardRate?: boolean
  },
  policy = resourcePolicy(),
) {
  if (
    !Number.isSafeInteger(input.bytes) ||
    input.bytes < 0 ||
    !input.requestKey ||
    input.requestKey.length > 100
  )
    throw new Error('Invalid resource reservation')
  const lease = await resourceTransaction(db, input.ownerId, async (tx) => {
    const duplicate = await tx.resourceLease.findFirst({
      where: {
        ownerId: input.ownerId,
        purpose: input.purpose,
        requestKey: input.requestKey,
        status: { not: 'RELEASED' },
      },
    })
    if (duplicate) throw new WorkspaceError(409, '该请求仍在处理中或等待核对，请勿重复提交。')
    if (input.purpose !== 'DOCX_WRITE') {
      const where = {
        status: { not: 'RELEASED' as const },
        purpose: { in: ['IMAGE_UPLOAD', 'AVATAR_UPLOAD'] as ResourcePurpose[] },
      }
      const total = await tx.resourceLease.count({ where })
      const owner = await tx.resourceLease.count({ where: { ...where, ownerId: input.ownerId } })
      if (total >= policy.globalUploads || owner >= policy.ownerUploads)
        throw new ResourceLimitError('UPLOAD_BUSY', 429, '图片处理繁忙，请稍后安全重试。')
      if (input.countsTowardRate !== false) {
        const recent = await tx.resourceLease.count({
          where: {
            ownerId: input.ownerId,
            countsTowardRate: true,
            purpose: where.purpose,
            createdAt: { gte: new Date(Date.now() - 60000) },
          },
        })
        if (recent >= policy.uploadsPerMinute)
          throw new ResourceLimitError('UPLOAD_RATE', 429, '上传过于频繁，请一分钟后重试。')
      }
    }
    await assertCapacity(tx, input.ownerId, BigInt(input.bytes), policy)
    return tx.resourceLease.create({
      data: {
        ownerId: input.ownerId,
        purpose: input.purpose,
        requestKey: input.requestKey,
        countsTowardRate: input.countsTowardRate,
        reservedBytes: BigInt(input.bytes),
        executionToken: randomUUID(),
        expiresAt: new Date(Date.now() + policy.leaseSeconds * 1000),
      },
    })
  })
  diagnostic('resource.lease', {
    ownerId: lease.ownerId,
    leaseId: lease.id,
    requestKey: input.requestKey,
    outcome: 'committed',
  })
  return lease
}
export async function requireLease(
  tx: ResourceTransaction,
  lease: Pick<ResourceLease, 'id' | 'ownerId' | 'executionToken'>,
) {
  const current = await tx.resourceLease.findFirst({
    where: {
      id: lease.id,
      ownerId: lease.ownerId,
      executionToken: lease.executionToken,
      status: 'ACTIVE',
      expiresAt: { gt: new Date() },
    },
  })
  if (!current) throw new WorkspaceError(409, '操作许可已过期或等待核对，请保留请求编号后重试。')
  return current
}
/** 仅用于确定尚未绑定对象的失败路径。绑定对象必须先确认删除或正常发布。 */
export async function releaseUnbound(db: PrismaClient, lease: ResourceLease) {
  await resourceTransaction(db, lease.ownerId, async (tx) => {
    await tx.resourceLease.updateMany({
      where: { id: lease.id, executionToken: lease.executionToken, status: 'ACTIVE', fileId: null },
      data: { status: 'RELEASED', reservedBytes: 0, finishedAt: new Date() },
    })
  })
}
export async function releaseBound(tx: ResourceTransaction, lease: ResourceLease) {
  await tx.resourceLease.update({
    where: { id: lease.id },
    data: { status: 'RELEASED', reservedBytes: 0, finishedAt: new Date() },
  })
}
