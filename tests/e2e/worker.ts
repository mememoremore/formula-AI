import { explanationFixture } from '../fixtures/explanation'
import { testEnvironment as config } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import { createQueueClient, queues, type JobPayload } from '../../server/queue/client'
import { createObjectStore } from '../../server/storage/object-store'
import { processRecognition } from '../../server/worker/recognition'
import { processChat } from '../../server/worker/chat'
import { processExport } from '../../server/worker/export'
import { startTaskRecovery } from '../../server/worker/recovery'
import { startLeaseRecovery } from '../../server/resources/lease-recovery'
import { InferenceFailure } from '../../server/inference/failure'
import { setTimeout as delay } from 'node:timers/promises'
import { appendFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createHash } from 'node:crypto'

// A real pg-boss consumer; only the external inference boundary is replaced.
const db = createDatabaseClient(config.databaseUrl)
const boss = createQueueClient(config.databaseUrl, { worker: true })
const store = createObjectStore({ ...config.storage, region: 'us-east-1' })
await store.check()
await boss.start()
const recovery = await startTaskRecovery(db, boss, {
  enabled: true,
  intervalMs: 1000,
  batchSize: 100,
})
const leases = await startLeaseRecovery(db, store, {
  enabled: true,
  intervalMs: 1000,
  batchSize: 100,
})
const options = { includeMetadata: true as const, batchSize: 1, pollingIntervalSeconds: 1 }
await boss.work<JobPayload, void, typeof options>(queues.recognition, options, async (jobs) => {
  for (const job of jobs)
    await processRecognition(db, boss, store, job, {
      async recognize(input) {
        return {
          requestId: input.requestId!,
          latex: 'x^2-5x+6=0',
          modelVersion: 'e2e-controlled',
          isMock: true,
        }
      },
    })
})
await boss.work<JobPayload, void, typeof options>(queues.chat, options, async (jobs) => {
  for (const job of jobs)
    await processChat(db, boss, job, {
      isMock: true,
      model: 'e2e-controlled',
      async *stream(input, signal) {
        const question = input.messages.at(-1)?.content ?? ''
        appendFileSync(
          resolve('tmp/r1-test', config.runId, 'prompt-proof.jsonl'),
          JSON.stringify({
            taskId: job.data.taskId,
            attempt: job.retryCount + 1,
            versionId: input.formula?.versionId,
            messages: input.messages.map((message) => ({
              role: message.role,
              hash: createHash('sha256').update(message.content).digest('hex'),
            })),
          }) + '\n',
          { mode: 0o600 },
        )
        if (input.responseKind === 'FORMULA_EXPLANATION') {
          yield { text: JSON.stringify(explanationFixture).slice(0, 30) }
          await delay(800, undefined, { signal })
          yield { text: JSON.stringify(explanationFixture).slice(30), finishReason: 'stop' }
          return
        }
        yield { text: '受控模型：正在分析公式。\n\n' }
        await delay(1200, undefined, { signal })
        if (question.includes('[e2e:fail]'))
          throw new InferenceFailure('INVALID_INPUT', '受控失败', false)
        if (question.includes('[e2e:retry]') && job.retryCount === 0)
          throw new InferenceFailure('UPSTREAM', '受控重试', true)
        if (question.includes('[e2e:crash]') && job.retryCount === 0) process.exit(86)
        if (question.includes('[e2e:stop]')) await delay(30000, undefined, { signal })
        yield { text: '方程可以因式分解，得到 $x=2$ 或 $x=3$。', finishReason: 'stop' }
      },
    })
})
await boss.work<JobPayload, void, typeof options>(queues.export, options, async (jobs) => {
  for (const job of jobs) await processExport(db, boss, store, job)
})
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await Promise.all([recovery.stop(), leases.stop()])
  await boss.stop({ graceful: true, timeout: 5000 })
  await db.$disconnect()
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void stop().then(() => process.exit(0))
  })
process.on('message', (message) => {
  if (message && typeof message === 'object' && 'type' in message && message.type === 'stop')
    void stop().then(() => process.exit(0))
})
process.send?.({ type: 'ready', runId: config.runId })
console.log('R16 controlled Worker ready')
