import { testEnvironment } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import { createQueueClient, queues, type JobPayload } from '../../server/queue/client'
import { createObjectStore } from '../../server/storage/object-store'
import { beginAttempt } from '../../server/worker/lifecycle'
import { startTaskRecovery } from '../../server/worker/recovery'
import { registerWorkers } from '../../server/worker/start'
import type { JobKind } from '../../shared/types/tasks'
import { setTimeout as delay } from 'node:timers/promises'
const db = createDatabaseClient(testEnvironment.databaseUrl)
const boss = createQueueClient(testEnvironment.databaseUrl, { worker: true })
const [mode, kindValue, taskId] = process.argv.slice(2)
const kind = kindValue as JobKind
if (!['recognition', 'chat', 'export'].includes(kind) || !taskId)
  throw new Error('Invalid owned task fixture')
await boss.start()
if (mode === 'before') process.exit(17)
if (mode === 'claim' || mode === 'started') {
  const [job] = await boss.fetch<JobPayload>(queues[kind], { includeMetadata: true })
  if (!job || job.data.taskId !== taskId) process.exit(18)
  if (mode === 'started') await beginAttempt(db, kind, job)
  process.exit(17)
}
const recovery = await startTaskRecovery(db, boss, { enabled: true, intervalMs: 20, batchSize: 5 })
try {
  if (mode === 'consume')
    await registerWorkers(
      db,
      boss,
      createObjectStore({ ...testEnvironment.storage, region: 'us-east-1' }),
    )
  else if (mode !== 'recover') throw new Error('Invalid mode')
  const start = Date.now()
  while (Date.now() - start < 15000) {
    const task =
      kind === 'recognition'
        ? await db.recognitionTask.findUnique({ where: { id: taskId } })
        : kind === 'chat'
          ? await db.chatTurn.findUnique({ where: { id: taskId } })
          : await db.exportTask.findUnique({ where: { id: taskId } })
    if (task && ['COMPLETED', 'FAILED'].includes(task.status)) break
    await delay(25)
  }
} finally {
  await recovery.stop()
  await boss.stop({ graceful: true, timeout: 5000 })
  await db.$disconnect()
}
