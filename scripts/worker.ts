import 'dotenv/config'
import { createDatabaseClient } from '../server/database/client'
import { createQueueClient } from '../server/queue/client'
import { createObjectStore } from '../server/storage/object-store'
import { registerWorkers } from '../server/worker/start'
const db = createDatabaseClient(process.env.NUXT_DATABASE_URL ?? '')
const boss = createQueueClient(process.env.NUXT_DATABASE_URL ?? '', { worker: true })
const store = createObjectStore({
  endpoint: process.env.NUXT_STORAGE_ENDPOINT ?? '',
  region: process.env.NUXT_STORAGE_REGION ?? 'us-east-1',
  bucket: process.env.NUXT_STORAGE_BUCKET ?? '',
  accessKeyId: process.env.NUXT_STORAGE_ACCESS_KEY_ID ?? '',
  secretAccessKey: process.env.NUXT_STORAGE_SECRET_ACCESS_KEY ?? '',
})
let stopping = false
async function stop() {
  if (stopping) return
  stopping = true
  await boss.stop({ graceful: true, timeout: 25000 })
  await db.$disconnect()
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    void stop().then(() => process.exit(0))
  })
try {
  await db.$connect()
  await store.check()
  await boss.start()
  await registerWorkers(db, boss, store)
  console.log(
    `Worker 已启动：识别（${process.env.NUXT_RECOGNITION_PROVIDER === 'python' ? 'Python' : '模拟'}）、对话（${process.env.NUXT_AI_PROVIDER === 'deepseek' ? 'DeepSeek' : '模拟'}）与 Word 导出。`,
  )
} catch {
  console.error('Worker 无法启动，请检查数据库、队列、存储及识别/对话服务配置。')
  await stop()
  process.exitCode = 1
}
