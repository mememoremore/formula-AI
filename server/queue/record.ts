import type { Prisma } from '../generated/prisma/client'
import { queues } from './client'
export interface QueueRecord {
  id: string
  state: string
  retryCount: number
  data: unknown
  expired: boolean
  startedOn: Date | null
}
/** 固定pg-boss12.38/PostgreSQL适配点；父表FOR UPDATE锁定真实分区行，读与业务变更同事务。 */
export async function lockQueueRecord(tx: Prisma.TransactionClient, name: string, id: string) {
  if (!Object.values(queues).some((queue) => queue === name)) throw new Error('Unknown task queue')
  const [record] = await tx.$queryRaw<QueueRecord[]>`
    SELECT id, state::text AS state, retry_count AS "retryCount", data, started_on AS "startedOn",
      (COALESCE(started_on + expire_seconds * interval '1s' < pgboss.job_now(), true)
       OR (heartbeat_seconds IS NOT NULL AND COALESCE(heartbeat_on + heartbeat_seconds * interval '1s' < pgboss.job_now(), true))) AS expired
    FROM pgboss.job WHERE name = ${name} AND id = ${id}::uuid FOR UPDATE`
  return record
}
export function queueOwnsTask(record: QueueRecord, ownerId: string, taskId: string) {
  const data = record.data
  return (
    !!data &&
    typeof data === 'object' &&
    'ownerId' in data &&
    'taskId' in data &&
    data.ownerId === ownerId &&
    data.taskId === taskId
  )
}
