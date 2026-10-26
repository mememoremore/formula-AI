import { randomUUID } from 'node:crypto'
import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import {
  convertFormulaDocument,
  docxMimeType,
  type FormulaDocumentConverter,
} from '../documents/formula-document'
import { completeClaim, type RunningJob } from '../queue/claim'
import { runTask } from './lifecycle'

export async function processExport(
  db: PrismaClient,
  boss: PgBoss,
  store: PrivateObjectStore,
  job: RunningJob,
  convert: FormulaDocumentConverter = convertFormulaDocument,
) {
  await runTask(db, boss, 'export', job, async () => {
    const task = await db.exportTask.findFirstOrThrow({
      where: { id: job.data.taskId, ownerId: job.data.ownerId, queueJobId: job.id },
      include: { formulaVersion: true },
    })
    const bytes = await convert({
      title: task.title,
      latex: task.formulaVersion.latex,
      versionNumber: task.formulaVersion.number,
      isMock: task.formulaVersion.isMock,
    })
    const fileId = randomUUID()
    const objectKey = `${task.ownerId}/exports/${task.id}/${fileId}.docx`
    await db.storedFile.create({
      data: {
        id: fileId,
        ownerId: task.ownerId,
        kind: 'DOCX',
        status: 'PENDING',
        bucket: store.bucket,
        objectKey,
        name: `${task.title.slice(0, 80)}-v${task.formulaVersion.number}.docx`,
        mimeType: docxMimeType,
        sizeBytes: bytes.length,
      },
    })
    try {
      await store.put(objectKey, bytes, docxMimeType)
      await db.$transaction(async (tx) => {
        await tx.storedFile.update({ where: { id: fileId }, data: { status: 'READY' } })
        await tx.exportTask.update({
          where: { id: task.id },
          data: { status: 'COMPLETED', fileId, finishedAt: new Date(), errorMessage: null },
        })
        await completeClaim(boss, tx, job)
      })
    } catch (error) {
      // 每次尝试使用独立对象键，旧 Worker 的补偿不会删除新 Worker 的成品。
      await store
        .remove(objectKey)
        .then(() => db.storedFile.update({ where: { id: fileId }, data: { status: 'DELETED' } }))
        .catch(() => {})
      throw error
    }
  })
}
