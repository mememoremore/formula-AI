import { randomUUID } from 'node:crypto'
import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { diagnostic, safeDiagnosticCode, withDiagnostics } from '../diagnostics/operations'
import { reconcileExpiredLeases } from './cleanup'

export interface LeaseRecoveryOptions {
  enabled: boolean
  intervalMs: number
  batchSize: number
  signal?: AbortSignal
}
export function leaseRecoveryPolicy(env: NodeJS.ProcessEnv = process.env): LeaseRecoveryOptions {
  const enabled = env.FORMULA_RESOURCE_RECONCILIATION_ENABLED ?? 'true'
  if (!['true', 'false'].includes(enabled))
    throw new Error('Invalid lease reconciliation enabled flag')
  const read = (key: string, fallback: number, max: number) => {
    const value = Number(env['FORMULA_RESOURCE_RECONCILIATION_' + key] ?? fallback)
    if (!Number.isSafeInteger(value) || value < 1 || value > max)
      throw new Error('Invalid lease reconciliation configuration')
    return value
  }
  return {
    enabled: enabled === 'true',
    intervalMs: read('INTERVAL_SECONDS', 60, 3600) * 1000,
    batchSize: read('BATCH_SIZE', 100, 500),
  }
}
/** 独立于业务队列恢复：只撤销过期token并标记人工核对，不访问对象或释放占用。 */
export async function startLeaseRecovery(
  db: PrismaClient,
  store: Pick<PrivateObjectStore, 'check'>,
  options = leaseRecoveryPolicy(),
) {
  if (!options.enabled) return { stop: async () => {} }
  if (
    !Number.isFinite(options.intervalMs) ||
    options.intervalMs < 1 ||
    options.intervalMs > 3600000 ||
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 500
  )
    throw new Error('Invalid lease recovery options')
  const stopping = new AbortController()
  const signal = options.signal
    ? AbortSignal.any([options.signal, stopping.signal])
    : stopping.signal
  let timer: NodeJS.Timeout | undefined, pending: Promise<void> | undefined
  const isStopped = () => signal.aborted
  async function sweep() {
    if (isStopped()) return
    await withDiagnostics(
      { operation: 'lease-recovery', operationId: randomUUID() },
      async () => {
        let stage: 'storage-check' | 'reconcile' = 'storage-check'
        try {
          // 只读连通检查；不将对象不存在、TTL或网络不确定当成可释放证据。
          await store.check()
          if (isStopped()) return
          stage = 'reconcile'
          const result = await reconcileExpiredLeases(db, new Date(), {
            batchSize: options.batchSize,
            signal,
          })
          if (result.reviewed)
            diagnostic('lease.recovery', { outcome: 'review-required', reviewed: result.reviewed })
        } catch (error) {
          diagnostic('lease.recovery', {
            stage,
            outcome: 'unconfirmed',
            code:
              stage === 'storage-check'
                ? 'STORAGE_UNAVAILABLE'
                : safeDiagnosticCode(error) === 'UNCLASSIFIED'
                  ? 'LEASE_RECONCILIATION_FAILED'
                  : safeDiagnosticCode(error),
          })
          throw error
        }
      },
      { inheritContext: false },
    )
  }
  function schedule() {
    if (isStopped()) return
    timer = setTimeout(() => {
      pending = sweep()
        .catch(() => {
          /* 已记录安全码，保留状态；下一周期重试。 */
        })
        .finally(schedule)
    }, options.intervalMs)
    timer.unref()
  }
  await sweep()
  schedule()
  return {
    async stop() {
      stopping.abort()
      clearTimeout(timer)
      await pending
    },
  }
}
