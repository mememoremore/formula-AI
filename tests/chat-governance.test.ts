import { testEnvironment } from './support/integration.ts'
import { createTestQueueClient } from './support/queue-client'
import test, { before, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { createDatabaseClient } from '../server/database/client'
import { createAuthentication } from '../server/auth/config'
import { createFormula, appendFormulaVersion } from '../server/database/formulas'
import {
  createConversation,
  readConversation,
  submitChatTurn,
} from '../server/database/conversations'
import { defaultUsageLimits } from '../server/database/usage'
import { processChat } from '../server/worker/chat'
import { beginAttempt } from '../server/worker/lifecycle'
import { cancelChatTurn, saveChatProgress } from '../server/database/chat-progress'
import { reconcileTask } from '../server/database/task-reconciliation'
import { reconcileChatCalls, recordCallObservation } from '../server/database/chat-calls'
import { readPromptHistory } from '../server/database/chat-history'
import { queues, type JobPayload } from '../server/queue/client'
import { LostJobClaim } from '../server/queue/claim'
import { InferenceFailure } from '../server/inference/failure'
import { acceptConversationSnapshot } from '../app/utils/chat-state'
import type { Prisma } from '../server/generated/prisma/client'
import { Client } from 'pg'
import { readFile } from 'node:fs/promises'

const db = createDatabaseClient(testEnvironment.databaseUrl),
  db2 = createDatabaseClient(testEnvironment.databaseUrl)
const boss = createTestQueueClient()
let ownerId = '',
  cookie = '',
  foreignId = ''
before(async () => {
  await boss.start()
  const auth = createAuthentication(db, {
    baseURL: testEnvironment.apiUrl,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: false,
  })
  const registered = await auth.api.signUpEmail({
    body: {
      name: 'R14隔离测试',
      email: `r14-${randomUUID()}@formula.test`,
      password: randomUUID() + 'aA!',
    },
    returnHeaders: true,
  })
  ownerId = registered.response.user.id
  cookie = registered.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  foreignId = (
    await db.user.create({
      data: { email: `r14-b-${randomUUID()}@formula.test`, displayName: '其他账号' },
    })
  ).id
})
after(async () => {
  const jobs = await boss.findJobs(queues.chat, { data: { ownerId }, limit: 1000 })
  if (jobs.length)
    await boss.deleteJob(
      queues.chat,
      jobs.map((j) => j.id),
    )
  for (const id of [ownerId, foreignId]) if (id) await db.user.delete({ where: { id } })
  await Promise.all([boss.stop(), db.$disconnect(), db2.$disconnect()])
})
async function make() {
  const c = await createConversation(db, ownerId, null, randomUUID())
  const input = { ownerId, conversationId: c.id, question: '当前问题', requestKey: randomUUID() }
  const turn = await submitChatTurn(db, boss, defaultUsageLimits, input)
  const [job] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(job?.data.taskId, turn.id)
  return { c, turn, job: job!, input }
}
test('真实迁移主体兼容旧记录；DDL后故障在事务内完整回滚', async () => {
  const client = new Client({ connectionString: testEnvironment.databaseUrl })
  const schema = 'r14_probe_' + randomUUID().replaceAll('-', '')
  const body = (
    await readFile('prisma/migrations/20261028000000_chat_revision_calls/migration.sql', 'utf8')
  )
    .replace(/^BEGIN;\s*/, '')
    .replace(/COMMIT;\s*$/, '')
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}", public;
      CREATE TABLE conversations (id uuid PRIMARY KEY, "ownerId" uuid, "formulaVersionId" uuid);
      CREATE TABLE chat_turns (id uuid, "ownerId" uuid, UNIQUE(id,"ownerId"));
      CREATE TABLE formulas (id uuid PRIMARY KEY, "ownerId" uuid, title text);
      CREATE TABLE formula_versions (id uuid PRIMARY KEY, "ownerId" uuid, "formulaId" uuid);
      INSERT INTO conversations(id,"ownerId") VALUES (gen_random_uuid(),gen_random_uuid());`)
    await client.query(body)
    assert.equal(
      (await client.query('SELECT revision::text FROM conversations')).rows[0].revision,
      '0',
    )
    await assert.rejects(client.query('SELECT 1 / 0'))
    await client.query('ROLLBACK')
    assert.equal(
      (await client.query('SELECT 1 FROM pg_namespace WHERE nspname=$1', [schema])).rowCount,
      0,
    )
  } finally {
    await client.query('ROLLBACK')
    await client.end()
  }
})
test('修订号非负约束、幂等提交不递增、跨账号读取拒绝', async () => {
  const f = await make()
  const before = await readConversation(db, ownerId, f.c.id)
  assert.equal(before.revision, '1')
  await submitChatTurn(db, boss, defaultUsageLimits, f.input)
  assert.equal((await readConversation(db, ownerId, f.c.id)).revision, before.revision)
  await assert.rejects(db.conversation.update({ where: { id: f.c.id }, data: { revision: -1n } }))
  await assert.rejects(readConversation(db, foreignId, f.c.id))
  await cancelChatTurn(db, boss, ownerId, f.c.id, f.turn.id)
})
test('只读完整成功问答；失败、停止、旧无轮次记录和破损配对不进入Prompt', async () => {
  const c = await createConversation(db, ownerId, null, randomUUID())
  for (const [i, status] of (['COMPLETED', 'FAILED', 'FAILED', 'COMPLETED'] as const).entries()) {
    const turn = await db.chatTurn.create({
      data: {
        ownerId,
        conversationId: c.id,
        question: `Q${i}`,
        requestKey: randomUUID(),
        status,
        finishedAt: new Date(),
      },
    })
    await db.chatMessage.create({
      data: {
        ownerId,
        conversationId: c.id,
        turnId: turn.id,
        position: i * 2 + 1,
        role: 'USER',
        content: `Q${i}`,
      },
    })
    if (i !== 3)
      await db.chatMessage.create({
        data: {
          ownerId,
          conversationId: c.id,
          turnId: turn.id,
          position: i * 2 + 2,
          role: 'ASSISTANT',
          content: `A${i}`,
          status: status === 'COMPLETED' ? 'COMPLETED' : 'FAILED',
        },
      })
  }
  await db.chatMessage.create({
    data: { ownerId, conversationId: c.id, position: 9, role: 'USER', content: '旧无归属记录' },
  })
  assert.deepEqual(
    (await readPromptHistory(db, ownerId, c.id)).map((m) => m.content),
    ['Q0', 'A0'],
  )
  assert.equal((await readConversation(db, ownerId, c.id)).messages.length, 8)
})
test('历史顺序依据消息position，不能由同毫秒时间或UUID决定', async () => {
  const c = await createConversation(db, ownerId, null, randomUUID())
  const time = new Date('2026-01-01T00:00:00Z')
  for (let index = 0; index < 11; index++) {
    const turn = await db.chatTurn.create({
      data: {
        ownerId,
        conversationId: c.id,
        question: `Q${index}`,
        requestKey: randomUUID(),
        status: 'COMPLETED',
        createdAt: time,
        finishedAt: time,
      },
    })
    await db.chatMessage.createMany({
      data: [
        {
          ownerId,
          conversationId: c.id,
          turnId: turn.id,
          position: 2 * index + 1,
          role: 'USER',
          content: `Q${index}`,
        },
        {
          ownerId,
          conversationId: c.id,
          turnId: turn.id,
          position: 2 * index + 2,
          role: 'ASSISTANT',
          content: `A${index}`,
        },
      ],
    })
  }
  assert.deepEqual(
    (await readPromptHistory(db, ownerId, c.id)).map((m) => m.content),
    Array.from({ length: 9 }, (_, i) => [`Q${i + 2}`, `A${i + 2}`]).flat(),
  )
})
test('两次模型替身尝试保留独立审计，仅扣一次额度；已提交结果不被迟到失败改写', async () => {
  const used = await db.dailyUsage.findFirst({ where: { ownerId, kind: 'CHAT' } })
  const f = await make()
  await assert.rejects(
    processChat(db, boss, f.job, {
      isMock: true,
      model: 'failure',
      async *stream() {
        yield { text: '部分回答' }
        throw new InferenceFailure('UPSTREAM', '受控断流', true)
      },
    }),
  )
  const [retry] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(retry?.data.taskId, f.turn.id)
  const old = await readConversation(db, ownerId, f.c.id)
  let questionCount = 0
  await processChat(db, boss, retry!, {
    isMock: true,
    model: 'success',
    async *stream(input) {
      questionCount = input.messages.filter((m) => m.content === '当前问题').length
      yield { text: '完整回答', finishReason: 'stop' }
    },
  })
  const latest = await readConversation(db, ownerId, f.c.id)
  assert.ok(BigInt(latest.revision!) > BigInt(old.revision!))
  assert.equal(acceptConversationSnapshot(latest, old), latest)
  assert.equal(questionCount, 1)
  const calls = await db.chatCallAttempt.findMany({
    where: { turnId: f.turn.id },
    orderBy: { workerAttempt: 'asc' },
  })
  assert.deepEqual(
    calls.map((c) => c.status),
    ['FAILED', 'SUCCEEDED'],
  )
  assert.equal(calls[0]!.resultCommittedAt, null)
  assert.ok(calls[1]!.resultCommittedAt)
  assert.ok(
    calls.every(
      (c) => c.usageSource === 'MOCK' && c.totalTokens === null && c.transportInvokedAt === null,
    ),
  )
  await assert.rejects(
    db.chatCallAttempt.update({ where: { id: calls[0]!.id }, data: { totalTokens: 1 } }),
  )
  await assert.rejects(
    db.chatCallAttempt.update({ where: { id: calls[0]!.id }, data: { workerAttempt: 0 } }),
  )
  await assert.rejects(
    db.chatCallAttempt.update({ where: { id: calls[0]!.id }, data: { ownerId: foreignId } }),
  )
  await recordCallObservation(db, calls[1]!.id, { status: 'FAILED' })
  assert.equal(
    (await db.chatCallAttempt.findUniqueOrThrow({ where: { id: calls[1]!.id } })).status,
    'SUCCEEDED',
  )
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used,
    (used?.used ?? 0) + 1,
  )
  await assert.rejects(saveChatProgress(db, boss, f.job, '失效旧执行者'), LostJobClaim)
})
test('受控供应商用量和transport观测可持久化；同attempt不重复创建审计', async () => {
  const f = await make()
  await processChat(db, boss, f.job, {
    isMock: false,
    model: 'local-controlled',
    async *stream(_input, _signal, observer) {
      await observer!.beforeDispatch()
      await observer!.invoked()
      await observer!.responded(200, 'fixture-request')
      yield {
        text: '受控回答',
        finishReason: 'stop',
        usage: { inputTokens: 11, outputTokens: 7, totalTokens: 18 },
      }
    },
  })
  const call = await db.chatCallAttempt.findFirstOrThrow({ where: { turnId: f.turn.id } })
  assert.ok(call.dispatchIntentAt && call.transportInvokedAt && call.responseObservedAt)
  assert.equal(call.usageSource, 'PROVIDER_REPORTED')
  assert.equal(call.totalTokens, 18)
  assert.equal(call.providerRequestId, 'fixture-request')
  await processChat(db, boss, f.job, {
    isMock: true,
    model: 'must-not-call',
    async *stream() {
      assert.fail('重复Worker不应调用模型')
    },
  })
  assert.equal(await db.chatCallAttempt.count({ where: { turnId: f.turn.id } }), 1)
  await assert.rejects(
    db.chatCallAttempt.create({
      data: {
        ownerId,
        turnId: f.turn.id,
        workerAttempt: 1,
        queueJobId: f.job.id,
        provider: 'mock',
        model: 'duplicate',
        isMock: true,
      },
    }),
  )
})
test('提交成功后响应丢失，迟到异常不改写业务终态或调用审计', async () => {
  const f = await make()
  let injected = false
  const lostResponse = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return async (
          action: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { timeout?: number },
        ) => {
          const result = await target.$transaction(action, options)
          if (
            !injected &&
            (await target.chatCallAttempt.count({
              where: { turnId: f.turn.id, resultCommittedAt: { not: null } },
            }))
          ) {
            injected = true
            throw new Error('injected lost commit response')
          }
          return result
        }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  await assert.rejects(
    processChat(lostResponse, boss, f.job, {
      isMock: true,
      model: 'commit-lost',
      async *stream() {
        yield { text: '已提交答案', finishReason: 'stop' }
      },
    }),
    LostJobClaim,
  )
  assert.equal((await readConversation(db, ownerId, f.c.id)).currentTurn?.status, 'COMPLETED')
  const call = await db.chatCallAttempt.findFirstOrThrow({ where: { turnId: f.turn.id } })
  assert.equal(call.status, 'SUCCEEDED')
  assert.ok(call.resultCommittedAt)
  assert.equal(call.resultDiscardedAt, null)
})
test('合法重试清空片段递增revision，取消与完成互斥，重复停止不改revision', async () => {
  const f = await make()
  await beginAttempt(db, 'chat', f.job)
  await saveChatProgress(db, boss, f.job, '已有片段')
  const before = await readConversation(db, ownerId, f.c.id)
  await saveChatProgress(db, boss, f.job, '')
  const reset = await readConversation(db, ownerId, f.c.id)
  assert.equal(acceptConversationSnapshot(before, reset), reset)
  await saveChatProgress(db, boss, f.job, '')
  assert.equal((await readConversation(db, ownerId, f.c.id)).revision, reset.revision)
  await cancelChatTurn(db, boss, ownerId, f.c.id, f.turn.id)
  const stopped = await readConversation(db, ownerId, f.c.id)
  await cancelChatTurn(db, boss, ownerId, f.c.id, f.turn.id)
  assert.equal((await readConversation(db, ownerId, f.c.id)).revision, stopped.revision)
  await assert.rejects(saveChatProgress(db, boss, f.job, '迟到'), LostJobClaim)
  assert.equal(stopped.currentTurn?.status, 'FAILED')
})
test('真实失败和用户停止后继续追问，保留失败展示但不传入后续模型', async () => {
  const f = await make()
  await processChat(db, boss, f.job, {
    isMock: true,
    model: 'fatal',
    async *stream() {
      yield { text: '失败片段' }
      throw new InferenceFailure('INVALID_INPUT', '受控不完整回答', false)
    },
  })
  const stopped = await submitChatTurn(db, boss, defaultUsageLimits, {
    ownerId,
    conversationId: f.c.id,
    question: '停止问题',
    requestKey: randomUUID(),
  })
  const [job] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(job?.data.taskId, stopped.id)
  await assert.rejects(
    processChat(db, boss, job!, {
      isMock: true,
      model: 'stop',
      async *stream() {
        yield { text: '停止片段' }
        await cancelChatTurn(db, boss, ownerId, f.c.id, stopped.id)
        throw new LostJobClaim()
      },
    }),
    LostJobClaim,
  )
  assert.equal(
    (await db.chatCallAttempt.findFirstOrThrow({ where: { turnId: stopped.id } })).status,
    'CANCELLED',
  )
  const followup = await submitChatTurn(db, boss, defaultUsageLimits, {
    ownerId,
    conversationId: f.c.id,
    question: '继续追问',
    requestKey: randomUUID(),
  })
  const [next] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(next?.data.taskId, followup.id)
  await processChat(db, boss, next!, {
    isMock: true,
    model: 'followup',
    async *stream(input) {
      assert.deepEqual(input.messages, [{ role: 'user', content: '继续追问' }])
      yield { text: '完整回答', finishReason: 'stop' }
    },
  })
  const snapshot = await readConversation(db, ownerId, f.c.id)
  assert.equal(snapshot.messages.length, 6)
  assert.equal(snapshot.messages.filter((m) => m.status === 'FAILED').length, 2)
  assert.deepEqual(
    (await readPromptHistory(db, ownerId, f.c.id)).map((m) => m.content),
    ['继续追问', '完整回答'],
  )
})
test('后台并发核对遗留调用，不按TTL猜测费用，不重复改变业务终态', async () => {
  const f = await make()
  await beginAttempt(db, 'chat', f.job)
  const call = await db.chatCallAttempt.create({
    data: {
      ownerId,
      turnId: f.turn.id,
      workerAttempt: 1,
      queueJobId: f.job.id,
      provider: 'mock',
      model: 'crash',
      isMock: true,
    },
  })
  await reconcileChatCalls(db, 100)
  assert.equal(
    (await db.chatCallAttempt.findUniqueOrThrow({ where: { id: call.id } })).status,
    'PREPARED',
  )
  await boss.cancel(queues.chat, f.job.id)
  await Promise.all([reconcileChatCalls(db, 100), reconcileChatCalls(db2, 100)])
  const uncertain = await db.chatCallAttempt.findUniqueOrThrow({ where: { id: call.id } })
  assert.equal(uncertain.status, 'UNKNOWN')
  assert.equal(uncertain.totalTokens, null)
  await Promise.all([
    reconcileTask(db, boss, 'chat', ownerId, f.turn.id),
    reconcileTask(db2, boss, 'chat', ownerId, f.turn.id),
  ])
  const terminal = await readConversation(db, ownerId, f.c.id)
  await reconcileChatCalls(db, 100)
  await reconcileTask(db, boss, 'chat', ownerId, f.turn.id)
  assert.equal((await readConversation(db, ownerId, f.c.id)).revision, terminal.revision)
})
test('RepeatableRead DTO不会将旧revision与并发新片段拼接', async () => {
  const f = await make()
  await beginAttempt(db, 'chat', f.job)
  await saveChatProgress(db, boss, f.job, '旧片段')
  const expected = await readConversation(db, ownerId, f.c.id)
  let signal!: () => void, release!: () => void
  const captured = new Promise<void>((r) => (signal = r)),
    gate = new Promise<void>((r) => (release = r))
  const hooked = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (
          action: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { isolationLevel?: 'RepeatableRead' },
        ) =>
          target.$transaction(async (tx) => {
            const intercepted = new Proxy(tx, {
              get(t, k) {
                if (k === 'conversation')
                  return new Proxy(t.conversation, {
                    get(d, m) {
                      if (m === 'findFirst')
                        return async (...args: unknown[]) => {
                          const value = await Reflect.apply(d.findFirst, d, args)
                          signal()
                          await gate
                          return value
                        }
                      return Reflect.get(d, m)
                    },
                  })
                return Reflect.get(t, k)
              },
            })
            return action(intercepted)
          }, options)
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const pending = readConversation(hooked, ownerId, f.c.id)
  await captured
  try {
    await saveChatProgress(db2, boss, f.job, '新片段')
  } finally {
    release()
  }
  assert.deepEqual(await pending, expected)
  assert.equal((await readConversation(db, ownerId, f.c.id)).currentTurn?.partialContent, '新片段')
  await cancelChatTurn(db, boss, ownerId, f.c.id, f.turn.id)
})
test('标题触发器：多关联会话、并发Serializable保存与固定版本保持正确', async () => {
  const formula = await createFormula(db, {
    ownerId,
    title: '原名',
    latex: 'x=1',
    origin: 'DEMO',
    isMock: true,
  })
  const conversations = await Promise.all(
    Array.from({ length: 60 }, () =>
      createConversation(db, ownerId, formula.version.id, randomUUID()),
    ),
  )
  const start = performance.now()
  const outcomes = await Promise.allSettled(
    ['改名A', '改名B'].map((title) =>
      appendFormulaVersion(db, {
        ownerId,
        formulaId: formula.formula.id,
        expectedTitle: '原名',
        expectedVersionId: formula.version.id,
        latex: 'x=1',
        title,
      }),
    ),
  )
  assert.equal(outcomes.filter((o) => o.status === 'fulfilled').length, 1)
  const rejected = outcomes.find((o) => o.status === 'rejected')
  assert.ok(rejected?.status === 'rejected' && rejected.reason.code === 'VERSION_CONFLICT')
  const winner = await db.formula.findUniqueOrThrow({ where: { id: formula.formula.id } })
  for (const c of conversations) {
    const snapshot = await readConversation(db, ownerId, c.id)
    assert.equal(snapshot.context?.title, winner.title)
    assert.equal(snapshot.revision, '1')
    assert.equal(snapshot.context?.id, formula.version.id)
    assert.equal(snapshot.context?.latex, 'x=1')
  }
  console.info(
    `R14 title-trigger: 60 conversations, competing saves elapsed ${Math.round(performance.now() - start)}ms (includes verification reads)`,
  )
})
test('标题触发器与实际Worker片段写入竞争，无反向锁；失败事务revision整体回滚', async () => {
  const formula = await createFormula(db, {
    ownerId,
    title: '锁顺序',
    latex: 'x=1',
    origin: 'DEMO',
    isMock: true,
  })
  const c = await createConversation(db, ownerId, formula.version.id, randomUUID())
  const turn = await submitChatTurn(db, boss, defaultUsageLimits, {
    ownerId,
    conversationId: c.id,
    question: '锁测试',
    requestKey: randomUUID(),
  })
  const [job] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(job?.data.taskId, turn.id)
  await beginAttempt(db, 'chat', job!)
  const rev = (await readConversation(db, ownerId, c.id)).revision
  await assert.rejects(
    db.$transaction(async (tx) => {
      await tx.conversation.update({ where: { id: c.id }, data: { revision: { increment: 1 } } })
      throw new Error('rollback')
    }),
  )
  assert.equal((await readConversation(db, ownerId, c.id)).revision, rev)
  await Promise.all([
    appendFormulaVersion(db2, {
      ownerId,
      formulaId: formula.formula.id,
      expectedVersionId: formula.version.id,
      expectedTitle: '锁顺序',
      title: '新标题',
      latex: 'x=1',
    }),
    saveChatProgress(db, boss, job!, '竞争片段'),
  ])
  const latest = await readConversation(db, ownerId, c.id)
  assert.equal(latest.context?.title, '新标题')
  assert.equal(latest.currentTurn?.partialContent, '竞争片段')
  assert.equal(BigInt(latest.revision!), BigInt(rev!) + 2n)
  await cancelChatTurn(db, boss, ownerId, c.id, turn.id)
})
test('创建绑定会话与标题改名交错，Serializable重试覆盖新插入会话', async () => {
  const formula = await createFormula(db, {
    ownerId,
    title: '创建前',
    latex: 'x=1',
    origin: 'DEMO',
    isMock: true,
  })
  let signal!: () => void,
    release!: () => void,
    intercepted = false
  const captured = new Promise<void>((r) => (signal = r)),
    gate = new Promise<void>((r) => (release = r))
  const paused = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return (
          action: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { isolationLevel?: 'Serializable' },
        ) =>
          target.$transaction(
            (tx) =>
              action(
                new Proxy(tx, {
                  get(t, k) {
                    if (k === 'conversation')
                      return new Proxy(t.conversation, {
                        get(d, m) {
                          if (m === 'create')
                            return async (...args: unknown[]) => {
                              if (!intercepted) {
                                intercepted = true
                                signal()
                                await gate
                              }
                              return Reflect.apply(d.create, d, args)
                            }
                          return Reflect.get(d, m)
                        },
                      })
                    return Reflect.get(t, k)
                  },
                }),
              ),
            options,
          )
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  const creating = createConversation(paused, ownerId, formula.version.id, randomUUID())
  await captured
  // 用真实阻塞事实确认改名已到UPDATE，而不是靠固定延时推断交错。
  const renaming = appendFormulaVersion(db2, {
    ownerId,
    formulaId: formula.formula.id,
    expectedVersionId: formula.version.id,
    expectedTitle: '创建前',
    title: '创建后',
    latex: 'x=1',
  })
  const deadline = Date.now() + 4000
  try {
    while (true) {
      const blocked = await db.$queryRaw<
        { blocked: boolean }[]
      >`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event_type='Lock' AND query LIKE '%UPDATE%formulas%') AS blocked`
      if (blocked[0]?.blocked) break
      assert.ok(Date.now() < deadline, '改名应等待创建持有的公式锁')
      await delay(10)
    }
  } finally {
    release()
  }
  const [c] = await Promise.all([creating, renaming])
  const snapshot = await readConversation(db, ownerId, c.id)
  assert.equal(snapshot.context?.title, '创建后')
  assert.equal(snapshot.revision, '1')
  assert.equal(snapshot.context?.id, formula.version.id)
})
test('真实HTTP GET/停止/v1-v2 SSE兼容、心跳、重连不新建任务', async () => {
  const f = await make()
  const path = `${testEnvironment.apiUrl}/api/account/conversations/${f.c.id}`
  const response = await fetch(path, { headers: { cookie, 'X-Conversation-Protocol': '2' } })
  assert.equal(response.status, 200)
  const get = await response.json()
  assert.equal(get.protocolVersion, 2)
  assert.equal(get.revision, '1')
  assert.equal((await fetch(path, { headers: { cookie: '' } })).status, 401)
  for (const suffix of ['', '?protocol=2']) {
    const controller = new AbortController()
    const response = await fetch(path + '/events' + suffix, {
      headers: { cookie },
      signal: AbortSignal.any([controller.signal, AbortSignal.timeout(25000)]),
    })
    assert.equal(response.status, 200)
    const reader = response.body!.getReader()
    const started = performance.now()
    let text = ''
    try {
      while (!text.includes('event: snapshot') || (suffix && performance.now() - started < 16000)) {
        const chunk = await reader.read()
        assert.ok(!chunk.done)
        text += new TextDecoder().decode(chunk.value)
      }
    } finally {
      controller.abort()
      await reader.cancel().catch(() => {})
    }
    assert.match(text, /"revision":"1"/)
    if (suffix) {
      assert.ok((text.match(/event: heartbeat/g)?.length ?? 0) >= 4, '超过15秒无正文也持续心跳')
      assert.equal(text.match(/event: snapshot/g)?.length, 1, '无变化不重复发送完整v2快照')
    }
  }
  assert.equal(await db.chatTurn.count({ where: { conversationId: f.c.id } }), 1)
  const stopped = await fetch(path + `/turns/${f.turn.id}/cancel`, {
    method: 'POST',
    headers: { cookie, origin: testEnvironment.apiUrl, 'X-Conversation-Protocol': '2' },
  })
  assert.equal(stopped.status, 200)
  assert.ok(BigInt((await stopped.json()).revision) > BigInt(get.revision))
})
