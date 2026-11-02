import 'dotenv/config'
import { createDatabaseClient } from '../server/database/client'
const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
try {
  const where = { status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] } }
  const total =
    (await db.chatTurn.count({ where })) +
    (await db.recognitionTask.count({ where })) +
    (await db.exportTask.count({ where }))
  if (total) {
    console.error('仍有活跃任务，未停止进程。')
    process.exitCode = 3
  }
} finally {
  await db.$disconnect()
}
