import { testEnvironment } from './support/integration.ts'
import { createTestQueueClient } from './support/queue-client'
import test, { before, after, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawn, spawnSync } from 'node:child_process'
import { createDatabaseClient } from '../server/database/client'
import { createObjectStore } from '../server/storage/object-store'
import { reserveResource } from '../server/resources/leases'
import { prepareFile, publishFile, putAndPublish } from '../server/resources/files'
import { startLeaseRecovery } from '../server/resources/lease-recovery'
import { createAuthentication } from '../server/auth/config'
import { processChat } from '../server/worker/chat'
import { queues, type JobPayload } from '../server/queue/client'

const db = createDatabaseClient(testEnvironment.databaseUrl),
  db2 = createDatabaseClient(testEnvironment.databaseUrl)
const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' }),
  boss = createTestQueueClient()
const owners: string[] = [],
  controls: { stop(): Promise<void> }[] = []
const bytes = Buffer.from('R15 controlled object; no user content')
const opts = { enabled: true, intervalMs: 60000, batchSize: 100 }
before(async () => {
  await boss.start()
  await store.check()
})
afterEach(async () => {
  for (const c of controls.splice(0)) await c.stop()
  for (const ownerId of owners.splice(0)) {
    const jobs = await boss.findJobs(queues.chat, { data: { ownerId }, limit: 1000 })
    if (jobs.length)
      await boss.deleteJob(
        queues.chat,
        jobs.map((j) => j.id),
      )
    for (const file of await db.storedFile.findMany({ where: { ownerId } }))
      await store.remove(file.objectKey)
    await db.resourceLease.deleteMany({ where: { ownerId } })
    await db.user.delete({ where: { id: ownerId } })
  }
})
after(async () => {
  await Promise.all([db.$disconnect(), db2.$disconnect(), boss.stop()])
})
async function make(bound = false) {
  const owner = await db.user.create({
    data: { email: `r15-${randomUUID()}@formula.test`, displayName: 'R15隔离租约' },
  })
  owners.push(owner.id)
  const lease = await reserveResource(db, {
    ownerId: owner.id,
    purpose: 'DOCX_WRITE',
    requestKey: randomUUID(),
    bytes: bytes.length,
  })
  const file = bound
    ? await prepareFile(db, lease, {
        kind: 'DOCX',
        bucket: store.bucket,
        objectKey: `${owner.id}/r15/${randomUUID()}`,
        name: 'fixture.docx',
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        sizeBytes: bytes.length,
      })
    : undefined
  return { lease, file }
}
async function expire(id: string) {
  await db.resourceLease.update({ where: { id }, data: { expiresAt: new Date(0) } })
}
async function start(client = db) {
  const control = await startLeaseRecovery(client, store, opts)
  controls.push(control)
  return control
}

