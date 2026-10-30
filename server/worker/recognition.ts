import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import { createFormulaInTransaction } from '../database/formulas'
import { mockRecognitionAdapter, type RecognitionAdapter } from '../services/recognition-adapter'
import { completeClaim, touchClaim, LostJobClaim, type RunningJob } from '../queue/claim'
import { runTask } from './lifecycle'
import { withInferenceDeadline } from '../inference/deadline'

export async function processRecognition(
  db: PrismaClient,
  boss: PgBoss,
  store: PrivateObjectStore,
  job: RunningJob,
  adapter: RecognitionAdapter = mockRecognitionAdapter,
) {
  await runTask(db, boss, 'recognition', job, async () => {
    const task = await db.recognitionTask.findFirstOrThrow({
      where: { id: job.data.taskId, ownerId: job.data.ownerId, queueJobId: job.id },
      include: { inputFile: true },
    })
    if (task.inputFile.status !== 'READY' || task.inputFile.bucket !== store.bucket)
      throw new Error('识别输入不可用。')
    const image = await store.get(task.inputFile.objectKey)
    const result = await withInferenceDeadline(
      (signal) =>
        adapter.recognize(
          {
            image,
            mimeType: task.inputFile.mimeType,
            mode: task.mode === 'HANDWRITTEN' ? 'handwritten' : 'printed',
            requestId: task.id,
          },
          signal,
        ),
      job.signal,
    )
    await db.$transaction(async (tx) => {
      await touchClaim(boss, tx, job)
      const changed = await tx.recognitionTask.updateMany({
        where: {
          id: task.id,
          ownerId: task.ownerId,
          queueJobId: job.id,
          status: 'PROCESSING',
          attemptCount: job.retryCount + 1,
        },
        data: { status: 'COMPLETED', finishedAt: new Date(), errorCode: null, errorMessage: null },
      })
      if (!changed.count) throw new LostJobClaim()
      await createFormulaInTransaction(tx, {
        ownerId: task.ownerId,
        title: task.requestedTitle ?? '未命名公式',
        latex: result.latex,
        recognitionTaskId: task.id,
        origin: 'RECOGNITION',
        modelVersion: result.modelVersion,
        isMock: result.isMock,
      })
      await completeClaim(boss, tx, job)
    })
  })
}
