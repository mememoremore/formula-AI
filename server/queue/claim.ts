import { fromPrisma, type JobWithMetadata, type PgBoss } from 'pg-boss'
import type { Prisma } from '../generated/prisma/client'
import type { JobPayload } from './client'

export type RunningJob = JobWithMetadata<JobPayload>
export class LostJobClaim extends Error {
  constructor() {
    super('任务执行权已失效。')
  }
}

/** touch按当前retryCount刷新执行权并锁定队列记录，供流式中间写入共同提交。 */
export async function touchClaim(boss: PgBoss, tx: Prisma.TransactionClient, job: RunningJob) {
  const result = await boss.touch(
    job.name,
    { id: job.id, retryCount: job.retryCount },
    { db: fromPrisma(tx) },
  )
  if (!('affected' in result) || result.affected !== 1) throw new LostJobClaim()
}

/** 完成队列和保存业务结果共用事务，过期或已被其他 Worker 接管时整笔回滚。 */
export async function completeClaim(boss: PgBoss, tx: Prisma.TransactionClient, job: RunningJob) {
  const result = await boss.complete(job.name, { id: job.id, retryCount: job.retryCount }, null, {
    db: fromPrisma(tx),
  })
  // 12.38.0 的运行时返回 affected；其 CommandResponse 类型暂未声明该字段。
  if (!('affected' in result) || result.affected !== 1) throw new LostJobClaim()
}
