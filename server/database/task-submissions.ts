import type { PgBoss } from 'pg-boss'
import type { PrismaClient, Prisma } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { enqueueTask } from '../queue/enqueue'
import { reserveUsage, type UsageLimits } from './usage'
import { idempotentTask } from './idempotent-task'
import { resourceTransaction } from '../resources/leases'
import { resourcePolicy, ResourceLimitError } from '../resources/policy'

export async function submitRecognition(
  db: PrismaClient,
  boss: PgBoss,
  limits: UsageLimits,
  input: {
    ownerId: string
    fileId: string
    mode: 'handwritten' | 'printed'
    requestKey: string
    requestedTitle?: string | null
  },
) {
  const mode = input.mode === 'handwritten' ? 'HANDWRITTEN' : 'PRINTED'
  const requestedTitle = input.requestedTitle ?? null
  const read = async () => {
    const task = await db.recognitionTask.findUnique({
      where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
    })
    if (
      task &&
      (task.inputFileId !== input.fileId ||
        task.mode !== mode ||
        task.requestedTitle !== requestedTitle)
    )
      throw new WorkspaceError(409, '这个识别请求编号已用于其他图片、模式或名称。')
    return task
  }
  return idempotentTask(read, () =>
    resourceTransaction(db, input.ownerId, async (tx) => {
      // 在资源锁内再次检查重放，优先于新的准入/额度判断。
      const existing = await tx.recognitionTask.findUnique({
        where: { ownerId_requestKey: { ownerId: input.ownerId, requestKey: input.requestKey } },
      })
      if (existing) {
        if (
          existing.inputFileId !== input.fileId ||
          existing.mode !== mode ||
          existing.requestedTitle !== requestedTitle
        )
          throw new WorkspaceError(409, '这个识别请求编号已用于其他图片、模式或名称。')
        return existing
      }
      const policy = resourcePolicy()
      const active: Prisma.RecognitionTaskWhereInput = { status: { in: ['QUEUED', 'PROCESSING'] } }
      const total = await tx.recognitionTask.count({ where: active })
      const owner = await tx.recognitionTask.count({ where: { ...active, ownerId: input.ownerId } })
      if (total >= policy.globalRecognitions || owner >= policy.ownerRecognitions)
        throw new ResourceLimitError(
          'RECOGNITION_BUSY',
          429,
          '识别任务过多，请等待已有任务完成后重试。',
        )
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
          requestedTitle,
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
        where: {
          id: input.formulaVersionId,
          ownerId: input.ownerId,
          formula: { deletedAt: null },
        },
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
