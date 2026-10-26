import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import { queues } from '../queue/client'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'
import type {
  JobKind,
  TaskState,
  RecognitionTaskState,
  ExportTaskState,
  RecognitionHistoryPage,
} from '../../shared/types/tasks'

/** 最近识别包含排队、处理中和失败任务，离开等待页后也能重新找到它。 */
export async function readRecognitionHistory(
  db: PrismaClient,
  ownerId: string,
  cursor?: string,
): Promise<RecognitionHistoryPage> {
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  if (
    cursor &&
    (!hasValidResourceIdentity(ownerId, cursor) ||
      !(await db.recognitionTask.findFirst({
        where: { id: cursor, ownerId },
        select: { id: true },
      })))
  )
    throw new WorkspaceError(404, '未找到这条识别记录。')
  const tasks = await db.recognitionTask.findMany({
    where: { ownerId },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: 26,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    include: {
      inputFile: { select: { name: true } },
      formula: {
        select: {
          id: true,
          title: true,
          versions: { orderBy: { number: 'desc' }, take: 1, select: { latex: true } },
        },
      },
    },
  })
  return {
    items: tasks.slice(0, 25).map((task) => ({
      id: task.id,
      status: task.status,
      title: task.formula?.title ?? task.inputFile.name,
      formulaId: task.formula?.id ?? null,
      latex: task.formula?.versions[0]?.latex ?? null,
      createdAt: task.createdAt.toISOString(),
      errorMessage: task.errorMessage,
    })),
    nextCursor: tasks.length > 25 ? tasks[24]!.id : null,
  }
}

/** Worker 在最后一次尝试中崩溃时，由持久化队列状态修复业务状态，不依赖进程内定时器。 */
export async function reconcileTask(
  db: PrismaClient,
  boss: PgBoss,
  kind: JobKind,
  ownerId: string,
  id: string,
) {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个任务。')
  // 三类任务具有相同的状态列；分开查询以保留 Prisma 生成类型约束。
  const task =
    kind === 'recognition'
      ? await db.recognitionTask.findFirst({ where: { id, ownerId } })
      : kind === 'chat'
        ? await db.chatTurn.findFirst({ where: { id, ownerId } })
        : await db.exportTask.findFirst({ where: { id, ownerId } })
  if (!task) throw new WorkspaceError(404, '未找到这个任务。')
  if (task.queueJobId && ['QUEUED', 'PROCESSING'].includes(task.status)) {
    const [job] = await boss.findJobs(queues[kind], { id: task.queueJobId })
    if (!job || ['failed', 'cancelled'].includes(job.state)) {
      const data = {
        status: 'FAILED' as const,
        finishedAt: new Date(),
        errorMessage: '任务处理已中断，请重新提交。',
        ...(kind === 'recognition' ? { errorCode: 'WORKER_INTERRUPTED' } : {}),
      }
      const where = {
        id,
        ownerId,
        queueJobId: task.queueJobId,
        status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] },
      }
      if (kind === 'recognition') await db.recognitionTask.updateMany({ where, data })
      else if (kind === 'chat')
        await db.$transaction(async (tx) => {
          const turn = await tx.chatTurn.findFirst({ where: { id, ownerId } })
          if (!turn) return
          await tx.$queryRaw`SELECT id FROM conversations WHERE id=${turn.conversationId}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`
          const updated = await tx.chatTurn.updateMany({ where, data })
          if (!updated.count) return
          const question = await tx.chatMessage.findFirst({
            where: { turnId: id, ownerId, role: 'USER' },
          })
          if (question)
            await tx.chatMessage.createMany({
              data: [
                {
                  ownerId,
                  conversationId: turn.conversationId,
                  turnId: id,
                  role: 'ASSISTANT',
                  position: question.position + 1,
                  content: turn.partialContent
                    ? `${turn.partialContent}\n\n【回答未完成】${data.errorMessage}`
                    : data.errorMessage,
                  status: 'FAILED',
                  isMock: turn.responseIsMock,
                  modelVersion: turn.responseModel,
                },
              ],
              skipDuplicates: true,
            })
        })
      else await db.exportTask.updateMany({ where, data })
    } else if (['created', 'retry'].includes(job.state) && task.status === 'PROCESSING') {
      const where = {
        id,
        ownerId,
        queueJobId: task.queueJobId,
        status: 'PROCESSING' as const,
        attemptCount: { lte: job.retryCount + 1 },
      }
      const data = {
        status: 'QUEUED' as const,
        finishedAt: null,
        errorMessage: '上次处理已中断，正在等待重试。',
      }
      if (kind === 'recognition') await db.recognitionTask.updateMany({ where, data })
      else if (kind === 'chat') await db.chatTurn.updateMany({ where, data })
      else await db.exportTask.updateMany({ where, data })
    }
  }
}
export async function readRecognitionTask(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<RecognitionTaskState> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个任务。')
  const task = await db.recognitionTask.findFirst({
    where: { id, ownerId },
    include: {
      formula: {
        select: {
          id: true,
          versions: { orderBy: { number: 'asc' }, take: 1, select: { isMock: true } },
        },
      },
    },
  })
  if (!task) throw new WorkspaceError(404, '未找到这个任务。')
  return {
    ...taskState(task),
    fileId: task.inputFileId,
    mode: task.mode === 'HANDWRITTEN' ? 'handwritten' : 'printed',
    formulaId: task.formula?.id ?? null,
    isMock: task.formula?.versions[0]?.isMock ?? true,
  }
}
export async function readExportTask(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<ExportTaskState> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个导出任务。')
  const task = await db.exportTask.findFirst({
    where: { id, ownerId },
    include: {
      formulaVersion: { select: { number: true, formulaId: true } },
      file: { select: { status: true, name: true, sizeBytes: true } },
    },
  })
  if (!task) throw new WorkspaceError(404, '未找到这个导出任务。')
  return {
    ...taskState(task),
    title: task.title,
    formulaVersionId: task.formulaVersionId,
    formulaId: task.formulaVersion.formulaId,
    versionNumber: task.formulaVersion.number,
    file:
      task.file?.status === 'READY'
        ? { name: task.file.name, sizeBytes: task.file.sizeBytes }
        : null,
    downloadUrl:
      task.status === 'COMPLETED' && task.file?.status === 'READY'
        ? `/api/account/exports/${id}/download`
        : null,
  }
}
export function taskState(task: TaskState): TaskState {
  return {
    id: task.id,
    status: task.status,
    attemptCount: task.attemptCount,
    maxAttempts: task.maxAttempts,
    errorMessage: task.errorMessage,
  }
}
