import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { cleanupFile } from './cleanup'
import { resourcePolicy } from './policy'
import { diagnostic, safeDiagnosticCode } from '../diagnostics/operations'
export function orphanPolicy(env: NodeJS.ProcessEnv = process.env) {
  const mode = env.FORMULA_RESOURCE_ORPHAN_MODE ?? 'report'
  if (!['off', 'report', 'apply'].includes(mode)) throw new Error('Invalid orphan cleanup mode')
  return { mode: mode as 'off' | 'report' | 'apply', intervalMs: 60000, batchSize: 50 }
}
/** 只扫描本桶已登记的已完成图片；不枚举、更不删除未知对象、模型或备份。 */
export async function sweepOrphanImages(
  db: PrismaClient,
  store: PrivateObjectStore,
  options: { apply?: boolean; after?: string; batchSize?: number; signal?: AbortSignal } = {},
) {
  const size = options.batchSize ?? 50
  if (!Number.isSafeInteger(size) || size < 1 || size > 100)
    throw new Error('Invalid image cleanup batch')
  const result = {
    reviewed: 0,
    deleted: 0,
    candidates: 0,
    kept: 0,
    after: undefined as string | undefined,
  }
  if (options.signal?.aborted) return result
  await store.check()
  const cutoff = new Date(Date.now() - Math.max(86400, resourcePolicy().fileGraceSeconds) * 1000)
  const files = await db.storedFile.findMany({
    where: {
      bucket: store.bucket,
      kind: 'IMAGE',
      OR: [{ status: 'READY', updatedAt: { lte: cutoff } }, { status: 'DELETING' }],
      ...(options.after ? { id: { gt: options.after } } : {}),
    },
    select: { id: true },
    orderBy: { id: 'asc' },
    take: size,
  })
  for (const file of files) {
    if (options.signal?.aborted) break
    // 每个对象重新检查引用和写入许可，不能把批次快照当作删除依据。
    let outcome = 'REVIEW_REQUIRED'
    try {
      outcome = (
        await cleanupFile(db, store, file.id, {
          apply: options.apply,
          managedImageBucket: store.bucket,
        })
      ).outcome
    } catch (error) {
      diagnostic('storage.audit', {
        operation: 'orphan-cleanup',
        fileId: file.id,
        stage: 'reconcile',
        outcome: 'unconfirmed',
        code: safeDiagnosticCode(error),
      })
    }
    result.reviewed++
    if (outcome === 'DELETED') result.deleted++
    else if (outcome === 'DRY_RUN_CANDIDATE') result.candidates++
    else result.kept++
    result.after = file.id
  }
  if (files.length < size) result.after = undefined
  diagnostic('storage.audit', {
    operation: 'orphan-cleanup',
    stage: 'reconcile',
    outcome: 'recorded',
    reviewed: result.reviewed,
    candidates: result.candidates,
    deleted: result.deleted,
    kept: result.kept,
  })
  return result
}
export async function startOrphanCleanup(
  db: PrismaClient,
  store: PrivateObjectStore,
  options: ReturnType<typeof orphanPolicy> & { signal?: AbortSignal } = orphanPolicy(),
) {
  if (options.mode === 'off') return { stop: async () => {} }
  if (
    !['report', 'apply'].includes(options.mode) ||
    !Number.isSafeInteger(options.intervalMs) ||
    options.intervalMs < 1 ||
    options.intervalMs > 3600000 ||
    !Number.isSafeInteger(options.batchSize) ||
    options.batchSize < 1 ||
    options.batchSize > 100
  )
    throw new Error('Invalid cleanup options')
  const stopping = new AbortController()
  const signal = options.signal
    ? AbortSignal.any([options.signal, stopping.signal])
    : stopping.signal
  let timer: NodeJS.Timeout | undefined,
    pending: Promise<void> | undefined,
    after: string | undefined
  async function sweep() {
    if (signal.aborted) return
    try {
      const result = await sweepOrphanImages(db, store, {
        apply: options.mode === 'apply',
        after,
        batchSize: options.batchSize,
        signal,
      })
      after = result.after
    } catch (error) {
      diagnostic('storage.audit', {
        operation: 'orphan-cleanup',
        stage: 'reconcile',
        outcome: 'unconfirmed',
        code: safeDiagnosticCode(error),
      })
    }
  }
  function schedule() {
    if (signal.aborted) return
    timer = setTimeout(() => {
      pending = sweep().finally(schedule)
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
