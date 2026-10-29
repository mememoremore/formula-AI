import { testEnvironment } from './support/integration.ts'
import { createTestQueueClient } from './support/queue-client'
import { acceptConversationSnapshot } from '../app/utils/chat-state'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { before, after, test } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import sharp from 'sharp'
import { unzipSync, strFromU8 } from 'fflate'
import type { PgBoss } from 'pg-boss'
import { createDatabaseClient } from '../server/database/client'
import { createAuthentication } from '../server/auth/config'
import { createObjectStore } from '../server/storage/object-store'
import { uploadPrivateImage } from '../server/services/image-upload'
import { createFormula, appendFormulaVersion } from '../server/database/formulas'
import { submitRecognition, submitExport } from '../server/database/task-submissions'
import { reserveUsage, defaultUsageLimits } from '../server/database/usage'
import { createQueueClient, queues, type JobPayload } from '../server/queue/client'
import { processRecognition } from '../server/worker/recognition'
import { processChat } from '../server/worker/chat'
import { processExport } from '../server/worker/export'
import { LostJobClaim, type RunningJob } from '../server/queue/claim'
import { saveChatProgress } from '../server/database/chat-progress'
import { InferenceFailure } from '../server/inference/failure'
import { createDeepSeekAdapter } from '../server/chat/deepseek-adapter'
import type { ChatAdapter } from '../server/chat/adapter'
import type {
  RecognitionTaskState,
  ExportTaskState,
  SavedConversation,
  TaskState,
} from '../shared/types/tasks'

