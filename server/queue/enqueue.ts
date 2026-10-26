import { fromPrisma, type PgBoss } from 'pg-boss'
import type { Prisma } from '../generated/prisma/client'
import type { JobKind } from '../../shared/types/tasks'
import { queues, type JobPayload } from './client'

export async function enqueueTask(
  boss: PgBoss,
  tx: Prisma.TransactionClient,
  kind: JobKind,
  payload: JobPayload,
) {
  const id = await boss.send(queues[kind], payload, { db: fromPrisma(tx) })
  if (!id) throw new Error('队列未接受任务。')
  return id
}
