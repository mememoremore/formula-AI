import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { enqueueTask } from '../queue/enqueue'
import { reserveUsage, type UsageLimits } from './usage'
import { idempotentTask } from './idempotent-task'

export async function submitRecognition(
  db: PrismaClient,
  boss: PgBoss,
  limits: UsageLimits,
  input: { ownerId: string; fileId: string; mode: 'handwritten' | 'printed'; requestKey: string },
) {
  const mode = input.mode === 'handwritten' ? 'HANDWRITTEN' : 'PRINTED'
  const read = async () => {
    const task = await db.recognitionTask.findUnique({
      where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
    })
    if (task && (task.inputFileId !== input.fileId || task.mode !== mode))
      throw new WorkspaceError(409, '这个识别请求编号已用于其他图片或模式。')
    return task
  }
  return idempotentTask(read, () =>
    db.$transaction(async (tx) => {
      const file = await tx.storedFile.findFirst({
        where: { id: input.fileId, ownerId: input.ownerId, kind: 'IMAGE', status: 'READY' },
        select: { id: true },
      })
      if (!file) throw new WorkspaceError(404, '未找到可识别的图片，请重新上传。')
      const task = await tx.recognitionTask.create({
        data: {
          ownerId: input.ownerId,
          inputFileId: input.fileId,
          mode,
          requestKey: input.requestKey,
        },
      })
      await reserveUsage(tx, input.ownerId, 'RECOGNITION', limits.RECOGNITION)
      const queueJobId = await enqueueTask(boss, tx, 'recognition', {
        taskId: task.id,
        ownerId: input.ownerId,
      })
      return tx.recognitionTask.update({ where: { id: task.id }, data: { queueJobId } })
    }),
  )
}

export async function submitExport(
  db: PrismaClient,
  boss: PgBoss,
  limits: UsageLimits,
  input: { ownerId: string; formulaVersionId: string; requestKey: string },
) {
  const read = async () => {
    const task = await db.exportTask.findUnique({
      where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
    })
    if (task && task.formulaVersionId !== input.formulaVersionId)
      throw new WorkspaceError(409, '这个导出请求编号已用于其他公式版本。')
    return task
  }
  return idempotentTask(read, () =>
    db.$transaction(async (tx) => {
      const version = await tx.formulaVersion.findFirst({
        where: { id: input.formulaVersionId, ownerId: input.ownerId },
        include: { formula: { select: { title: true } } },
      })
      if (!version) throw new WorkspaceError(404, '未找到这个公式版本。')
      const task = await tx.exportTask.create({ data: { ...input, title: version.formula.title } })
      await reserveUsage(tx, input.ownerId, 'EXPORT', limits.EXPORT)
      const queueJobId = await enqueueTask(boss, tx, 'export', {
        taskId: task.id,
        ownerId: input.ownerId,
      })
      return tx.exportTask.update({ where: { id: task.id }, data: { queueJobId } })
    }),
  )
}
