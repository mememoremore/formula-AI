import { testEnvironment } from './support/integration.ts'
import { createTestQueueClient } from './support/queue-client'
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { createDatabaseClient } from '../server/database/client'
import { queues, type JobPayload } from '../server/queue/client'
import { PgBoss } from 'pg-boss'
import { createObjectStore } from '../server/storage/object-store'
import { uploadPrivateImage } from '../server/services/image-upload'
import { createFormula } from '../server/database/formulas'
import { createConversation, submitChatTurn } from '../server/database/conversations'
import { submitRecognition, submitExport } from '../server/database/task-submissions'
import { defaultUsageLimits } from '../server/database/usage'
import { readBusinessTask } from '../server/database/task-lifecycle'
import { reconcileTask } from '../server/database/task-reconciliation'
import { cancelChatTurn, saveChatProgress } from '../server/database/chat-progress'
import { beginAttempt, runTask } from '../server/worker/lifecycle'
import { startTaskRecovery } from '../server/worker/recovery'
import { processRecognition } from '../server/worker/recognition'
import { processChat } from '../server/worker/chat'
import { processExport } from '../server/worker/export'
import { LostJobClaim, type RunningJob } from '../server/queue/claim'
import { InferenceFailure } from '../server/inference/failure'
import type { JobKind } from '../shared/types/tasks'
const db = createDatabaseClient(testEnvironment.databaseUrl),
  db2 = createDatabaseClient(testEnvironment.databaseUrl)
const boss = createTestQueueClient(),
  boss2 = createTestQueueClient()