test('过期发现、重复与双实例核对只撤销一次，保留字节和槽位', async () => {
  const f = await make()
  await expire(f.lease.id)
  await Promise.all([start(), start(db2)])
  const current = await db.resourceLease.findUniqueOrThrow({ where: { id: f.lease.id } })
  assert.equal(current.status, 'REVIEW_REQUIRED')
  assert.equal(current.reservedBytes, BigInt(bytes.length))
  assert.notEqual(current.executionToken, f.lease.executionToken)
  await start()
  assert.equal(
    await db.storageCleanupAudit.count({
      where: { operationId: f.lease.id, action: 'LEASE_REVOKE' },
    }),
    1,
  )
  assert.equal(
    await db.resourceLease.count({ where: { id: f.lease.id, status: { not: 'RELEASED' } } }),
    1,
  )
})
test('被标记的上传许可仍占用处理槽位，不因TTL放行新的上传', async () => {
  const f = await make()
  const upload = await reserveResource(db, {
    ownerId: f.lease.ownerId,
    purpose: 'IMAGE_UPLOAD',
    requestKey: randomUUID(),
    bytes: 5,
  })
  await expire(upload.id)
  await start()
  await assert.rejects(
    reserveResource(db, {
      ownerId: f.lease.ownerId,
      purpose: 'IMAGE_UPLOAD',
      requestKey: randomUUID(),
      bytes: 0,
    }),
    (error) =>
      !!error && typeof error === 'object' && 'code' in error && error.code === 'UPLOAD_BUSY',
  )
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: upload.id } })).reservedBytes,
    5n,
  )
})
test('有效租约和READY对象不变；过期PENDING保留文件计量', async () => {
  const live = await make(true),
    stale = await make(true)
  await putAndPublish(db, store, live.lease, live.file!, bytes, async () => {})
  await store.put(stale.file!.objectKey, bytes, stale.file!.mimeType)
  await expire(stale.lease.id)
  await start()
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: live.file!.id } })).status,
    'READY',
  )
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: stale.file!.id } })).status,
    'PENDING',
  )
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: stale.lease.id } })).reservedBytes,
    0n,
  )
  assert.deepEqual(await store.get(live.file!.objectKey), bytes)
  assert.deepEqual(await store.get(stale.file!.objectKey), bytes)
  const future = await make()
  await start()
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: future.lease.id } })).executionToken,
    future.lease.executionToken,
  )
})
test('S3响应不确定时不改数据库；核对不调用对象HEAD/DELETE或释放容量', async () => {
  const f = await make(true)
  await expire(f.lease.id)
  await assert.rejects(
    startLeaseRecovery(
      db,
      {
        check: async () => {
          await store.check()
          throw new Error('Injected unknown storage response')
        },
      },
      opts,
    ),
  )
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: f.lease.id } })).status,
    'ACTIVE',
  )
  const safe = new Proxy(store, {
    get(target, key) {
      if (['put', 'get', 'remove', 'head', 'list'].includes(String(key)))
        throw new Error('Scheduler must not inspect/delete objects')
      const value = Reflect.get(target, key)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  controls.push(await startLeaseRecovery(db, safe, opts))
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: f.lease.id } })).status,
    'REVIEW_REQUIRED',
  )
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: f.file!.id } })).sizeBytes,
    bytes.length,
  )
})
test('数据库在逐条事务前不可用时保留许可与审计', async () => {
  const f = await make()
  await expire(f.lease.id)
  const unavailable = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return async () => {
          throw new Error('Injected DB unavailable')
        }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  await assert.rejects(startLeaseRecovery(unavailable, store, opts))
  assert.equal(
    (await db.resourceLease.findUniqueOrThrow({ where: { id: f.lease.id } })).executionToken,
    f.lease.executionToken,
  )
  assert.equal(await db.storageCleanupAudit.count({ where: { operationId: f.lease.id } }), 0)
})
test('旧执行者在撤销后完成真实PUT，不能发布或让占用归零', async () => {
  const f = await make(true)
  await expire(f.lease.id)
  await start()
  await store.put(f.file!.objectKey, bytes, f.file!.mimeType)
  await assert.rejects(
    publishFile(db, f.lease, f.file!, async () => {}),
    /许可/,
  )
  assert.deepEqual(await store.get(f.file!.objectKey), bytes)
  assert.equal(
    (await db.storedFile.findUniqueOrThrow({ where: { id: f.file!.id } })).status,
    'PENDING',
  )
  const row = await db.resourceLease.findUniqueOrThrow({ where: { id: f.lease.id } })
  assert.equal(row.status, 'REVIEW_REQUIRED')
  assert.equal(row.fileId, f.file!.id)
})
test('独立进程重启继续剩余批次，不依赖用户GET或队列消费', async () => {
  const rows = await Promise.all([make(), make(), make()])
  for (const row of rows) await expire(row.lease.id)
  const run = (batch: string) => {
    const result = spawnSync(
      process.execPath,
      ['--import=tsx', 'tests/fixtures/r15-lease-process.ts', batch],
      { env: { ...process.env }, encoding: 'utf8', windowsHide: true, timeout: 30000 },
    )
    assert.equal(result.status, 0, result.stderr)
    assert.ok(result.stdout.includes('R15_LEASE_PROCESS_DONE'))
  }
  run('1')
  assert.equal(
    await db.resourceLease.count({
      where: { id: { in: rows.map((r) => r.lease.id) }, status: 'REVIEW_REQUIRED' },
    }),
    1,
  )
  run('100')
  assert.equal(
    await db.resourceLease.count({
      where: { id: { in: rows.map((r) => r.lease.id) }, status: 'REVIEW_REQUIRED' },
    }),
    3,
  )
  for (const row of rows)
    assert.equal(await db.storageCleanupAudit.count({ where: { operationId: row.lease.id } }), 1)
})
test('实际Worker入口启动租约调度，并通过关闭屏障正常退出', async () => {
  const f = await make()
  await expire(f.lease.id)
  const child = spawn(process.execPath, ['--import=tsx', 'tests/fixtures/r15-worker-entry.ts'], {
    env: { ...process.env, FORMULA_RESOURCE_RECONCILIATION_ENABLED: 'true' },
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
  })
  // 日志只保留本机，成功不回显；fixture仅发ready元数据，不发送凭据。
  let stderr = ''
  child.stderr?.on('data', (chunk) => {
    stderr = (stderr + String(chunk)).slice(-4000)
  })
  child.stdout?.resume()
  const exited = new Promise<number | null>((resolve) => child.once('exit', resolve))
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Worker bootstrap timed out')), 20000)
      child.once('error', (error) => {
        clearTimeout(timer)
        reject(error)
      })
      child.once('exit', () => {
        clearTimeout(timer)
        reject(new Error('Worker exited before ready'))
      })
      child.once('message', (message) => {
        if (
          message &&
          typeof message === 'object' &&
          'ready' in message &&
          message.ready === true
        ) {
          clearTimeout(timer)
          resolve()
        }
      })
    })
    assert.equal(
      (await db.resourceLease.findUniqueOrThrow({ where: { id: f.lease.id } })).status,
      'REVIEW_REQUIRED',
    )
    child.send?.('stop')
    const code = await Promise.race([
      exited,
      new Promise<never>((_, reject) => {
        const timer = setTimeout(() => reject(new Error('Worker shutdown timed out')), 10000)
        timer.unref()
      }),
    ])
    assert.equal(code, 0, stderr)
  } finally {
    if (child.exitCode === null) {
      child.kill()
      await exited
    }
  }
})
test('真实HTTP请求标识与任务/模型尝试诊断关联，原202/v2契约不变', async () => {
  const auth = createAuthentication(db, {
    baseURL: testEnvironment.apiUrl,
    secret: testEnvironment.authSecret,
    isDevelopment: false,
  })
  const registered = await auth.api.signUpEmail({
    body: {
      name: 'R15诊断',
      email: `r15-${randomUUID()}@formula.test`,
      password: randomUUID() + 'aA!',
    },
    returnHeaders: true,
  })
  const ownerId = registered.response.user.id
  owners.push(ownerId)
  const cookie = registered.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  async function post(path: string, data: unknown) {
    return fetch(testEnvironment.apiUrl + '/api/account' + path, {
      method: 'POST',
      headers: {
        cookie,
        origin: testEnvironment.apiUrl,
        'content-type': 'application/json',
        'x-request-id': 'secret-inbound-value',
      },
      body: JSON.stringify(data),
    })
  }
  const created = await post('/conversations', { formulaVersionId: null, requestKey: randomUUID() })
  assert.equal(created.status, 200)
  assert.match(created.headers.get('x-request-id') ?? '', /^[a-f0-9-]{36}$/)
  const c = await created.json()
  assert.equal(c.protocolVersion, 2)
  const submitted = await post(`/conversations/${c.id}/messages`, {
    question: '受控诊断验证',
    requestKey: randomUUID(),
  })
  assert.equal(submitted.status, 202)
  const task = await submitted.json()
  const [job] = await boss.fetch<JobPayload>(queues.chat, { includeMetadata: true })
  assert.equal(job?.data.taskId, task.id)
  const logs: string[] = [],
    original = console.info
  console.info = (line) => {
    logs.push(String(line))
  }
  try {
    await processChat(db, boss, job!, {
      isMock: true,
      model: 'r15-controlled',
      async *stream() {
        yield { text: '受控回答', finishReason: 'stop' }
      },
    })
  } finally {
    console.info = original
  }
  const call = await db.chatCallAttempt.findFirstOrThrow({ where: { turnId: task.id } })
  const entries = logs.map((v) => JSON.parse(v))
  assert.ok(
    entries.some((v) => v.callId === call.id && v.taskId === task.id && v.jobId === job!.id),
  )
  assert.ok(
    entries.every((v) => v.ownerId === undefined && !JSON.stringify(v).includes('受控回答')),
  )
  const failed = await fetch(
    testEnvironment.apiUrl + `/api/account/conversations/${randomUUID()}`,
    { headers: { cookie } },
  )
  assert.equal(failed.status, 404)
  assert.match(failed.headers.get('x-request-id') ?? '', /^[a-f0-9-]{36}$/)
})