const db = createDatabaseClient(testEnvironment.databaseUrl)
const db2 = createDatabaseClient(testEnvironment.databaseUrl)
const boss = createTestQueueClient()
const store = createObjectStore({
  endpoint: process.env.NUXT_STORAGE_ENDPOINT ?? '',
  region: process.env.NUXT_STORAGE_REGION ?? '',
  bucket: process.env.NUXT_STORAGE_BUCKET ?? '',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
const base = testEnvironment.apiUrl
const origin = process.env.NUXT_AUTH_BASE_URL ?? base
const owners: string[] = []
const cookies: string[] = []
let imageId = ''
let recognition: RecognitionTaskState
let failedRecognition: { id: string; requestKey: string }
let versionId = ''
let formulaId = ''
let foreignVersion = ''
let conversation: SavedConversation
let exportTask: ExportTaskState

async function api(path: string, method = 'GET', body?: unknown, user = 0, source = origin) {
  return fetch(`${base}/api/account${path}`, {
    method,
    headers: {
      cookie: cookies[user] ?? '',
      origin: source,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
async function fetchJob(kind: keyof typeof queues): Promise<RunningJob> {
  const [job] = await boss.fetch<JobPayload>(queues[kind], {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.ok(job, '队列里应存在待执行任务')
  assert.ok(owners.includes(job.data.ownerId), '只领取本套验收的临时账号任务')
  return job
}
before(async () => {
  await Promise.all([db.$connect(), db2.$connect(), boss.start(), store.check()])
  const auth = createAuthentication(db, {
    baseURL: origin,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: false,
  })
  for (const label of ['a', 'b']) {
    const result = await auth.api.signUpEmail({
      body: {
        name: '队列验收临时账号',
        email: `jobs-${label}-${randomUUID()}@formula.test`,
        password: randomBytes(24).toString('base64url'),
      },
      returnHeaders: true,
    })
    owners.push(result.response.user.id)
    cookies.push(
      result.headers
        .getSetCookie()
        .map((value) => value.split(';')[0])
        .join('; '),
    )
  }
  const png = await sharp({ create: { width: 40, height: 20, channels: 3, background: 'white' } })
    .png()
    .toBuffer()
  imageId = (
    await uploadPrivateImage(db, store, {
      ownerId: owners[0]!,
      uploadKey: randomUUID(),
      name: '队列公式.png',
      mimeType: 'image/png',
      data: png,
    })
  ).id
  const initial = await createFormula(db, {
    ownerId: owners[0]!,
    title: '原始标题',
    latex: '\\frac{1}{2}',
    origin: 'DEMO',
    isMock: true,
  })
  versionId = initial.version.id
  formulaId = initial.formula.id
  foreignVersion = (
    await createFormula(db, {
      ownerId: owners[1]!,
      title: '私有',
      latex: 'x=1',
      origin: 'DEMO',
      isMock: true,
    })
  ).version.id
})
after(async () => {
  try {
    for (const name of Object.values(queues))
      for (const ownerId of owners) {
        const jobs = await boss.findJobs(name, { data: { ownerId }, limit: 1000 })
        if (jobs.length)
          await boss.deleteJob(
            name,
            jobs.map((job) => job.id),
          )
      }
    const files = await db.storedFile.findMany({
      where: { ownerId: { in: owners } },
      select: { objectKey: true },
    })
    for (const file of files) await store.remove(file.objectKey)
    await db.user.deleteMany({ where: { id: { in: owners } } })
  } finally {
    await Promise.all([boss.stop(), db.$disconnect(), db2.$disconnect()])
  }
})

test('识别HTTP提交202且真实排队，Worker未启动时刷新仍可读取', async () => {
  const response = await api('/recognitions', 'POST', {
    fileId: imageId,
    mode: 'handwritten',
    requestKey: randomUUID(),
  })
  assert.equal(response.status, 202)
  recognition = (await response.json()) as RecognitionTaskState
  assert.equal(recognition.status, 'QUEUED')
  assert.equal(recognition.formulaId, null)
  const refreshed = await api(`/tasks/${recognition.id}`)
  assert.equal(((await refreshed.json()) as RecognitionTaskState).status, 'QUEUED')
})
test('真实Worker处理后原子保存公式和首版，重复执行不会再次创建', async () => {
  const job = await fetchJob('recognition')
  await processRecognition(db, boss, store, job)
  const saved = await db.recognitionTask.findUniqueOrThrow({
    where: { id: recognition.id },
    include: { formula: { include: { versions: true } } },
  })
  assert.equal(saved.status, 'COMPLETED')
  assert.equal(saved.formula?.versions.length, 1)
  assert.equal(saved.formula?.versions[0]?.isMock, true)
  assert.equal((await boss.getJobById(queues.recognition, job.id))?.state, 'completed')
  await processRecognition(db, boss, store, job)
  assert.equal(await db.formula.count({ where: { recognitionTaskId: saved.id } }), 1)
})
test('并发重放只入队一次、只扣一次识别额度，换图片或模式409', async () => {
  const requestKey = randomUUID()
  const body = { fileId: imageId, mode: 'handwritten', requestKey }
  const responses = await Promise.all(
    Array.from({ length: 4 }, () => api('/recognitions', 'POST', body)),
  )
  assert.deepEqual(
    responses.map((item) => item.status),
    [202, 202, 202, 202],
  )
  const tasks = await Promise.all(
    responses.map((item) => item.json() as Promise<RecognitionTaskState>),
  )
  assert.equal(new Set(tasks.map((item) => item.id)).size, 1)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: owners[0], kind: 'RECOGNITION' } }))
      .used,
    2,
  )
  assert.equal((await api('/recognitions', 'POST', { ...body, mode: 'printed' })).status, 409)
  await processRecognition(db, boss, store, await fetchJob('recognition'))
})
test('两个数据库客户端并发扣额不会突破上限', async () => {
  const results = await Promise.allSettled(
    Array.from({ length: 12 }, (_, index) =>
      (index % 2 ? db : db2).$transaction((tx) => reserveUsage(tx, owners[1]!, 'CHAT', 2)),
    ),
  )
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: owners[1], kind: 'CHAT' } })).used,
    2,
  )
})
test('入队异常使导出任务和额度一起回滚', async () => {
  const requestKey = randomUUID()
  const brokenQueue = {
    send: async () => {
      throw new Error('验收入队失败')
    },
  } as unknown as PgBoss
  await assert.rejects(
    submitExport(db, brokenQueue, defaultUsageLimits, {
      ownerId: owners[0]!,
      formulaVersionId: versionId,
      requestKey,
    }),
  )
  assert.equal(await db.exportTask.count({ where: { requestKey } }), 0)
  assert.equal(await db.dailyUsage.count({ where: { ownerId: owners[0], kind: 'EXPORT' } }), 0)
})
test('存储临时失败自动重试最多三次，最终失败不产生公式', async () => {
  const task = await submitRecognition(db, boss, defaultUsageLimits, {
    ownerId: owners[0]!,
    fileId: imageId,
    mode: 'printed',
    requestKey: randomUUID(),
  })
  for (let index = 0; index < 3; index++) {
    const job = await fetchJob('recognition')
    await assert.rejects(
      processRecognition(
        db,
        boss,
        {
          ...store,
          get: async () => {
            throw new Error('验收存储故障')
          },
        },
        job,
      ),
    )
    await boss.fail(job.name, { id: job.id, retryCount: job.retryCount })
  }
  const failed = await db.recognitionTask.findUniqueOrThrow({ where: { id: task.id } })
  assert.equal(failed.status, 'FAILED')
  assert.equal(failed.attemptCount, 3)
  assert.equal(await db.formula.count({ where: { recognitionTaskId: task.id } }), 0)
  failedRecognition = { id: task.id, requestKey: task.requestKey }
})