const store = createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' })
let png: Buffer
interface Fixture {
  kind: JobKind
  ownerId: string
  id: string
  queueJobId: string
  conversationId?: string
}
before(async () => {
  await Promise.all([db.$connect(), db2.$connect(), boss.start(), boss2.start(), store.check()])
  png = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'white' } })
    .png()
    .toBuffer()
})
after(async () => {
  await Promise.all([db.$disconnect(), db2.$disconnect(), boss.stop(), boss2.stop()])
})
async function make(kind: JobKind): Promise<Fixture> {
  const user = await db.user.create({
    data: { email: `r13-${randomUUID()}@formula.test`, displayName: 'R13隔离任务' },
  })
  let conversationId: string | undefined
  const task = await (async () => {
    if (kind === 'recognition') {
      const image = await uploadPrivateImage(db, store, {
        ownerId: user.id,
        uploadKey: randomUUID(),
        name: 'r13.png',
        mimeType: 'image/png',
        data: png,
      })
      return submitRecognition(db, boss, defaultUsageLimits, {
        ownerId: user.id,
        fileId: image.id,
        mode: 'handwritten',
        requestKey: randomUUID(),
      })
    }
    const formula = await createFormula(db, {
      ownerId: user.id,
      title: '固定版本',
      latex: 'x=1',
      origin: 'DEMO',
      isMock: true,
    })
    if (kind === 'export')
      return submitExport(db, boss, defaultUsageLimits, {
        ownerId: user.id,
        formulaVersionId: formula.version.id,
        requestKey: randomUUID(),
      })
    const conversation = await createConversation(db, user.id, formula.version.id, randomUUID())
    conversationId = conversation.id
    return submitChatTurn(db, boss, defaultUsageLimits, {
      ownerId: user.id,
      conversationId,
      question: '隔离问题',
      requestKey: randomUUID(),
    })
  })()
  assert.ok(task.queueJobId)
  return { kind, ownerId: user.id, id: task.id, queueJobId: task.queueJobId, conversationId }
}
async function dispose(f: Fixture) {
  const jobs = await boss.findJobs(queues[f.kind], { data: { ownerId: f.ownerId }, limit: 1000 })
  if (jobs.length)
    await boss.deleteJob(
      queues[f.kind],
      jobs.map((j) => j.id),
    )
  const files = await db.storedFile.findMany({ where: { ownerId: f.ownerId } })
  for (const file of files) await store.remove(file.objectKey)
  await db.resourceLease.deleteMany({ where: { ownerId: f.ownerId } })
  await db.user.delete({ where: { id: f.ownerId } })
}
async function using(kind: JobKind, action: (f: Fixture) => Promise<void>) {
  const f = await make(kind)
  try {
    await action(f)
  } finally {
    await dispose(f)
  }
}
async function claim(f: Fixture) {
  const [job] = await boss.fetch<JobPayload>(queues[f.kind], {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(job?.id, f.queueJobId)
  return job!
}
async function state(f: Fixture) {
  return (await readBusinessTask(db, f.kind, f.ownerId, f.id))!
}
async function execute(f: Fixture, job: RunningJob, client = db, queue = boss) {
  if (f.kind === 'recognition') return processRecognition(client, queue, store, job)
  if (f.kind === 'chat')
    return processChat(client, queue, job, {
      isMock: true,
      model: 'r13-fixture',
      async *stream() {
        yield { text: '完整回答', finishReason: 'stop' }
      },
    })
  return processExport(client, queue, store, job, async () => Buffer.from('r13-controlled-docx'))
}
async function artifactCount(f: Fixture) {
  if (f.kind === 'recognition') return db.formula.count({ where: { recognitionTaskId: f.id } })
  if (f.kind === 'chat') return db.chatMessage.count({ where: { turnId: f.id, role: 'ASSISTANT' } })
  return db.storedFile.count({ where: { ownerId: f.ownerId, kind: 'DOCX', status: 'READY' } })
}
async function waitFor(check: () => Promise<boolean>) {
  const end = Date.now() + 5000
  while (Date.now() < end) {
    if (await check()) return
    await delay(20)
  }
  assert.fail('未观察到后台自动收敛')
}
function child(mode: string, f: Fixture) {
  const result = spawnSync(
    process.execPath,
    ['--import=tsx', 'tests/fixtures/r13-worker-process.ts', mode, f.kind, f.id],
    { env: { ...process.env }, stdio: 'pipe', windowsHide: true, timeout: 25000 },
  )
  return result.status
}
for (const kind of ['recognition', 'chat', 'export'] as const) {
  test(`${kind}: 有效完成、重复执行和旧核对不能重复结果或扣额`, async () =>
    using(kind, async (f) => {
      const usage = await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } }),
        job = await claim(f)
      await execute(f, job)
      await execute(f, job)
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
      assert.equal(await reconcileTask(db2, boss2, kind, f.ownerId, f.id), 'unchanged')
      assert.deepEqual(await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } }), usage)
    }))
  test(`${kind}: 已撤销领取不能开始处理或产生资源`, async () =>
    using(kind, async (f) => {
      const job = await claim(f)
      await boss.fail(job.name, { id: job.id, retryCount: job.retryCount })
      await assert.rejects(execute(f, job), LostJobClaim)
      assert.equal((await state(f)).attemptCount, 0)
      assert.equal(await artifactCount(f), 0)
    }))
  test(`${kind}: 迟到失败不能回退新Worker完成结果`, async () =>
    using(kind, async (f) => {
      const stale = await claim(f)
      let release!: () => void, entered!: () => void
      const gate = new Promise<void>((r) => (release = r)),
        started = new Promise<void>((r) => (entered = r))
      const old = runTask(db, boss, kind, stale, async () => {
        entered()
        await gate
        throw new Error('late failure')
      }).catch((e) => e)
      await started
      await boss.fail(stale.name, { id: stale.id, retryCount: stale.retryCount })
      await execute(f, await claim(f))
      release()
      assert.ok((await old) instanceof LostJobClaim)
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
    }))
  test(`${kind}: 暂时超时与最终失败原子确认队列，不重复扣额`, async () =>
    using(kind, async (f) => {
      const usage = await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } })
      for (let i = 0; i < 3; i++) {
        const job = await claim(f)
        await assert.rejects(
          runTask(db, boss, kind, job, async () => {
            throw new InferenceFailure('TIMEOUT', '受控服务超时。', true)
          }),
        )
        const [queued] = await boss.findJobs(queues[kind], { id: f.queueJobId })
        assert.equal(queued!.state, i === 2 ? 'failed' : 'retry')
        assert.equal((await state(f)).status, i === 2 ? 'FAILED' : 'QUEUED')
      }
      assert.equal(await artifactCount(f), kind === 'chat' ? 1 : 0)
      assert.deepEqual(await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } }), usage)
    }))
  test(`${kind}: 真实进程领取前/领取后/开始后退出，监督后可继续执行`, async () => {
    for (const mode of ['before', 'claim', 'started'])
      await using(kind, async (f) => {
        if (mode !== 'before')
          await db.$executeRaw`UPDATE pgboss.job SET expire_seconds=1,heartbeat_seconds=NULL WHERE name=${queues[kind]} AND id=${f.queueJobId}::uuid`
        assert.equal(child(mode, f), 17)
        if (mode !== 'before') {
          await delay(1100)
          await boss.supervise(queues[kind])
          await reconcileTask(db, boss, kind, f.ownerId, f.id)
        }
        assert.equal((await state(f)).status, 'QUEUED')
        await execute(f, await claim(f))
        assert.equal((await state(f)).status, 'COMPLETED')
        assert.equal(await artifactCount(f), 1)
      })
  })
  test(`${kind}: 无详情GET时独立恢复进程自动收敛终止队列`, async () =>
    using(kind, async (f) => {
      const job = await claim(f)
      await beginAttempt(db, kind, job)
      await boss.cancel(job.name, { id: job.id, retryCount: job.retryCount })
      assert.equal(child('recover', f), 0)
      assert.equal((await state(f)).status, 'FAILED')
      assert.equal(await artifactCount(f), kind === 'chat' ? 1 : 0)
    }))
  test(`${kind}: 两个恢复实例竞争、周期与重复核对只转换一次`, async () =>
    using(kind, async (f) => {
      const job = await claim(f)
      await beginAttempt(db, kind, job)
      await boss.cancel(job.name, { id: job.id, retryCount: job.retryCount })
      const results = await Promise.all([
        reconcileTask(db, boss, kind, f.ownerId, f.id),
        reconcileTask(db2, boss2, kind, f.ownerId, f.id),
      ])
      assert.equal(results.filter((r) => r === 'changed').length, 1)
      for (let i = 0; i < 3; i++)
        assert.equal(await reconcileTask(db, boss, kind, f.ownerId, f.id), 'unchanged')
      assert.equal(await artifactCount(f), kind === 'chat' ? 1 : 0)
    }))
  test(`${kind}: 数据库提交成功但响应丢失不能回退终态或删除成品`, async () =>
    using(kind, async (f) => {
      let injected = false
      const fault = new Proxy(db, {
        get(target, key) {
          if (key === '$transaction')
            return async (
              callback: (
                tx: import('../server/generated/prisma/client').Prisma.TransactionClient,
              ) => Promise<unknown>,
              options?: { timeout?: number },
            ) => {
              const result = await target.$transaction(callback, options)
              if (!injected && (await state(f)).status === 'COMPLETED') {
                injected = true
                throw new Error('lost commit response')
              }
              return result
            }
          const value = Reflect.get(target, key, target)
          return typeof value === 'function' ? value.bind(target) : value
        },
      })
      await assert.rejects(execute(f, await claim(f), fault))
      assert.ok(injected)
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
    }))
  test(`${kind}: 真正过期但未监督的执行权无法开始或提交`, async () =>
    using(kind, async (f) => {
      const job = await claim(f)
      await db.$executeRaw`UPDATE pgboss.job SET started_on=pgboss.job_now()-interval '1000 seconds' WHERE name=${queues[kind]} AND id=${f.queueJobId}::uuid`
      await assert.rejects(execute(f, job), LostJobClaim)
      assert.equal(await artifactCount(f), 0)
    }))
}
test('聊天停止与完成竞争互斥，停止不改已完成队列与回答', async () => {
  for (let i = 0; i < 6; i++)
    await using('chat', async (f) => {
      const job = await claim(f)
      const results = await Promise.allSettled([
        execute(f, job),
        cancelChatTurn(db2, boss2, f.ownerId, f.conversationId!, f.id),
      ])
      assert.ok(results.some((r) => r.status === 'fulfilled'))
      const task = await state(f)
      assert.ok(['COMPLETED', 'FAILED'].includes(task.status))
      assert.equal(await artifactCount(f), 1)
      const [before] = await boss.findJobs(queues.chat, { id: job.id })
      await cancelChatTurn(db, boss, f.ownerId, f.conversationId!, f.id)
      assert.equal((await boss.findJobs(queues.chat, { id: job.id }))[0]!.state, before!.state)
      await assert.rejects(saveChatProgress(db, boss, job, '迟到片段'), LostJobClaim)
    })
})
test('后台周期不依赖GET、能关闭且扫描不会被前排活动任务饿死', async () => {
  const a = await make('chat'),
    b = await make('chat')
  let recovery: Awaited<ReturnType<typeof startTaskRecovery>> | undefined
  try {
    const first = await claim(a).catch(() => null)
    // 两项任务按队列创建顺序领取，分别记录；此处两个账号同队列无其他fixture。
    assert.ok(first)
    const second = await claim(b)
    await beginAttempt(db, 'chat', first)
    await beginAttempt(db, 'chat', second)
    recovery = await startTaskRecovery(db, boss, { enabled: true, intervalMs: 25, batchSize: 1 })
    await boss.cancel(second.name, { id: second.id, retryCount: second.retryCount })
    await waitFor(async () => (await state(b)).status === 'FAILED')
    assert.equal((await state(a)).status, 'PROCESSING')
    await recovery.stop()
    recovery = undefined
    await boss.cancel(first.name, { id: first.id, retryCount: first.retryCount })
    await delay(100)
    assert.equal((await state(a)).status, 'PROCESSING')
  } finally {
    await recovery?.stop()
    await dispose(a)
    await dispose(b)
  }
})

