import { testEnvironment } from '../support/integration.ts'
import { createTestQueueClient } from '../support/queue-client'
import { createDatabaseClient } from '../../server/database/client'
import { processChat } from '../../server/worker/chat'
import { queues, type JobPayload } from '../../server/queue/client'
const db = createDatabaseClient(testEnvironment.databaseUrl),
  boss = createTestQueueClient()
await boss.start()
const [job] = await boss.fetch<JobPayload>(queues.chat, {
  includeMetadata: true,
  ignoreStartAfter: true,
})
if (!job || job.data.taskId !== process.argv[2]) process.exit(18)
await processChat(db, boss, job, {
  isMock: true,
  model: 'r19-crash',
  async *stream() {
    yield { text: '{"schemaVersion":' }
    process.exit(17)
  },
})
process.exit(19)