test('Worker进程领取后退出，超时监督后可由新实例恢复', async () => {
  const task = await submitRecognition(db, boss, defaultUsageLimits, {
    ownerId: owners[0]!,
    fileId: imageId,
    mode: 'handwritten',
    requestKey: randomUUID(),
  })
  // 仅缩短本次临时任务的租约，以实际子进程退出验证恢复，无需等待默认90秒。
  await db.$executeRaw`UPDATE pgboss.job SET expire_seconds=1, heartbeat_seconds=NULL WHERE id=${task.queueJobId}::uuid AND name=${queues.recognition}`
  const child = spawnSync(
    process.execPath,
    [
      'node_modules/tsx/dist/cli.mjs',
      'tests/fixtures/claim-and-exit.ts',
      queues.recognition,
      task.id,
    ],
    { encoding: 'utf8', timeout: 15000, windowsHide: true },
  )
  assert.equal(child.status, 0, child.stderr)
  assert.equal(child.stdout, task.queueJobId)
  const expiryDeadline = Date.now() + 6000
  let retried = false
  while (Date.now() < expiryDeadline) {
    await boss.supervise(queues.recognition)
    const [queued] = await boss.findJobs(queues.recognition, { id: task.queueJobId! })
    if (queued?.state === 'retry') {
      retried = true
      break
    }
    await delay(100)
  }
  assert.equal(retried, true, '必须观察到真实队列转为retry后才重新领取')
  const replacement = createQueueClient(testEnvironment.databaseUrl)
  try {
    await replacement.start()
    const [job] = await replacement.fetch<JobPayload>(queues.recognition, {
      includeMetadata: true,
      ignoreStartAfter: true,
    })
    assert.ok(job)
    await processRecognition(db, replacement, store, job)
  } finally {
    await replacement.stop()
  }
  assert.equal(
    (await db.recognitionTask.findUniqueOrThrow({ where: { id: task.id } })).status,
    'COMPLETED',
  )
})
test('账号对话只接受本人版本，创建请求重放返回同一对话', async () => {
  const requestKey = randomUUID()
  const response = await api('/conversations', 'POST', { formulaVersionId: versionId, requestKey })
  assert.equal(response.status, 200)
  conversation = (await response.json()) as SavedConversation
  assert.equal(conversation.context?.latex, '\\frac{1}{2}')
  assert.equal(
    (
      (await (
        await api('/conversations', 'POST', { formulaVersionId: versionId, requestKey })
      ).json()) as SavedConversation
    ).id,
    conversation.id,
  )
  assert.equal(
    (
      await api('/conversations', 'POST', {
        formulaVersionId: foreignVersion,
        requestKey: randomUUID(),
      })
    ).status,
    404,
  )
})
test('对话轮次并发请求只成功一个，重放原问题不重复消息或扣额', async () => {
  const requestKey = randomUUID()
  const body = { question: '请解释这个公式', requestKey }
  const results = await Promise.all([
    api(`/conversations/${conversation.id}/messages`, 'POST', body),
    api(`/conversations/${conversation.id}/messages`, 'POST', body),
  ])
  assert.deepEqual(
    results.map((result) => result.status),
    [202, 202],
  )
  assert.equal(
    (
      await api(`/conversations/${conversation.id}/messages`, 'POST', {
        question: '另一问',
        requestKey: randomUUID(),
      })
    ).status,
    409,
  )
  assert.equal(await db.chatMessage.count({ where: { conversationId: conversation.id } }), 1)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: owners[0], kind: 'CHAT' } })).used,
    1,
  )
  await processChat(db, boss, await fetchJob('chat'))
  const refreshed = (await (
    await api(`/conversations/${conversation.id}`)
  ).json()) as SavedConversation
  assert.equal(refreshed.messages.length, 2)
  assert.equal(refreshed.messages[1]?.isMock, true)
  assert.equal(refreshed.currentTurn?.status, 'COMPLETED')
})
test('修改公式后旧对话仍绑定旧版本，直接覆盖上下文被数据库拒绝', async () => {
  const next = await appendFormulaVersion(db, {
    ownerId: owners[0]!,
    formulaId,
    expectedVersionId: versionId,
    expectedTitle: '原始标题',
    latex: 'E=mc^2',
    title: '修改后的标题',
  })
  const refreshed = (await (
    await api(`/conversations/${conversation.id}`)
  ).json()) as SavedConversation
  assert.equal(refreshed.context?.id, versionId)
  assert.equal(refreshed.context?.latex, '\\frac{1}{2}')
  await assert.rejects(
    db.conversation.update({ where: { id: conversation.id }, data: { formulaVersionId: next.id } }),
  )
})
test('Word导出绑定指定旧版本并提供私有下载', async () => {
  const response = await api('/exports', 'POST', {
    formulaVersionId: versionId,
    requestKey: randomUUID(),
  })
  assert.equal(response.status, 202)
  exportTask = (await response.json()) as ExportTaskState
  assert.equal(exportTask.status, 'QUEUED')
  assert.equal((await api(`/exports/${exportTask.id}/download`)).status, 409)
  await processExport(db, boss, store, await fetchJob('export'))
  const ready = (await (await api(`/exports/${exportTask.id}`)).json()) as ExportTaskState
  assert.equal(ready.status, 'COMPLETED')
  assert.equal(ready.versionNumber, 1)
  const download = await api(`/exports/${ready.id}/download`)
  assert.equal(download.status, 200)
  assert.match(download.headers.get('cache-control') ?? '', /no-store/)
  assert.match(download.headers.get('content-disposition') ?? '', /attachment/)
  const files = unzipSync(new Uint8Array(await download.arrayBuffer()))
  const xml = strFromU8(files['word/document.xml']!)
  assert.match(xml, /<m:f[ >]/)
  assert.ok(xml.includes('v1'))
  assert.ok(!xml.includes('E=mc^2'))
})

