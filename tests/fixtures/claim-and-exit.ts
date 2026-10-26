import 'dotenv/config'
import { createQueueClient, type JobPayload } from '../../server/queue/client'
const boss = createQueueClient(process.env.NUXT_DATABASE_URL ?? '')
await boss.start()
const [job] = await boss.fetch<JobPayload>(process.argv[2]!, { includeMetadata: true })
if (!job || job.data.taskId !== process.argv[3]) process.exit(2)
// 故意退出而不完成/失败任务，模拟 Worker 在已经领取后崩溃。
process.stdout.write(job.id)
process.exit(0)
