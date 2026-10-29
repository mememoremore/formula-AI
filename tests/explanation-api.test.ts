import { spawnSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import { reconcileTask } from '../server/database/task-reconciliation'
import { reconcileChatCalls } from '../server/database/chat-calls'
import { testEnvironment } from './support/integration.ts'
import { createTestQueueClient } from './support/queue-client'
import { before, after, test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createDatabaseClient } from '../server/database/client'
import { createAuthentication } from '../server/auth/config'
import { createFormula, appendFormulaVersion } from '../server/database/formulas'
import { submitExplanation, readExplanationHistory } from '../server/database/explanations'
import { readConversation, submitChatTurn } from '../server/database/conversations'
import { readPromptHistory } from '../server/database/chat-history'
import { readBaseExplanation } from '../server/database/explanation-queries'
import { processChat } from '../server/worker/chat'
import { cancelChatTurn } from '../server/database/chat-progress'
import { queues, type JobPayload } from '../server/queue/client'
import { defaultUsageLimits } from '../server/database/usage'
import { explanationFixture } from './fixtures/explanation'
import {
  EXPLANATION_PROMPT_VERSION,
  EXPLANATION_QUESTION,
  explanationText,
} from '../shared/explanation'
import { InferenceFailure } from '../server/inference/failure'
import { LostJobClaim } from '../server/queue/claim'
import type { ChatAdapter } from '../server/chat/adapter'
const db = createDatabaseClient(testEnvironment.databaseUrl),
  boss = createTestQueueClient()
const base = testEnvironment.apiUrl
let ownerId = '',
  otherId = '',
  cookie = '',
  formulaId = '',
  versionId = ''
before(async () => {
  await boss.start()
  const auth = createAuthentication(db, {
    baseURL: base,
    secret: process.env.NUXT_AUTH_SECRET ?? '',
    isDevelopment: false,
  })
  const registered = await auth.api.signUpEmail({
    body: {
      name: 'R19隔离用户',
      email: `r19-${randomUUID()}@formula.test`,
      password: randomUUID() + 'aA!',
    },
    returnHeaders: true,
  })
  ownerId = registered.response.user.id
  cookie = registered.headers
    .getSetCookie()
    .map((v) => v.split(';')[0])
    .join('; ')
  otherId = (
    await db.user.create({
      data: { email: `r19-b-${randomUUID()}@formula.test`, displayName: '其他账号' },
    })
  ).id
  const formula = await createFormula(db, {
    ownerId,
    title: 'R19公式',
    latex: 'x^2-5x+6=0',
    origin: 'MANUAL',
  })
  formulaId = formula.formula.id
  versionId = formula.version.id
})
after(async () => {
  try {
    const jobs = await boss.findJobs(queues.chat, { data: { ownerId }, limit: 1000 })
    if (jobs.length)
      await boss.deleteJob(
        queues.chat,
        jobs.map((v) => v.id),
      )
    for (const id of [ownerId, otherId]) if (id) await db.user.delete({ where: { id } })
  } finally {
    await Promise.all([boss.stop(), db.$disconnect()])
  }
})
const input = () => ({ ownerId, formulaId, versionId, requestKey: randomUUID() })
const limits = { ...defaultUsageLimits, CHAT: 500 }
const good: ChatAdapter = {
  isMock: true,
  model: 'r19-controlled',
  async *stream() {
    yield { text: JSON.stringify(explanationFixture), finishReason: 'stop' }
  },
}
async function consume(turnId: string, adapter = good, expectedRetry = false) {
  const [job] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(job?.data.taskId, turnId)
  if (expectedRetry) await assert.rejects(processChat(db, boss, job!, adapter), /任务暂时处理失败/)
  else await processChat(db, boss, job!, adapter)
  return job!
}
async function api(
  path: string,
  method = 'GET',
  body?: unknown,
  withCookie = true,
  extra: Record<string, string> = {},
) {
  return fetch(base + '/api/account' + path, {
    method,
    headers: {
      origin: base,
      ...(withCookie ? { cookie } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...extra,
    },
    body: body ? JSON.stringify(body) : undefined,
  })
}
async function completed() {
  const turn = await submitExplanation(db, boss, limits, input())
  await consume(turn.id)
  return turn
}

test('加法迁移默认旧聊天类型且版本和结果身份不可变', async () => {
  const old = await db.conversation.create({ data: { ownerId, title: '旧文本' } })
  assert.equal(old.purpose, 'CHAT')
  await assert.rejects(
    db.conversation.create({ data: { ownerId, title: '非法', purpose: 'EXPLANATION' } }),
  )
  const turn = await completed()
  assert.equal(turn.promptVersion, EXPLANATION_PROMPT_VERSION)
  await assert.rejects(
    db.chatTurn.update({ where: { id: turn.id }, data: { promptVersion: 'changed' } }),
  )
  const message = await db.chatMessage.findFirstOrThrow({
    where: { turnId: turn.id, role: 'ASSISTANT' },
  })
  await assert.rejects(
    db.chatMessage.update({ where: { id: message.id }, data: { content: '篡改' } }),
  )
  await assert.rejects(
    db.conversation.update({ where: { id: turn.conversationId }, data: { purpose: 'CHAT' } }),
  )
})
test('原子创建会话首轮额度队列；同键并发仅生成一个任务', async () => {
  const value = input(),
    before = await db.dailyUsage.findFirst({ where: { ownerId, kind: 'CHAT' } })
  const turns = await Promise.all(
    Array.from({ length: 5 }, () => submitExplanation(db, boss, limits, value)),
  )
  assert.equal(new Set(turns.map((v) => v.id)).size, 1)
  assert.equal(await db.conversation.count({ where: { ownerId, requestKey: value.requestKey } }), 1)
  assert.equal(await db.chatMessage.count({ where: { turnId: turns[0]!.id } }), 1)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used,
    (before?.used ?? 0) + 1,
  )
  await consume(turns[0]!.id)
  const snapshot = await readConversation(db, ownerId, turns[0]!.conversationId)
  assert.equal(snapshot.purpose, 'EXPLANATION')
  assert.equal(snapshot.baseExplanation?.isMock, true)
  assert.equal(snapshot.baseExplanation?.modelVersion, 'r19-controlled')
  assert.deepEqual(snapshot.baseExplanation?.structured, explanationFixture)
  assert.equal(snapshot.baseExplanation?.content, explanationText(explanationFixture))
  assert.ok(BigInt(snapshot.revision!) > 0n)
  assert.equal((await submitExplanation(db, boss, limits, value)).id, turns[0]!.id)
  await assert.rejects(
    submitExplanation(db, boss, limits, { ...value, versionId: randomUUID() }),
    (e) => e instanceof Error && 'statusCode' in e && e.statusCode === 409,
  )
})
test('额度失败完整回滚，不遗留会话或轮次', async () => {
  const value = input(),
    before = await db.conversation.count({ where: { ownerId } })
  await assert.rejects(submitExplanation(db, boss, { ...limits, CHAT: 1 }, value))
  assert.equal(await db.conversation.count({ where: { ownerId } }), before)
  assert.equal(await db.chatTurn.count({ where: { ownerId, requestKey: value.requestKey } }), 0)
})
test('API鉴权、归属、幂等摘要与历史分页', async () => {
  const path = '/formulas/' + formulaId + '/explanations',
    body = { versionId, requestKey: randomUUID() }
  assert.equal((await api(path, 'POST', body, false)).status, 401)
  assert.equal((await api(path, 'POST', body, true, { 'x-account-id': otherId })).status, 403)
  assert.equal((await api(path, 'POST', { ...body, versionId: 'bad' })).status, 400)
  assert.equal((await api('/formulas/' + randomUUID() + '/explanations', 'POST', body)).status, 404)
  const response = await api(path, 'POST', body)
  assert.equal(response.status, 202)
  const task = (await response.json()) as { conversationId: string; task: { id: string } }
  await consume(task.task.id)
  const legacy = await api('/conversations/' + task.conversationId + '/events')
  assert.equal(legacy.status, 200)
  const frames = (await legacy.text())
    .split('\n')
    .filter((v) => v.startsWith('data:'))
    .map((v) => JSON.parse(v.slice(5)))
  assert.ok(
    frames.some((v) =>
      v.messages?.some(
        (m: { role: string; content: string }) =>
          m.role === 'ASSISTANT' && m.content === explanationText(explanationFixture),
      ),
    ),
  )
  assert.equal((await api(path, 'POST', body)).status, 202)
  const history = await api(path + '?versionId=' + versionId)
  assert.equal(history.status, 200)
  assert.ok(
    ((await history.json()) as { items: { id: string }[] }).items.some(
      (v) => v.id === task.conversationId,
    ),
  )
  await assert.rejects(readConversation(db, otherId, task.conversationId))
  await assert.rejects(readExplanationHistory(db, otherId, formulaId, {}))
})
test('非法或截断JSON不进入成功解释，上游成功与业务失败分别审计', async () => {
  for (const raw of ['{"schemaVersion":1', '{}']) {
    const turn = await submitExplanation(db, boss, limits, input())
    await consume(turn.id, {
      ...good,
      async *stream() {
        yield { text: raw, finishReason: 'stop' }
      },
    })
    const state = await db.chatTurn.findUniqueOrThrow({ where: { id: turn.id } })
    assert.equal(state.status, 'FAILED')
    assert.equal(state.partialContent, '')
    assert.equal(await readBaseExplanation(db, ownerId, turn.conversationId), null)
    const call = await db.chatCallAttempt.findFirstOrThrow({ where: { turnId: turn.id } })
    assert.equal(call.status, 'SUCCEEDED')
    assert.equal(call.errorCode, 'INVALID_OUTPUT')
    assert.ok(call.resultDiscardedAt)
    assert.equal(call.resultCommittedAt, null)
  }
})
test('同任务合法重试固定Prompt、不重复额度，失效旧执行者不能覆盖', async () => {
  const turn = await submitExplanation(db, boss, limits, input()),
    before = (await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used
  const old = await consume(
    turn.id,
    {
      ...good,
      async *stream(value) {
        assert.equal(value.promptVersion, EXPLANATION_PROMPT_VERSION)
        yield { text: '{"partial":' }
        throw new InferenceFailure('UPSTREAM', '受控重试', true)
      },
    },
    true,
  )
  const retry = await consume(turn.id, {
    ...good,
    async *stream(value) {
      assert.equal(value.promptVersion, EXPLANATION_PROMPT_VERSION)
      assert.equal(value.messages.length, 1)
      yield { text: JSON.stringify(explanationFixture), finishReason: 'stop' }
    },
  })
  assert.equal(retry.retryCount, 1)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used,
    before,
  )
  await processChat(db, boss, old, good).catch((e) => assert.ok(e instanceof LostJobClaim))
  assert.equal(
    (await db.chatTurn.findUniqueOrThrow({ where: { id: turn.id } })).status,
    'COMPLETED',
  )
  assert.equal(await db.chatCallAttempt.count({ where: { turnId: turn.id } }), 2)
})
test('生成中停止不保存JSON；停止后仍保留失败历史', async () => {
  const turn = await submitExplanation(db, boss, limits, input())
  const [job] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(job?.data.taskId, turn.id)
  await processChat(db, boss, job!, {
    ...good,
    async *stream() {
      yield { text: '{"schemaVersion":' }
      await cancelChatTurn(db, boss, ownerId, turn.conversationId, turn.id)
      yield { text: '1}', finishReason: 'stop' }
    },
  }).catch((e) => assert.ok(e instanceof LostJobClaim))
  const state = await readConversation(db, ownerId, turn.conversationId)
  assert.equal(state.currentTurn?.status, 'FAILED')
  assert.equal(state.baseExplanation, null)
  assert.equal(state.currentTurn.partialContent, '')
  assert.ok(
    (await readExplanationHistory(db, ownerId, formulaId, {})).items.some(
      (v) => v.id === turn.conversationId && v.status === 'FAILED',
    ),
  )
})
test('重新生成创建独立会话，旧解释可继续追问；版本更新不替换上下文', async () => {
  const a = await completed(),
    b = await completed()
  assert.notEqual(a.conversationId, b.conversationId)
  const current = await db.formula.findUniqueOrThrow({ where: { id: formulaId } })
  await appendFormulaVersion(db, {
    ownerId,
    formulaId,
    expectedVersionId: versionId,
    expectedTitle: current.title,
    title: current.title,
    latex: 'x=7',
  })
  const follow = await submitChatTurn(db, boss, limits, {
    ownerId,
    conversationId: a.conversationId,
    requestKey: randomUUID(),
    question: '请继续解释条件',
  })
  await consume(follow.id, {
    ...good,
    async *stream(value) {
      assert.equal(value.responseKind, 'TEXT')
      assert.equal(value.promptVersion, 'formula-followup-v1')
      assert.equal(value.formula?.versionId, versionId)
      assert.equal(value.baseExplanation?.answer, explanationText(explanationFixture))
      assert.equal(value.messages.filter((v) => v.content === EXPLANATION_QUESTION).length, 0)
      yield { text: '这是基于原解释的追问回答。', finishReason: 'stop' }
    },
  })
  const snapshot = await readConversation(db, ownerId, a.conversationId)
  assert.equal(snapshot.context?.id, versionId)
  assert.ok(snapshot.baseExplanation)
  const history = await readExplanationHistory(db, ownerId, formulaId, {})
  assert.equal(history.items.find((v) => v.id === a.conversationId)?.status, 'COMPLETED')
})
test('超过100条消息仍可访问基础解释，失败追问不进入Prompt', async () => {
  const turn = await completed()
  for (let i = 0; i < 55; i++) {
    const row = await db.chatTurn.create({
      data: {
        ownerId,
        conversationId: turn.conversationId,
        requestKey: randomUUID(),
        question: '历史' + i,
        status: 'COMPLETED',
        finishedAt: new Date(),
      },
    })
    await db.chatMessage.createMany({
      data: [
        {
          ownerId,
          conversationId: turn.conversationId,
          turnId: row.id,
          role: 'USER',
          content: row.question,
          position: i * 2 + 3,
        },
        {
          ownerId,
          conversationId: turn.conversationId,
          turnId: row.id,
          role: 'ASSISTANT',
          content: '回答' + i,
          position: i * 2 + 4,
        },
      ],
    })
  }
  const failed = await submitChatTurn(db, boss, limits, {
    ownerId,
    conversationId: turn.conversationId,
    requestKey: randomUUID(),
    question: '不应进入Prompt',
  })
  await consume(failed.id, {
    ...good,
    async *stream() {
      throw new InferenceFailure('INVALID_INPUT', '受控失败', false)
    },
  })
  const snap = await readConversation(db, ownerId, turn.conversationId)
  assert.equal(snap.messages.length, 100)
  assert.equal(snap.hasEarlierMessages, true)
  assert.ok(snap.baseExplanation)
  assert.ok(!snap.messages.some((m) => m.id === snap.baseExplanation!.messageId))
  const history = await readPromptHistory(db, ownerId, turn.conversationId, turn.id)
  assert.ok(!history.some((v) => v.content === '不应进入Prompt'))
})
test('解释历史游标覆盖后续页，不受最后追问状态影响', async () => {
  for (let i = 0; i < 14; i++) await completed()
  const first = await readExplanationHistory(db, ownerId, formulaId, {})
  assert.equal(first.items.length, 20)
  assert.ok(first.nextCursor)
  const next = await readExplanationHistory(db, ownerId, formulaId, { cursor: first.nextCursor! })
  assert.ok(next.items.length > 0)
  assert.equal(
    new Set([...first.items, ...next.items].map((v) => v.id)).size,
    first.items.length + next.items.length,
  )
  await assert.rejects(readExplanationHistory(db, ownerId, formulaId, { cursor: randomUUID() }))
})

test('真实Worker进程在生成JSON时退出，监督恢复后沿用版本和额度', async () => {
  const turn = await submitExplanation(db, boss, limits, input()),
    before = (await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used
  await db.$executeRawUnsafe(
    'UPDATE pgboss.job SET expire_seconds=1,heartbeat_seconds=NULL WHERE name=$1 AND id=$2::uuid',
    queues.chat,
    turn.queueJobId,
  )
  const child = spawnSync(
    process.execPath,
    ['--import=tsx', 'tests/fixtures/r19-crash.ts', turn.id],
    { env: { ...process.env }, stdio: 'pipe', windowsHide: true, timeout: 20000 },
  )
  assert.equal(child.status, 17)
  assert.equal((await db.chatTurn.findUniqueOrThrow({ where: { id: turn.id } })).partialContent, '')
  await delay(1100)
  await boss.supervise(queues.chat)
  await reconcileTask(db, boss, 'chat', ownerId, turn.id)
  await reconcileChatCalls(db, 100)
  await consume(turn.id)
  const state = await readConversation(db, ownerId, turn.conversationId)
  assert.equal(state.currentTurn?.status, 'COMPLETED')
  assert.equal(state.currentTurn?.attemptCount, 2)
  assert.ok(state.baseExplanation)
  const calls = await db.chatCallAttempt.findMany({
    where: { turnId: turn.id },
    orderBy: { workerAttempt: 'asc' },
  })
  assert.equal(calls.length, 2)
  assert.equal(calls[0]!.status, 'UNKNOWN')
  assert.ok(calls[1]!.resultCommittedAt)
  assert.equal(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used,
    before,
  )
})
import { Client } from 'pg'
import { readFileSync } from 'node:fs'

test('迁移真实旧表数据兼容且事务失败整体回滚', async () => {
  const client = new Client({ connectionString: testEnvironment.databaseUrl }),
    schema = 'r19_probe_' + randomUUID().replaceAll('-', '')
  await client.connect()
  const sql = readFileSync(
    'prisma/migrations/202610290002_structured_explanations/migration.sql',
    'utf8',
  )
    .replace(/^BEGIN;\s*/, '')
    .replace(/COMMIT;\s*$/, '')
  try {
    await client.query('BEGIN')
    await client.query(`CREATE SCHEMA "${schema}"; SET LOCAL search_path TO "${schema}",public;
   CREATE TABLE conversations (LIKE public.conversations INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
   CREATE TABLE chat_turns (LIKE public.chat_turns INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
   CREATE TABLE chat_messages (LIKE public.chat_messages INCLUDING DEFAULTS INCLUDING CONSTRAINTS);
   ALTER TABLE conversations DROP COLUMN purpose;
   ALTER TABLE chat_turns DROP COLUMN "responseKind",DROP COLUMN "promptVersion",DROP COLUMN "requestHash";
   ALTER TABLE chat_messages DROP COLUMN "structuredContent";`)
    const c = randomUUID(),
      t = randomUUID(),
      m = randomUUID()
    await client.query(
      'INSERT INTO conversations(id,"ownerId",title,"updatedAt") VALUES($1,$2,$3,now())',
      [c, ownerId, '迁移前旧会话'],
    )
    await client.query(
      'INSERT INTO chat_turns(id,"ownerId","conversationId","requestKey",question) VALUES($1,$2,$3,$4,$5)',
      [t, ownerId, c, randomUUID(), '旧问题'],
    )
    await client.query(
      'INSERT INTO chat_messages(id,"ownerId","conversationId",role,content,position,"updatedAt") VALUES($1,$2,$3,$4,$5,1,now())',
      [m, ownerId, c, 'ASSISTANT', '旧回答'],
    )
    await client.query(sql)
    assert.equal(
      (await client.query('SELECT purpose FROM conversations WHERE id=$1', [c])).rows[0].purpose,
      'CHAT',
    )
    assert.equal(
      (await client.query('SELECT "responseKind","promptVersion" FROM chat_turns WHERE id=$1', [t]))
        .rows[0].responseKind,
      'TEXT',
    )
    const old = (
      await client.query('SELECT content,"structuredContent" FROM chat_messages WHERE id=$1', [m])
    ).rows[0]
    assert.equal(old.content, '旧回答')
    assert.equal(old.structuredContent, null)
    await assert.rejects(client.query('SELECT 1/0'))
    await client.query('ROLLBACK')
    assert.equal(
      (await client.query('SELECT to_regnamespace($1) AS schema', [schema])).rows[0].schema,
      null,
    )
  } finally {
    await client.query('ROLLBACK').catch(() => {})
    await client.end()
  }
})