test('刷新导出读取保留固定版本，重复下载不新增任务或额度', async () => {
  const usage = await db.dailyUsage.findMany({ where: { ownerId: owners[0] } })
  const count = await db.exportTask.count({ where: { ownerId: owners[0] } })
  const first = await api(`/exports/${exportTask.id}`)
  assert.equal(first.status, 200)
  assert.match(first.headers.get('cache-control') ?? '', /no-store/)
  const ready = (await first.json()) as ExportTaskState
  assert.equal(ready.formulaVersionId, versionId)
  assert.equal(ready.downloadUrl, `/api/account/exports/${exportTask.id}/download`)
  for (let index = 0; index < 2; index++) {
    const download = await api(`/exports/${exportTask.id}/download`)
    assert.equal(download.status, 200)
    assert.match(download.headers.get('content-type') ?? '', /wordprocessingml.document/)
    assert.ok((await download.arrayBuffer()).byteLength > 0)
  }
  assert.equal(await db.exportTask.count({ where: { ownerId: owners[0] } }), count)
  assert.deepEqual(await db.dailyUsage.findMany({ where: { ownerId: owners[0] } }), usage)
})
test('失效Worker不能提交导出，下一次执行可恢复且只保留一份READY成品', async () => {
  const task = await submitExport(db, boss, defaultUsageLimits, {
    ownerId: owners[0]!,
    formulaVersionId: versionId,
    requestKey: randomUUID(),
  })
  const stale = await fetchJob('export')
  await boss.fail(stale.name, { id: stale.id, retryCount: stale.retryCount })
  await assert.rejects(processExport(db, boss, store, stale), LostJobClaim)
  assert.equal((await db.exportTask.findUniqueOrThrow({ where: { id: task.id } })).fileId, null)
  await processExport(db, boss, store, await fetchJob('export'))
  const saved = await db.exportTask.findUniqueOrThrow({
    where: { id: task.id },
    include: { file: true },
  })
  assert.equal(saved.file?.status, 'READY')
  assert.equal(
    await db.storedFile.count({
      where: {
        ownerId: owners[0],
        kind: 'DOCX',
        status: 'READY',
        objectKey: { contains: task.id },
      },
    }),
    1,
  )
})
test('转换不支持时明确FAILED，不生成可下载的占位文档', async () => {
  const invalid = await createFormula(db, {
    ownerId: owners[0]!,
    title: '不支持命令',
    latex: '\\unknownCommand{x}',
    origin: 'DEMO',
    isMock: true,
  })
  const task = await submitExport(db, boss, defaultUsageLimits, {
    ownerId: owners[0]!,
    formulaVersionId: invalid.version.id,
    requestKey: randomUUID(),
  })
  await processExport(db, boss, store, await fetchJob('export'))
  const failed = (await (await api(`/exports/${task.id}`)).json()) as ExportTaskState
  assert.equal(failed.status, 'FAILED')
  assert.equal(failed.downloadUrl, null)
  assert.match(failed.errorMessage ?? '', /语法|不支持/)
})
test('他人任务、对话、版本和下载均404，未登录401，跨站写入403', async () => {
  for (const path of [
    `/tasks/${recognition.id}`,
    `/exports/${exportTask.id}`,
    `/exports/${exportTask.id}/download`,
    `/conversations/${conversation.id}`,
    `/versions/${versionId}`,
  ]) {
    assert.equal((await api(path, 'GET', undefined, 1)).status, 404)
    assert.equal((await api(path, 'GET', undefined, 99)).status, 401)
  }
  assert.equal(
    (
      await api(
        '/exports',
        'POST',
        { formulaVersionId: versionId, requestKey: randomUUID() },
        0,
        'https://untrusted.invalid',
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await api(
        `/conversations/${conversation.id}/messages`,
        'POST',
        { question: '越权', requestKey: randomUUID() },
        1,
      )
    ).status,
    404,
  )
})
test('刷新可读对话列表和每日额度，额度按功能独立', async () => {
  const list = (await (await api('/conversations')).json()) as { items: { id: string }[] }
  assert.ok(list.items.some((item) => item.id === conversation.id))
  const usage = (await (await api('/usage')).json()) as {
    items: { kind: string; used: number }[]
    resetsAt: string
  }
  assert.equal(usage.items.find((item) => item.kind === 'CHAT')?.used, 1)
  assert.equal(usage.items.find((item) => item.kind === 'RECOGNITION')?.used, 4)
  assert.match(usage.resetsAt, /T00:00:00.000Z$/)
})
test('导出请求并发重放只保存一个任务和一份文档', async () => {
  const requestKey = randomUUID()
  const responses = await Promise.all([
    api('/exports', 'POST', { formulaVersionId: versionId, requestKey }),
    api('/exports', 'POST', { formulaVersionId: versionId, requestKey }),
  ])
  assert.deepEqual(
    responses.map((response) => response.status),
    [202, 202],
  )
  const tasks = await Promise.all(
    responses.map((response) => response.json() as Promise<ExportTaskState>),
  )
  assert.equal(tasks[0]?.id, tasks[1]?.id)
  assert.equal(await db.exportTask.count({ where: { ownerId: owners[0], requestKey } }), 1)
  await processExport(db, boss, store, await fetchJob('export'))
})
test('中断对话查询时修复失败状态，保留失败记录并允许下一轮', async () => {
  const response = await api(`/conversations/${conversation.id}/messages`, 'POST', {
    question: '中断测试',
    requestKey: randomUUID(),
  })
  const task = (await response.json()) as TaskState
  const job = await fetchJob('chat')
  await db.chatTurn.update({
    where: { id: task.id },
    data: { status: 'PROCESSING', startedAt: new Date(), attemptCount: 1 },
  })
  await boss.cancel(job.name, { id: job.id, retryCount: job.retryCount })
  const saved = (await (await api(`/conversations/${conversation.id}`)).json()) as SavedConversation
  assert.equal(saved.currentTurn?.status, 'FAILED')
  assert.equal(saved.messages.at(-1)?.status, 'FAILED')
  assert.equal(
    (
      await api(`/conversations/${conversation.id}/messages`, 'POST', {
        question: '重新提问',
        requestKey: randomUUID(),
      })
    ).status,
    202,
  )
  await processChat(db, boss, await fetchJob('chat'))
  const next = (await (await api(`/conversations/${conversation.id}`)).json()) as SavedConversation
  assert.deepEqual(
    next.messages.map((message) => message.position),
    [1, 2, 3, 4, 5, 6],
  )
})
test('无效任务参数被拒绝，不创建任务或消耗额度', async () => {
  assert.equal(
    (await api('/exports', 'POST', { formulaVersionId: 'bad', requestKey: randomUUID() })).status,
    400,
  )
  assert.equal(
    (
      await api('/recognitions', 'POST', {
        fileId: imageId,
        mode: 'invalid',
        requestKey: randomUUID(),
      })
    ).status,
    400,
  )
  assert.equal(
    (await api('/conversations', 'POST', { formulaVersionId: 'bad', requestKey: randomUUID() }))
      .status,
    400,
  )
  assert.equal(
    (
      await api(`/conversations/${conversation.id}/messages`, 'POST', {
        question: ' ',
        requestKey: randomUUID(),
      })
    ).status,
    400,
  )
  assert.equal(
    (await api('/exports', 'POST', { formulaVersionId: randomUUID(), requestKey: randomUUID() }))
      .status,
    404,
  )
})

async function freshChat(question = '流式测试') {
  const created = await api('/conversations', 'POST', {
    formulaVersionId: versionId,
    requestKey: randomUUID(),
  })
  assert.equal(created.status, 200)
  const saved = (await created.json()) as SavedConversation
  const result = await api(`/conversations/${saved.id}/messages`, 'POST', {
    question,
    requestKey: randomUUID(),
  })
  assert.equal(result.status, 202)
  return { saved, turn: (await result.json()) as TaskState, job: await fetchJob('chat') }
}
async function waitForPartial(id: string) {
  for (let count = 0; count < 100; count++) {
    const turn = await db.chatTurn.findUniqueOrThrow({ where: { id } })
    if (turn.partialContent) return turn
    await delay(20)
  }
  assert.fail('没有观察到持久化部分回答')
}
test('SSE真实读取持久化片段，完成只保存一条回答，来源为真实适配器', async () => {
  const fixture = await freshChat()
  const stream = await api(`/conversations/${fixture.saved.id}/events`)
  assert.equal(stream.status, 200)
  assert.match(stream.headers.get('content-type') ?? '', /text\/event-stream/)
  const text = stream.text()
  const adapter: ChatAdapter = {
    isMock: false,
    model: 'fixture-stream',
    async *stream(_input, signal) {
      yield { text: '第一段' }
      await delay(900, undefined, { signal })
      yield { text: '第二段' }
      await delay(900, undefined, { signal })
      yield { text: '', finishReason: 'stop' }
    },
  }
  await processChat(db, boss, fixture.job, adapter)
  const events = await text
  assert.ok(events.includes('第一段'))
  assert.ok(events.includes('PROCESSING'))
  assert.ok(events.includes('COMPLETED'))
  const messages = await db.chatMessage.findMany({
    where: { turnId: fixture.turn.id, role: 'ASSISTANT' },
  })
  assert.equal(messages.length, 1)
  assert.equal(messages[0]?.content, '第一段第二段')
  assert.equal(messages[0]?.isMock, false)
})
test('未登录和他人的SSE、停止接口均不能访问', async () => {
  const fixture = await freshChat()
  const events = `/conversations/${fixture.saved.id}/events`
  assert.equal((await fetch(`${base}/api/account${events}`)).status, 401)
  assert.equal((await api(events, 'GET', undefined, 1)).status, 404)
  const stop = `/conversations/${fixture.saved.id}/turns/${fixture.turn.id}/cancel`
  assert.equal((await api(stop, 'POST', undefined, 1)).status, 404)
  assert.equal((await api(stop, 'POST', undefined, 0, 'https://untrusted.invalid')).status, 403)
  assert.equal((await api(stop, 'POST')).status, 200)
})
test('停止流式任务保留已生成片段，不允许失效Worker再写入或保存完整回答', async () => {
  const fixture = await freshChat()
  const adapter: ChatAdapter = {
    isMock: false,
    model: 'fixture-cancel',
    async *stream(_input, signal) {
      yield { text: '已生成的片段' }
      await delay(4000, undefined, { signal })
      yield { text: '不应保存', finishReason: 'stop' }
    },
  }
  const running = processChat(db, boss, fixture.job, adapter).then(
    () => null,
    (error) => error,
  )
  await waitForPartial(fixture.turn.id)
  const stopped = await api(
    `/conversations/${fixture.saved.id}/turns/${fixture.turn.id}/cancel`,
    'POST',
  )
  assert.equal(stopped.status, 200)
  assert.ok((await running) instanceof LostJobClaim)
  await assert.rejects(saveChatProgress(db, boss, fixture.job, '旧Worker覆盖'), LostJobClaim)
  const messages = await db.chatMessage.findMany({
    where: { turnId: fixture.turn.id, role: 'ASSISTANT' },
  })
  assert.equal(messages.length, 1)
  assert.equal(messages[0]?.status, 'FAILED')
  assert.ok(messages[0]?.content.includes('已生成的片段'))
  assert.ok(!messages[0]?.content.includes('不应保存'))
})
test('缺少真实密钥首轮即明确失败，不重试或伪造模拟回答', async () => {
  const fixture = await freshChat()
  const adapter = createDeepSeekAdapter({
    provider: 'deepseek',
    apiKey: '',
    model: 'fixture-model',
    baseURL: 'https://api.deepseek.com',
  })
  await processChat(db, boss, fixture.job, adapter)
  const turn = await db.chatTurn.findUniqueOrThrow({ where: { id: fixture.turn.id } })
  assert.equal(turn.status, 'FAILED')
  assert.equal(turn.attemptCount, 1)
  const message = await db.chatMessage.findFirstOrThrow({
    where: { turnId: fixture.turn.id, role: 'ASSISTANT' },
  })
  assert.equal(message.isMock, false)
  assert.ok(message.content.includes('密钥尚未配置'))
})
test('暂时失败由队列重试，旧片段清空，最终回答和额度不重复', async () => {
  const fixture = await freshChat()
  const before = await db.dailyUsage.findFirstOrThrow({
    where: { ownerId: owners[0], kind: 'CHAT' },
  })
  const failure: ChatAdapter = {
    isMock: false,
    model: 'fixture-retry',
    async *stream() {
      yield { text: '旧片段' }
      throw new InferenceFailure('RATE_LIMIT', '暂时繁忙', true)
    },
  }
  await assert.rejects(processChat(db, boss, fixture.job, failure))
  await boss.fail(fixture.job.name, { id: fixture.job.id, retryCount: fixture.job.retryCount })
  const retry = await fetchJob('chat')
  const success: ChatAdapter = {
    isMock: false,
    model: 'fixture-retry',
    async *stream() {
      yield { text: '重试新正文', finishReason: 'stop' }
    },
  }
  await processChat(db, boss, retry, success)
  const turn = await db.chatTurn.findUniqueOrThrow({ where: { id: fixture.turn.id } })
  assert.equal(turn.attemptCount, 2)
  assert.equal(turn.partialContent, '重试新正文')
  assert.equal(await db.chatMessage.count({ where: { turnId: turn.id, role: 'ASSISTANT' } }), 1)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: owners[0], kind: 'CHAT' } })).used,
    before.used,
  )
})
test('上游流未正常结束时保存失败片段，不标为完整回答', async () => {
  const fixture = await freshChat()
  const truncated: ChatAdapter = {
    isMock: false,
    model: 'fixture-truncated',
    async *stream() {
      yield { text: '只生成一半' }
    },
  }
  await processChat(db, boss, fixture.job, truncated)
  const turn = await db.chatTurn.findUniqueOrThrow({ where: { id: fixture.turn.id } })
  assert.equal(turn.status, 'FAILED')
  const answer = await db.chatMessage.findFirstOrThrow({
    where: { turnId: turn.id, role: 'ASSISTANT' },
  })
  assert.equal(answer.status, 'FAILED')
  assert.match(answer.content, /回答未完成/)
})

