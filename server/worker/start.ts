import type { PrismaClient } from '../generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import type { PrivateObjectStore } from '../storage/object-store'
import { queues, type JobPayload } from '../queue/client'
import { processRecognition } from './recognition'
import { processChat } from './chat'
import { processExport } from './export'
import { createChatAdapter } from '../chat/factory'
import { createRecognitionAdapter } from '../recognition/factory'

export async function registerWorkers(db: PrismaClient, boss: PgBoss, store: PrivateObjectStore) {
  const chatAdapter = createChatAdapter()
  const recognitionAdapter = createRecognitionAdapter()
  const options = { includeMetadata: true as const, batchSize: 1, pollingIntervalSeconds: 1 }
  await boss.work<JobPayload, void, typeof options>(queues.recognition, options, async (jobs) => {
    for (const job of jobs) await processRecognition(db, boss, store, job, recognitionAdapter)
  })
  await boss.work<JobPayload, void, typeof options>(queues.chat, options, async (jobs) => {
    for (const job of jobs) await processChat(db, boss, job, chatAdapter)
  })
  await boss.work<JobPayload, void, typeof options>(queues.export, options, async (jobs) => {
    for (const job of jobs) await processExport(db, boss, store, job)
  })
}