for (const kind of ['recognition', 'chat', 'export'] as const) {
  test(`${kind}: 完整独立Worker消费、正常关闭并原子确认真实队列`, async () =>
    using(kind, async (f) => {
      assert.equal(child('consume', f), 0)
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
      assert.equal((await boss.findJobs(queues[kind], { id: f.queueJobId }))[0]!.state, 'completed')
    }))
  test(`${kind}: 已有持久结果与已完成队列能修复异常非终态，不生成新产物`, async () =>
    using(kind, async (f) => {
      await execute(f, await claim(f))
      const data = { status: 'QUEUED' as const, finishedAt: null }
      if (kind === 'recognition') await db.recognitionTask.update({ where: { id: f.id }, data })
      else if (kind === 'chat') await db.chatTurn.update({ where: { id: f.id }, data })
      else await db.exportTask.update({ where: { id: f.id }, data })
      assert.equal(await reconcileTask(db2, boss2, kind, f.ownerId, f.id), 'changed')
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
    }))
  test(`${kind}: 队列记录缺失时保守报告，不仅按任务年龄判失败`, async () =>
    using(kind, async (f) => {
      await boss.deleteJob(queues[kind], f.queueJobId)
      assert.equal(await reconcileTask(db, boss, kind, f.ownerId, f.id), 'unresolved')
      assert.equal((await state(f)).status, 'QUEUED')
      assert.equal(await artifactCount(f), 0)
    }))
}
test('双后台实例同时核对，无用户读取也只保存一条失败回答', async () =>
  using('chat', async (f) => {
    const job = await claim(f)
    await beginAttempt(db, 'chat', job)
    await boss.cancel(job.name, { id: job.id, retryCount: job.retryCount })
    const controls = await Promise.all([
      startTaskRecovery(db, boss, { enabled: true, intervalMs: 25, batchSize: 1 }),
      startTaskRecovery(db2, boss2, { enabled: true, intervalMs: 25, batchSize: 1 }),
    ])
    try {
      await waitFor(async () => (await state(f)).status === 'FAILED')
      const stamp = (await state(f)).finishedAt!
      await delay(80)
      assert.equal((await state(f)).finishedAt!.getTime(), stamp.getTime())
      assert.equal(await artifactCount(f), 1)
    } finally {
      await Promise.all(controls.map((c) => c.stop()))
    }
  }))