test('R7 刷新失败任务和重放旧请求不扣额，新键重试只创建一个新任务', async () => {
  const used = async () =>
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: owners[0], kind: 'RECOGNITION' } }))
      .used
  const before = await used()
  for (let i = 0; i < 3; i++) {
    const response = await api(`/tasks/${failedRecognition.id}`)
    assert.equal(response.status, 200)
    assert.equal(((await response.json()) as RecognitionTaskState).status, 'FAILED')
  }
  const original = await api('/recognitions', 'POST', {
    fileId: imageId,
    mode: 'printed',
    requestKey: failedRecognition.requestKey,
  })
  assert.equal(original.status, 202)
  assert.equal(((await original.json()) as RecognitionTaskState).id, failedRecognition.id)
  assert.equal(await used(), before)
  const body = { fileId: imageId, mode: 'printed', requestKey: randomUUID() }
  const replies = await Promise.all([
    api('/recognitions', 'POST', body),
    api('/recognitions', 'POST', body),
  ])
  assert.deepEqual(
    replies.map((r) => r.status),
    [202, 202],
  )
  const tasks = await Promise.all(replies.map((r) => r.json() as Promise<RecognitionTaskState>))
  assert.equal(tasks[0]!.id, tasks[1]!.id)
  assert.notEqual(tasks[0]!.id, failedRecognition.id)
  assert.equal(await used(), before + 1)
  await processRecognition(db, boss, store, await fetchJob('recognition'))
  const result = await api(`/tasks/${tasks[0]!.id}`)
  const completed = (await result.json()) as RecognitionTaskState
  assert.equal(completed.status, 'COMPLETED')
  assert.ok(completed.formulaId)
  assert.equal(await used(), before + 1)
})

