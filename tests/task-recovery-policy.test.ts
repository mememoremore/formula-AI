import test from 'node:test'
import assert from 'node:assert/strict'
import { recoveryPolicy, startTaskRecovery } from '../server/worker/recovery'
import type { PrismaClient } from '../server/generated/prisma/client'
import type { PgBoss } from 'pg-boss'
test('R13后台默认开启，周期/批次有界，错误配置拒绝执行', () => {
  assert.deepEqual(recoveryPolicy({}), { enabled: true, intervalMs: 15000, batchSize: 100 })
  assert.equal(recoveryPolicy({ FORMULA_WORKER_RECOVERY_ENABLED: 'false' }).enabled, false)
  for (const value of ['0', '-1', 'NaN', '1.5', '3601'])
    assert.throws(() => recoveryPolicy({ FORMULA_WORKER_RECOVERY_BATCH_SIZE: value }))
  assert.throws(() => recoveryPolicy({ FORMULA_WORKER_RECOVERY_ENABLED: 'yes' }))
})
test('禁用后台核对不连接数据库或队列', async () => {
  const forbidden = new Proxy(
    {},
    {
      get() {
        throw new Error('Unexpected dependency access')
      },
    },
  )
  const control = await startTaskRecovery(forbidden as PrismaClient, forbidden as PgBoss, {
    enabled: false,
    intervalMs: 1,
    batchSize: 1,
  })
  await control.stop()
})
test('启动核对遇到队列不可用时拒绝启动而不读取业务记录', async () => {
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error('Unexpected database access')
      },
    },
  ) as PrismaClient
  const queue = {
    supervise: async () => {
      throw new Error('Injected queue unavailable')
    },
  } as unknown as PgBoss
  await assert.rejects(
    startTaskRecovery(db, queue, { enabled: true, intervalMs: 10, batchSize: 1 }),
    /queue unavailable/,
  )
})
test('启动核对期间收到停止信号后不继续扫描或留下周期任务', async () => {
  const signal = new AbortController()
  let proceed!: () => void
  const gate = new Promise<void>((resolve) => (proceed = resolve))
  const db = new Proxy(
    {},
    {
      get() {
        throw new Error('Unexpected database access after shutdown')
      },
    },
  ) as PrismaClient
  const queue = { supervise: async () => gate } as unknown as PgBoss
  const starting = startTaskRecovery(db, queue, {
    enabled: true,
    intervalMs: 10,
    batchSize: 1,
    signal: signal.signal,
  })
  signal.abort()
  proceed()
  const control = await starting
  await control.stop()
})