test('周期核对遇到队列异常不盲改，恢复可用后自动重试', async () =>
  using('chat', async (f) => {
    const job = await claim(f)
    await beginAttempt(db, 'chat', job)
    let failing = false,
      failures = 0
    const fault = new Proxy(boss, {
      get(target, key) {
        if (key === 'supervise')
          return async (name: string) => {
            if (failing) {
              failures++
              throw new Error('Injected queue failure')
            }
            return target.supervise(name)
          }
        const value = Reflect.get(target, key, target)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    const recovery = await startTaskRecovery(db, fault, {
      enabled: true,
      intervalMs: 20,
      batchSize: 10,
    })
    try {
      failing = true
      await boss.cancel(job.name, { id: job.id, retryCount: job.retryCount })
      await waitFor(async () => failures >= 2)
      assert.equal((await state(f)).status, 'PROCESSING')
      failing = false
      await waitFor(async () => (await state(f)).status === 'FAILED')
    } finally {
      await recovery.stop()
    }
  }))
test('导出失败核对不会释放R12未知文件/租约或删除对象', async () =>
  using('export', async (f) => {
    const { reserveResource } = await import('../server/resources/leases')
    const { prepareFile } = await import('../server/resources/files')
    const job = await claim(f)
    await beginAttempt(db, 'export', job)
    const bytes = Buffer.from('uncertain-export-write'),
      lease = await reserveResource(db, {
        ownerId: f.ownerId,
        purpose: 'DOCX_WRITE',
        requestKey: `${f.id}:${job.retryCount}`,
        bytes: bytes.length,
      })
    const file = await prepareFile(db, lease, {
      kind: 'DOCX',
      bucket: store.bucket,
      objectKey: `${f.ownerId}/uncertain/${randomUUID()}`,
      name: 'uncertain.docx',
      mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      sizeBytes: bytes.length,
    })
    await store.put(file.objectKey, bytes, file.mimeType)
    await boss.cancel(job.name, { id: job.id, retryCount: job.retryCount })
    await reconcileTask(db, boss, 'export', f.ownerId, f.id)
    assert.equal((await state(f)).status, 'FAILED')
    assert.equal(
      (await db.resourceLease.findUniqueOrThrow({ where: { id: lease.id } })).status,
      'ACTIVE',
    )
    assert.equal(
      (await db.storedFile.findUniqueOrThrow({ where: { id: file.id } })).status,
      'PENDING',
    )
    assert.ok(await store.head!(file.objectKey))
  }))

async function gatedExecution(
  f: Fixture,
  job: RunningJob,
  entered: () => void,
  gate: Promise<void>,
) {
  if (f.kind === 'recognition')
    return processRecognition(db, boss, store, job, {
      async recognize() {
        entered()
        await gate
        return { requestId: randomUUID(), latex: 'x=1', modelVersion: 'r13-gated', isMock: true }
      },
    })
  if (f.kind === 'chat')
    return processChat(db, boss, job, {
      isMock: true,
      model: 'r13-gated',
      async *stream() {
        entered()
        await gate
        yield { text: '受控完整回答', finishReason: 'stop' }
      },
    })
  return processExport(db, boss, store, job, async () => {
    entered()
    await gate
    return Buffer.from('r13-gated-docx')
  })
}
for (const kind of ['recognition', 'chat', 'export'] as const) {
  test(`${kind}: 同一有效领取重复调用不启动第二次处理`, async () =>
    using(kind, async (f) => {
      const job = await claim(f)
      let entered!: () => void, release!: () => void
      const started = new Promise<void>((r) => (entered = r)),
        gate = new Promise<void>((r) => (release = r))
      const running = gatedExecution(f, job, entered, gate)
      try {
        await started
        await execute(f, job)
        assert.equal((await state(f)).status, 'PROCESSING')
        assert.equal(await artifactCount(f), 0)
      } finally {
        release()
      }
      await running
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
    }))
  test(`${kind}: 开始后执行权过期，迟到结果不能提交；新领取可以完成`, async () =>
    using(kind, async (f) => {
      const job = await claim(f)
      let entered!: () => void, release!: () => void
      const started = new Promise<void>((r) => (entered = r)),
        gate = new Promise<void>((r) => (release = r))
      const running = gatedExecution(f, job, entered, gate).catch((error) => error)
      await started
      await db.$executeRaw`UPDATE pgboss.job SET started_on=pgboss.job_now()-interval '1000 seconds' WHERE name=${queues[kind]} AND id=${job.id}::uuid`
      release()
      assert.ok((await running) instanceof LostJobClaim)
      assert.equal(await artifactCount(f), 0)
      await boss.fail(job.name, { id: job.id, retryCount: job.retryCount })
      await reconcileTask(db, boss, kind, f.ownerId, f.id)
      await execute(f, await claim(f))
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
    }))
  test(`${kind}: 停止信号与结果到达交错，旧尝试不写终态且重试不重复扣额`, async () =>
    using(kind, async (f) => {
      const controller = new AbortController(),
        job = { ...(await claim(f)), signal: controller.signal }
      const usage = await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } })
      let entered!: () => void, release!: () => void
      const started = new Promise<void>((r) => (entered = r)),
        gate = new Promise<void>((r) => (release = r))
      const running = gatedExecution(f, job, entered, gate).catch((error) => error)
      await started
      controller.abort()
      release()
      assert.ok((await running) instanceof LostJobClaim)
      assert.equal(await artifactCount(f), 0)
      await boss.fail(job.name, { id: job.id, retryCount: job.retryCount })
      await reconcileTask(db, boss, kind, f.ownerId, f.id)
      await execute(f, await claim(f))
      assert.equal((await state(f)).status, 'COMPLETED')
      assert.equal(await artifactCount(f), 1)
      assert.deepEqual(await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } }), usage)
    }))
}