test('R8 SSE 断开重连与重复停止不新增轮次或额度，旧 GET 不能覆盖停止结果', async () => {
  const fixture = await freshChat('R8 网络恢复与停止测试')
  const used = async () =>
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: owners[0], kind: 'CHAT' } })).used
  const before = await used()
  const old = (await (await api(`/conversations/${fixture.saved.id}`)).json()) as SavedConversation
  for (let i = 0; i < 2; i++) {
    const stream = await api(`/conversations/${fixture.saved.id}/events`)
    assert.equal(stream.status, 200)
    const reader = stream.body!.getReader()
    const first = await reader.read()
    assert.match(new TextDecoder().decode(first.value), /event: snapshot/)
    await reader.cancel()
  }
  const responses = await Promise.all([
    api(`/conversations/${fixture.saved.id}/turns/${fixture.turn.id}/cancel`, 'POST'),
    api(`/conversations/${fixture.saved.id}/turns/${fixture.turn.id}/cancel`, 'POST'),
  ])
  assert.deepEqual(
    responses.map((r) => r.status),
    [200, 200],
  )
  const stopped = (await responses[0]!.json()) as SavedConversation
  assert.equal(stopped.currentTurn?.status, 'FAILED')
  assert.equal(acceptConversationSnapshot(stopped, old), stopped)
  const replay = await db.chatTurn.findUniqueOrThrow({ where: { id: fixture.turn.id } })
  const replayResponse = await api(`/conversations/${fixture.saved.id}/messages`, 'POST', {
    question: replay.question,
    requestKey: replay.requestKey,
  })
  assert.equal(replayResponse.status, 202)
  assert.equal(((await replayResponse.json()) as TaskState).id, fixture.turn.id)
  assert.equal(await used(), before)
  assert.equal(await db.chatTurn.count({ where: { conversationId: fixture.saved.id } }), 1)
  assert.equal(
    await db.chatMessage.count({ where: { turnId: fixture.turn.id, role: 'ASSISTANT' } }),
    1,
  )
  const terminal = await api(`/conversations/${fixture.saved.id}/events`)
  assert.match(await terminal.text(), /已停止生成/)
})
