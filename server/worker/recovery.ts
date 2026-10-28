import type { PrismaClient } from '../generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import type { JobKind } from '../../shared/types/tasks'
import { queues } from '../queue/client'
import { reconcileTask } from '../database/task-reconciliation'
export function recoveryPolicy(env: NodeJS.ProcessEnv = process.env) {
  const enabled = env.FORMULA_WORKER_RECOVERY_ENABLED ?? 'true'
  if (!['true', 'false'].includes(enabled)) throw new Error('Invalid worker recovery enabled flag')
  const read = (key: string, fallback: number) => {
    const value = Number(env[key] ?? fallback)
    if (!Number.isSafeInteger(value) || value <= 0 || value > 3600)
      throw new Error('Invalid worker recovery configuration')
    return value
  }
  return {
    enabled: enabled === 'true',
    intervalMs: read('FORMULA_WORKER_RECOVERY_INTERVAL_SECONDS', 15) * 1000,
    batchSize: read('FORMULA_WORKER_RECOVERY_BATCH_SIZE', 100),
  }
}
export interface RecoveryOptions {
  enabled: boolean
  intervalMs: number
  batchSize: number
  signal?: AbortSignal
}
/** 有界keyset批次跨周期继续推进，活动长任务不会让后面的异常任务永久饥饿。 */
export async function startTaskRecovery(
  db: PrismaClient,
  boss: PgBoss,
  options: RecoveryOptions = recoveryPolicy(),
) {
  if (!options.enabled) return { stop: async () => {} }
  if (
    !Number.isFinite(options.intervalMs) ||
    options.intervalMs <= 0 ||
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 3600
  )
    throw new Error('Invalid recovery options')
  const cursors: Partial<Record<JobKind, string>> = {}
  let stopped = false,
    timer: NodeJS.Timeout | undefined,
    pending: Promise<void> | undefined
  const isStopped = () => stopped || options.signal?.aborted
  async function sweep() {
    let changed = 0,
      unresolved = 0
    for (const kind of ['recognition', 'chat', 'export'] as const) {
      if (isStopped()) break
      // pg-boss决定到期后重试/最终失败；业务恢复不自行估计任务寿命。
      await boss.supervise(queues[kind])
      if (isStopped()) break
      const where = {
        status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] },
        ...(cursors[kind] ? { id: { gt: cursors[kind] } } : {}),
      }
      const query = {
        where,
        select: { id: true, ownerId: true },
        orderBy: { id: 'asc' as const },
        take: options.batchSize,
      }
      const tasks =
        kind === 'recognition'
          ? await db.recognitionTask.findMany(query)
          : kind === 'chat'
            ? await db.chatTurn.findMany(query)
            : await db.exportTask.findMany(query)
      if (!tasks.length) {
        delete cursors[kind]
        continue
      }
      for (const task of tasks) {
        if (isStopped()) break
        const outcome = await reconcileTask(db, boss, kind, task.ownerId, task.id)
        if (outcome === 'changed') changed++
        if (outcome === 'unresolved') unresolved++
        cursors[kind] = task.id
      }
      if (tasks.length < options.batchSize) delete cursors[kind]
    }
    if (changed || unresolved)
      console.info(`任务核对：修复${changed}项，待人工核对${unresolved}项。`)
  }
  function schedule() {
    if (isStopped()) return
    timer = setTimeout(() => {
      pending = sweep()
        .catch(() => console.warn('任务后台核对失败，保留状态并等待下次核对。'))
        .finally(schedule)
    }, options.intervalMs)
    timer.unref()
  }
  // 启动核对失败则由Worker启动流程停机，不开始消费；周期错误可安全重试。
  await sweep()
  schedule()
  return {
    async stop() {
      stopped = true
      if (timer) clearTimeout(timer)
      await pending
    },
  }
}
