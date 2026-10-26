import 'dotenv/config'
import { createQueueClient, installQueues } from '../server/queue/client'
const boss = createQueueClient(process.env.NUXT_DATABASE_URL ?? '', { install: true })
try {
  await boss.start()
  await installQueues(boss)
  console.log('pg-boss 结构与三个业务队列已就绪。')
} finally {
  await boss.stop()
}
