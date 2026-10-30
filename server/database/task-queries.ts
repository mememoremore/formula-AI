import { Prisma, type PrismaClient } from '../generated/prisma/client'
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
  query = '',
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
  if (query) {
    const anchor = cursor
      ? await db.recognitionTask.findFirst({
          where: { id: cursor, ownerId },
          select: { id: true, createdAt: true },
        })
      : null
    if (cursor && !anchor) throw new WorkspaceError(404, '未找到这条识别记录。')
    const rows = await db.$queryRaw<
      {
        id: string
        status: RecognitionHistoryPage['items'][number]['status']
        title: string
        formulaId: string | null
        latex: string | null
        createdAt: Date
        errorMessage: string | null
      }[]
    >(Prisma.sql`
      SELECT t.id, t.status, COALESCE(f.title, file.name) AS title,
        f.id AS "formulaId", version.latex, t."createdAt", t."errorMessage"
      FROM recognition_tasks t
      JOIN stored_files file ON file.id = t."inputFileId" AND file."ownerId" = t."ownerId"
      LEFT JOIN formulas f ON f."recognitionTaskId" = t.id AND f."ownerId" = t."ownerId" AND f."deletedAt" IS NULL
      LEFT JOIN LATERAL (
        SELECT v.latex FROM formula_versions v
        WHERE v."formulaId" = f.id AND v."ownerId" = t."ownerId"
        ORDER BY v.number DESC LIMIT 1
      ) version ON true
      WHERE t."ownerId" = ${ownerId}::uuid
        AND (position(lower(${query}) in lower(COALESCE(f.title, file.name))) > 0
          OR position(lower(${query}) in lower(COALESCE(version.latex, ''))) > 0)
        ${anchor ? Prisma.sql`AND (t."createdAt", t.id) < (${anchor.createdAt}::timestamptz, ${anchor.id}::uuid)` : Prisma.empty}
      ORDER BY t."createdAt" DESC, t.id DESC LIMIT 26
    `)
    return {
      items: rows.slice(0, 25).map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
      nextCursor: rows.length > 25 ? rows[24]!.id : null,
    }
  }
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
          deletedAt: true,
          versions: { orderBy: { number: 'desc' }, take: 1, select: { latex: true } },
        },
      },
    },
  })
  return {
    items: tasks.slice(0, 25).map((task) => ({
      id: task.id,
      status: task.status,
      title: task.formula && !task.formula.deletedAt ? task.formula.title : task.inputFile.name,
      formulaId: task.formula && !task.formula.deletedAt ? task.formula.id : null,
      latex:
        task.formula && !task.formula.deletedAt ? (task.formula.versions[0]?.latex ?? null) : null,
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
          deletedAt: true,
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
    requestedTitle: task.requestedTitle,
    formulaId: task.formula && !task.formula.deletedAt ? task.formula.id : null,
    isMock:
      task.formula && !task.formula.deletedAt ? (task.formula.versions[0]?.isMock ?? true) : true,
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
