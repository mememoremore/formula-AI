import type { PrismaClient } from '../generated/prisma/client'
export { reconcileTask } from './task-reconciliation'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'
import type {
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
