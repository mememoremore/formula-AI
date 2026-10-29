import { diagnostic } from '../server/diagnostics/operations'
import { leaseRecoveryPolicy, startLeaseRecovery } from '../server/resources/lease-recovery'
import 'dotenv/config'
import { createDatabaseClient } from '../server/database/client'
import { createQueueClient } from '../server/queue/client'
import { createObjectStore } from '../server/storage/object-store'
import { registerWorkers } from '../server/worker/start'
import { recoveryPolicy, startTaskRecovery } from '../server/worker/recovery'
const recoveryOptions = recoveryPolicy()
const leaseOptions = leaseRecoveryPolicy()
const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
const boss = createQueueClient(process.env.NUXT_DATABASE_URL ?? '', { worker: true })
const store = createObjectStore({
  endpoint: process.env.NUXT_STORAGE_ENDPOINT ?? '',
  region: process.env.NUXT_STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.NUXT_STORAGE_BUCKET ?? '',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
const shutdownSignal = new AbortController()
let stopping = false,
  startup: Promise<void> | undefined,
  shutdown: Promise<void> | undefined
let recovery: Awaited<ReturnType<typeof startTaskRecovery>> | undefined
let leaseRecovery: Awaited<ReturnType<typeof startLeaseRecovery>> | undefined
function stop() {
  if (shutdown) return shutdown
  stopping = true
  shutdownSignal.abort()
  shutdown = (async () => {
    // 启动中的核对观察signal后退出；不在异步初始化尚未结束时断开数据库。
    await startup?.catch(() => {})
    await Promise.all([recovery?.stop(), leaseRecovery?.stop()])
    try {
      await boss.stop({ graceful: true, timeout: 25000 })
    } finally {
      await db.$disconnect()
    }
  })()
  return shutdown
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void stop()
      .then(() => process.exit(0))
      .catch(() => {
        diagnostic('worker.lifecycle', { outcome: 'unconfirmed', code: 'WORKER_STOP_FAILED' })
        process.exitCode = 1
      })
  })
async function start() {
  await db.$connect()
  if (stopping) return
  await store.check()
  if (stopping) return
  await boss.start()
  if (stopping) return
  recovery = await startTaskRecovery(db, boss, {
    ...recoveryOptions,
    signal: shutdownSignal.signal,
  })
  if (stopping) return
  leaseRecovery = await startLeaseRecovery(db, store, {
    ...leaseOptions,
    signal: shutdownSignal.signal,
  })
  if (stopping) return
  await registerWorkers(db, boss, store)
  if (!stopping)
    console.log(
      `Worker 已启动：识别（${process.env.NUXT_RECOGNITION_PROVIDER === 'python' ? 'Python' : '模拟'}）、对话（${process.env.NUXT_AI_PROVIDER === 'deepseek' ? 'DeepSeek' : '模拟'}）与 Word 导出；后台任务核对${recoveryOptions.enabled ? '开启' : '关闭'}；独立租约核对${leaseOptions.enabled ? '开启' : '关闭'}。`,
    )
}
startup = start()
try {
  await startup
} catch {
  diagnostic('worker.lifecycle', { outcome: 'unconfirmed', code: 'WORKER_START_FAILED' })
  await stop()
  process.exitCode = 1
}
