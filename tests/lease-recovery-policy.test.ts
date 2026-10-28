import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout as delay } from 'node:timers/promises'
import { leaseRecoveryPolicy, startLeaseRecovery } from '../server/resources/lease-recovery'
import type { PrismaClient } from '../server/generated/prisma/client'

const forbidden = new Proxy(
  {},
  {
    get() {
      throw new Error('Unexpected dependency access')
    },
  },
) as PrismaClient
test('独立租约配置有界，禁用不连接数据库或存储', async () => {
  assert.deepEqual(leaseRecoveryPolicy({}), { enabled: true, intervalMs: 60000, batchSize: 100 })
  for (const value of ['0', '-1', 'NaN', '1.5', '501'])
    assert.throws(() => leaseRecoveryPolicy({ FORMULA_RESOURCE_RECONCILIATION_BATCH_SIZE: value }))
  assert.throws(() => leaseRecoveryPolicy({ FORMULA_RESOURCE_RECONCILIATION_ENABLED: 'yes' }))
  await (
    await startLeaseRecovery(
      forbidden,
      {
        check: async () => {
          throw new Error('Unexpected store')
        },
      },
      { enabled: false, intervalMs: 1, batchSize: 1 },
    )
  ).stop()
})
test('启动时S3或数据库失败则拒绝，不触发其他写入', async () => {
  await assert.rejects(
    startLeaseRecovery(
      forbidden,
      {
        check: async () => {
          throw new Error('Injected S3 unknown')
        },
      },
      { enabled: true, intervalMs: 5, batchSize: 1 },
    ),
    /S3 unknown/,
  )
  const db = {
    resourceLease: {
      findMany: async () => {
        throw new Error('Injected database unavailable')
      },
    },
  } as unknown as PrismaClient
  await assert.rejects(
    startLeaseRecovery(
      db,
      { check: async () => {} },
      { enabled: true, intervalMs: 5, batchSize: 1 },
    ),
    /database unavailable/,
  )
})
test('周期存储失败保留并重试，成功后停止不再调度', async () => {
  let checks = 0,
    reads = 0,
    signal!: () => void
  const done = new Promise<void>((r) => (signal = r))
  const db = {
    resourceLease: {
      findMany: async () => {
        reads++
        if (reads === 2) signal()
        return []
      },
    },
  } as unknown as PrismaClient
  const control = await startLeaseRecovery(
    db,
    {
      check: async () => {
        checks++
        if (checks === 2) throw new Error('Injected unknown')
      },
    },
    { enabled: true, intervalMs: 5, batchSize: 1 },
  )
  await Promise.race([
    done,
    delay(1000).then(() => {
      throw new Error('Retry missing')
    }),
  ])
  await control.stop()
  assert.equal(reads, 2)
  const stopped = checks
  await delay(20)
  assert.equal(checks, stopped)
})
test('启动核对中止不继续读库，周期stop等待在途检查后停止', async () => {
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r)),
    abort = new AbortController()
  const pending = startLeaseRecovery(
    forbidden,
    { check: async () => gate },
    { enabled: true, intervalMs: 5, batchSize: 1, signal: abort.signal },
  )
  abort.abort()
  release()
  await (await pending).stop()
  let checking!: () => void,
    finish!: () => void,
    calls = 0,
    reads = 0
  const began = new Promise<void>((r) => (checking = r)),
    blocked = new Promise<void>((r) => (finish = r))
  const db = {
    resourceLease: {
      findMany: async () => {
        reads++
        return []
      },
    },
  } as unknown as PrismaClient
  const control = await startLeaseRecovery(
    db,
    {
      check: async () => {
        if (++calls === 2) {
          checking()
          await blocked
        }
      },
    },
    { enabled: true, intervalMs: 5, batchSize: 1 },
  )
  await Promise.race([
    began,
    delay(1000).then(() => {
      throw new Error('Periodic check missing')
    }),
  ])
  let stopped = false
  const ending = control.stop().then(() => {
    stopped = true
  })
  await Promise.resolve()
  assert.equal(stopped, false)
  finish()
  await ending
  assert.equal(reads, 1)
})
