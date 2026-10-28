import { testEnvironment } from '../tests/support/integration.ts'
import assert from 'node:assert/strict'
import { randomUUID, createHash } from 'node:crypto'
import { writeFile, readFile } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../server/generated/prisma/client'
import { createQueueClient, queues, type JobPayload } from '../server/queue/client'
import { createFormula } from '../server/database/formulas'
import {
  createConversation,
  readConversation,
  submitChatTurn,
} from '../server/database/conversations'
import { defaultUsageLimits } from '../server/database/usage'
import { processChat } from '../server/worker/chat'
import { InferenceFailure } from '../server/inference/failure'
import { acceptConversationSnapshot } from '../app/utils/chat-state'
import type { ChatRequest } from '../shared/types/api'
import type { SavedConversation } from '../shared/types/tasks'
import type { Prisma } from '../server/generated/prisma/client'
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: testEnvironment.databaseUrl, max: 5 }),
  log: [{ level: 'query', emit: 'event' }],
})
const boss = createQueueClient(testEnvironment.databaseUrl)
let measuring = false,
  statements = 0,
  databaseMs = 0
// 不保存SQL、参数、Prompt或消息正文，仅累计计数/耗时。
db.$on('query', (event) => {
  if (measuring) {
    statements++
    databaseMs += event.duration
  }
})
let ownerId: string | undefined
try {
  await boss.start()
  const owner = await db.user.create({
    data: { email: `r14-baseline-${randomUUID()}@formula.test`, displayName: 'R14隔离基线' },
  })
  ownerId = owner.id
  const formula = await createFormula(db, {
    ownerId,
    title: '固定公式基线',
    latex: 'x^2=1',
    origin: 'DEMO',
    isMock: true,
  })
  const conversation = await createConversation(db, ownerId, formula.version.id, randomUUID())
  for (const [i, failed] of [false, true, true].entries()) {
    const question =
      i === 1 ? 'FAILED_ROUND_MARKER' : i === 2 ? 'STOPPED_ROUND_MARKER' : 'SUCCESSFUL_QUESTION'
    const turn = await db.chatTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        requestKey: randomUUID(),
        question,
        status: failed ? 'FAILED' : 'COMPLETED',
        attemptCount: 1,
        startedAt: new Date(),
        finishedAt: new Date(),
        partialContent: failed ? '未完成片段' : '完整回答',
        errorMessage: i === 2 ? '已停止生成。' : failed ? '受控失败' : null,
      },
    })
    await db.chatMessage.createMany({
      data: [
        {
          ownerId,
          conversationId: conversation.id,
          turnId: turn.id,
          position: i * 2 + 1,
          role: 'USER',
          content: question,
        },
        {
          ownerId,
          conversationId: conversation.id,
          turnId: turn.id,
          position: i * 2 + 2,
          role: 'ASSISTANT',
          status: failed ? 'FAILED' : 'COMPLETED',
          content: failed ? '未完成记录' : '完整回答',
        },
      ],
    })
  }
  const task = await submitChatTurn(db, boss, defaultUsageLimits, {
    ownerId,
    conversationId: conversation.id,
    requestKey: randomUUID(),
    question: 'CURRENT_QUESTION',
  })
  const [first] = await boss.fetch<JobPayload>(queues.chat, { includeMetadata: true })
  assert.equal(first?.data.taskId, task.id)
  let captured: ChatRequest | undefined,
    adapterCalls = 0
  await assert.rejects(
    processChat(db, boss, first!, {
      isMock: true,
      model: 'r14-failed-attempt',
      async *stream(input) {
        adapterCalls++
        captured = input
        yield { text: '旧尝试片段' }
        throw new InferenceFailure('UPSTREAM', '受控失败。', true)
      },
    }),
  )
  const [retry] = await boss.fetch<JobPayload>(queues.chat, {
    includeMetadata: true,
    ignoreStartAfter: true,
  })
  assert.equal(retry?.data.taskId, task.id)
  let beforeReset: SavedConversation | undefined, afterReset: SavedConversation | undefined
  const observed = new Proxy(db, {
    get(target, key) {
      if (key === '$transaction')
        return async (
          action: (tx: Prisma.TransactionClient) => Promise<unknown>,
          options?: { timeout?: number },
        ) => {
          const result = await target.$transaction(action, options)
          const value = await readConversation(db, owner.id, conversation.id)
          if (result === true && value.currentTurn?.attemptCount === 2) beforeReset = value
          else if (
            beforeReset &&
            !afterReset &&
            value.currentTurn?.attemptCount === 2 &&
            value.currentTurn.partialContent === ''
          )
            afterReset = value
          return result
        }
      const value = Reflect.get(target, key, target)
      return typeof value === 'function' ? value.bind(target) : value
    },
  })
  await processChat(observed, boss, retry!, {
    isMock: true,
    model: 'r14-retry-attempt',
    async *stream(input) {
      adapterCalls++
      captured = input
      yield { text: '新的完整回答', finishReason: 'stop' }
    },
  })
  assert.ok(captured && beforeReset && afterReset)
  const failedQuestionIncluded = captured.messages.some((m) => m.content === 'FAILED_ROUND_MARKER')
  const stoppedQuestionIncluded = captured.messages.some(
    (m) => m.content === 'STOPPED_ROUND_MARKER',
  )
  const resetRejected = acceptConversationSnapshot(beforeReset, afterReset) === beforeReset
  const modelNew = {
    ...afterReset,
    currentTurn: { ...afterReset.currentTurn!, attemptCount: 1, modelVersion: 'new-model' },
  }
  const modelOld = {
    ...afterReset,
    currentTurn: { ...afterReset.currentTurn!, attemptCount: 1, modelVersion: null },
  }
  const metadataRollbackAccepted = acceptConversationSnapshot(modelNew, modelOld) === modelOld
  const usage = await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })
  const findings = {
    failedQuestionIncluded,
    stoppedQuestionIncluded,
    retryResetRejected: resetRejected,
    metadataRollbackAccepted,
    workerAttempts: (await db.chatTurn.findUniqueOrThrow({ where: { id: task.id } })).attemptCount,
    adapterCalls,
    dailyChatUsage: usage.used,
  }
  const results = []
  for (const historyMessages of [0, 20, 100, 200]) {
    const item = await createConversation(db, ownerId, formula.version.id, randomUUID())
    if (historyMessages)
      await db.chatMessage.createMany({
        data: Array.from({ length: historyMessages }, (_, i) => ({
          ownerId: owner.id,
          conversationId: item.id,
          position: i + 1,
          role: i % 2 ? ('ASSISTANT' as const) : ('USER' as const),
          content: (i % 2 ? '答：' : '问：') + 'x'.repeat(1000),
        })),
      })
    const current = await db.chatTurn.create({
      data: {
        ownerId,
        conversationId: item.id,
        requestKey: randomUUID(),
        question: '测量问题',
        status: 'PROCESSING',
        attemptCount: 1,
        startedAt: new Date(),
      },
    })
    await db.chatMessage.create({
      data: {
        ownerId,
        conversationId: item.id,
        turnId: current.id,
        position: historyMessages + 1,
        role: 'USER',
        content: '测量问题',
      },
    })
    for (const connections of [1, 4]) {
      await readConversation(db, ownerId, item.id) // 不计一次预热
      const latencies: number[] = [],
        queryCounts: number[] = [],
        sqlTimes: number[] = []
      let frameBytes = 0,
        visibleMessages = 0
      for (let tick = 0; tick < 20; tick++) {
        await db.chatTurn.update({
          where: { id: current.id },
          data: { partialContent: 'y'.repeat((tick + 1) * 64) },
        })
        statements = 0
        databaseMs = 0
        measuring = true
        const start = performance.now()
        const values = await Promise.all(
          Array.from({ length: connections }, () => readConversation(db, owner.id, item.id)),
        )
        const elapsed = performance.now() - start
        measuring = false
        latencies.push(elapsed)
        queryCounts.push(statements)
        sqlTimes.push(databaseMs)
        for (const value of values) {
          visibleMessages = value.messages.length
          frameBytes += Buffer.byteLength(`event: snapshot\ndata: ${JSON.stringify(value)}\n\n`)
        }
      }
      latencies.sort((a, b) => a - b)
      results.push({
        historyMessages,
        connections,
        ticks: 20,
        visibleMessages,
        sqlStatements: queryCounts.reduce((a, b) => a + b, 0),
        statementsPerTick: queryCounts.reduce((a, b) => a + b, 0) / 20,
        sqlDurationMs: sqlTimes.reduce((a, b) => a + b, 0),
        tickMedianMs: Number(latencies[10]!.toFixed(2)),
        tickP95Ms: Number(latencies[18]!.toFixed(2)),
        uncompressedFrameBytes: frameBytes,
      })
    }
  }
  const sourceFiles = [
    'server/worker/chat.ts',
    'server/chat/prompt.ts',
    'server/database/conversations.ts',
    'app/utils/chat-state.ts',
  ]
  const sourceHashes: Record<string, string> = {}
  for (const file of sourceFiles)
    sourceHashes[file] = createHash('sha256')
      .update(await readFile(file))
      .digest('hex')
  const report = {
    baselineCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
    runId: testEnvironment.runId,
    mode: 'old-schema controlled database baseline; no paid model',
    method:
      'readConversation actual SQL events and UTF-8 snapshot frame bytes; no real-time pacing, auth queries/reconciliation/proxy compression excluded; no optimized implementation measured',
    sourceHashes,
    findings,
    results,
  }
  await writeFile('tmp/r14-baseline-report.json', JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ findings, results }, null, 2))
} finally {
  measuring = false
  if (ownerId) {
    const jobs = await boss.findJobs(queues.chat, { data: { ownerId }, limit: 1000 })
    if (jobs.length)
      await boss.deleteJob(
        queues.chat,
        jobs.map((j) => j.id),
      )
    await db.user.delete({ where: { id: ownerId } })
  }
  await boss.stop()
  await db.$disconnect()
}
