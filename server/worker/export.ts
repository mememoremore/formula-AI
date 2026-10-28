import { randomUUID } from 'node:crypto'
import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import type { PrivateObjectStore } from '../storage/object-store'
import {
  convertFormulaDocument,
  docxMimeType,
  type FormulaDocumentConverter,
} from '../documents/formula-document'
import { completeClaim, touchClaim, LostJobClaim, type RunningJob } from '../queue/claim'
import { runTask } from './lifecycle'
import { reserveResource, releaseUnbound } from '../resources/leases'
import { prepareFile, putAndPublish } from '../resources/files'
import { MAX_DOCX_BYTES } from '../resources/policy'
import { WorkspaceError } from '../services/workspace-error'
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
    const lease = await reserveResource(db, {
      ownerId: task.ownerId,
      purpose: 'DOCX_WRITE',
      requestKey: `${task.id}:${job.retryCount}`,
      bytes: MAX_DOCX_BYTES,
      countsTowardRate: false,
    })
    try {
      const bytes = await convert({
        title: task.title,
        latex: task.formulaVersion.latex,
        versionNumber: task.formulaVersion.number,
        isMock: task.formulaVersion.isMock,
      })
      if (bytes.length > MAX_DOCX_BYTES) throw new WorkspaceError(413, '导出文件超过 5 MiB 上限。')
      const fileId = randomUUID()
      const file = await prepareFile(db, lease, {
        id: fileId,
        kind: 'DOCX',
        bucket: store.bucket,
        objectKey: `${task.ownerId}/exports/${task.id}/${fileId}.docx`,
        name: `${task.title.slice(0, 80)}-v${task.formulaVersion.number}.docx`,
        mimeType: docxMimeType,
        sizeBytes: bytes.length,
      })
      await putAndPublish(db, store, lease, file, bytes, async (tx) => {
        await touchClaim(boss, tx, job)
        const changed = await tx.exportTask.updateMany({
          where: {
            id: task.id,
            ownerId: task.ownerId,
            queueJobId: job.id,
            status: 'PROCESSING',
            attemptCount: job.retryCount + 1,
          },
          data: { status: 'COMPLETED', fileId, finishedAt: new Date(), errorMessage: null },
        })
        if (!changed.count) throw new LostJobClaim()
        await completeClaim(boss, tx, job)
      })
    } finally {
      await releaseUnbound(db, lease).catch(() => {})
    }
  })
}