for (const kind of ['recognition', 'chat', 'export'] as const)
  test(`${kind}: 真实boss.work外层重复确认失败不会额外重试或扣额`, async () =>
    using(kind, async (f) => {
      const worker = new PgBoss({
        connectionString: testEnvironment.databaseUrl,
        schema: 'pgboss',
        migrate: false,
        supervise: false,
        schedule: false,
        max: 2,
      })
      worker.on('error', () => {})
      const attempts: number[] = [],
        usage = await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } })
      await worker.start()
      try {
        await worker.work<
          JobPayload,
          void,
          { includeMetadata: true; batchSize: number; pollingIntervalSeconds: number }
        >(
          queues[kind],
          { includeMetadata: true, batchSize: 1, pollingIntervalSeconds: 1 },
          async (jobs) => {
            for (const job of jobs) {
              assert.equal(job.data.taskId, f.id)
              attempts.push(job.retryCount)
              if (attempts.length === 1)
                await runTask(db, worker, kind, job, async () => {
                  throw new InferenceFailure('UPSTREAM', '受控临时错误。', true)
                })
              else await execute(f, job, db, worker)
            }
          },
        )
        await waitFor(async () => (await state(f)).status === 'COMPLETED')
        assert.deepEqual(attempts, [0, 1])
        assert.equal(await artifactCount(f), 1)
        assert.equal(
          (await worker.findJobs(queues[kind], { id: f.queueJobId }))[0]!.state,
          'completed',
        )
        assert.deepEqual(await db.dailyUsage.findMany({ where: { ownerId: f.ownerId } }), usage)
      } finally {
        await worker.stop({ graceful: true, timeout: 5000 })
      }
    }))
