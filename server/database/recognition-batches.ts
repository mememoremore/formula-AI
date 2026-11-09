import { createHash, randomUUID } from 'node:crypto'
import { Prisma, type PrismaClient } from '../generated/prisma/client'
import { WorkspaceError } from '../services/workspace-error'
import { hasValidResourceIdentity } from './private-resources'
import { resourceTransaction } from '../resources/leases'
import { usageDay } from './usage'
import { identityMembers, lockIdentity } from './formula-identities'
import {
  recognitionBatchInputSchema,
  type RecognitionBatchInput,
} from '../../shared/schemas/recognition-batch'
import type { RecognitionBatchView } from '../../shared/types/recognition-batch'

export async function createRecognitionBatch(
  db: PrismaClient,
  ownerId: string,
  raw: RecognitionBatchInput,
  limit: number,
) {
  const input = recognitionBatchInputSchema.safeParse(raw)
  if (!input.success)
    throw new WorkspaceError(400, input.error.issues[0]?.message ?? '批次内容无效。')
  const body = input.data
  const hash = createHash('sha256')
    .update(JSON.stringify({ mode: body.mode, images: body.images }))
    .digest('hex')
  const create = () =>
    resourceTransaction(db, ownerId, async (tx) => {
      const existing = await tx.recognitionBatch.findUnique({
        where: { ownerId_requestKey: { ownerId, requestKey: body.requestKey } },
      })
      if (existing) {
        if (existing.requestHash !== hash)
          throw new WorkspaceError(409, '此批次请求已用于其他图片或模式。')
        return existing.id
      }
      if (
        (await tx.recognitionBatch.count({
          where: { ownerId, status: { in: ['RUNNING', 'PAUSED'] } },
        })) >= 2
      )
        throw new WorkspaceError(409, '请先完成已有批次，每个账号最多同时保留两个进行中的批次。')
      const fileIds = [
        ...new Set(
          body.images.flatMap((image) => [image.fileId, ...image.parts.map((part) => part.fileId)]),
        ),
      ]
      const files = await tx.storedFile.findMany({
        where: { ownerId, id: { in: fileIds }, kind: 'IMAGE', status: 'READY' },
        select: { id: true },
      })
      if (files.length !== fileIds.length)
        throw new WorkspaceError(404, '部分图片不可用或不属于当前账号，请重新上传。')
      const count = body.images.reduce((sum, image) => sum + image.parts.length, 0)
      const usage = await tx.dailyUsage.findFirst({
        where: { ownerId, day: new Date(usageDay()), kind: 'RECOGNITION' },
      })
      if (count > limit - (usage?.used ?? 0))
        throw new WorkspaceError(
          429,
          `本批次需要识别${count}条公式，今日剩余${Math.max(0, limit - (usage?.used ?? 0))}次，请减少图片或区域。`,
        )
      const batch = await tx.recognitionBatch.create({
        data: { ownerId, requestKey: body.requestKey, requestHash: hash, mode: body.mode },
      })
      for (const [position, image] of body.images.entries()) {
        const row = await tx.recognitionBatchImage.create({
          data: { ownerId, batchId: batch.id, fileId: image.fileId, position },
        })
        await tx.recognitionBatchPart.createMany({
          data: image.parts.map((part, position) => ({
            ownerId,
            imageId: row.id,
            fileId: part.fileId,
            position,
          })),
        })
      }
      return batch.id
    })
  if (!hasValidResourceIdentity(ownerId, ownerId)) throw new WorkspaceError(401, '请先登录。')
  try {
    return await create()
  } catch (error) {
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002')
      throw error
    return create()
  }
}

export async function readRecognitionBatch(
  db: PrismaClient,
  ownerId: string,
  id: string,
): Promise<RecognitionBatchView> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个批次。')
  const batch = await db.recognitionBatch.findFirst({
    where: { id, ownerId },
    include: {
      images: {
        orderBy: { position: 'asc' },
        include: {
          file: { select: { name: true } },
          parts: {
            orderBy: { position: 'asc' },
            include: {
              task: {
                include: {
                  formula: { include: { versions: { orderBy: { number: 'desc' }, take: 1 } } },
                },
              },
            },
          },
        },
      },
    },
  })
  if (!batch) throw new WorkspaceError(404, '未找到这个批次。')
  const images: RecognitionBatchView['images'] = batch.images.map((image) => ({
    id: image.id,
    fileId: image.fileId,
    name: image.file.name,
    position: image.position,
    parts: image.parts.map((part) => {
      const formula = part.task?.formula,
        version = formula?.versions[0]
      return {
        id: part.id,
        fileId: part.fileId,
        position: part.position,
        taskId: part.taskId,
        status:
          (part.task?.errorMessage ?? part.errorMessage) === '已停止任务。'
            ? 'CANCELLED'
            : (part.task?.status ?? (part.errorMessage ? 'FAILED' : 'WAITING')),
        errorMessage: part.task?.errorMessage ?? part.errorMessage,
        formula:
          formula && !formula.deletedAt && version
            ? { id: formula.id, title: formula.title, latex: version.latex, versionId: version.id }
            : null,
      }
    }),
  }))
  const parts = images.flatMap((image) => image.parts)
  return {
    id: batch.id,
    mode: batch.mode as RecognitionBatchView['mode'],
    status: batch.status as RecognitionBatchView['status'],
    createdAt: batch.createdAt.toISOString(),
    errorMessage: batch.errorMessage,
    total: parts.length,
    completed: parts.filter((part) => part.status === 'COMPLETED').length,
    failed: parts.filter((part) => part.status === 'FAILED').length,
    stopped: parts.filter((part) => part.status === 'CANCELLED').length,
    images,
  }
}

export async function resumeRecognitionBatch(
  db: PrismaClient,
  ownerId: string,
  id: string,
  expected: { id: string; taskId: string | null }[],
) {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个批次。')
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM recognition_batches WHERE id=${id}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`
    if (!rows.length) throw new WorkspaceError(404, '未找到这个批次。')
    const batch = await tx.recognitionBatch.findUniqueOrThrow({ where: { id } })
    if (batch.status === 'CANCELLED')
      throw new WorkspaceError(409, '批次已停止，请新建批次处理其他图片。')
    if (batch.status === 'RUNNING') return
    if (batch.leaseUntil && batch.leaseUntil > new Date())
      throw new WorkspaceError(409, '后台正在更新批次，请稍后重试。')
    const failed = await tx.recognitionBatchPart.findMany({
      where: {
        ownerId,
        image: { batchId: id },
        OR: [{ task: { status: 'FAILED' } }, { taskId: null, errorMessage: { not: null } }],
      },
      select: { id: true, taskId: true },
    })
    if (
      failed.length !== expected.length ||
      failed.some(
        (part) => !expected.some((value) => value.id === part.id && value.taskId === part.taskId),
      )
    )
      throw new WorkspaceError(409, '识别结果已更新，请刷新批次后再重试失败项。')
    for (const part of failed)
      await tx.recognitionBatchPart.update({
        where: { id: part.id },
        data: { taskId: null, errorMessage: null, requestKey: randomUUID() },
      })
    await tx.recognitionBatch.update({
      where: { id },
      data: { status: 'RUNNING', errorMessage: null },
    })
  })
}

export async function categorizeBatchResults(
  db: PrismaClient,
  ownerId: string,
  batchId: string,
  ids: string[],
  categoryId: string | null,
) {
  await readRecognitionBatch(db, ownerId, batchId)
  return resourceTransaction(db, ownerId, async (tx) => {
    await lockIdentity(tx, ownerId)
    if (categoryId && !(await tx.category.findFirst({ where: { id: categoryId, ownerId } })))
      throw new WorkspaceError(404, '未找到这个分类。')
    const parts = await tx.recognitionBatchPart.findMany({
      where: {
        ownerId,
        image: { batchId },
        task: { formula: { id: { in: ids }, ownerId, deletedAt: null } },
      },
      select: { task: { select: { formula: { select: { id: true } } } } },
    })
    const found = new Set(
      parts.flatMap((part) => (part.task?.formula ? [part.task.formula.id] : [])),
    )
    if (found.size !== ids.length) throw new WorkspaceError(404, '部分公式不属于此批次或已被删除。')
    const members = (await Promise.all(ids.map((id) => identityMembers(tx, ownerId, id)))).flat()
    const memberIds = [...new Set(members.map((x) => x.id))]
    const updated = await tx.formula.updateMany({
      where: { ownerId, id: { in: memberIds }, deletedAt: null },
      data: { categoryId },
    })
    if (updated.count !== memberIds.length)
      throw new WorkspaceError(409, '部分公式已变更，请刷新批次后重试。')
    return { saved: ids.length }
  })
}

/** Replace only a failed region; the request key makes an unconfirmed upload replay safe. */
export async function replaceFailedBatchPart(
  db: PrismaClient,
  ownerId: string,
  batchId: string,
  partId: string,
  input: {
    fileId: string
    requestKey: string
    expectedTaskId: string | null
    expectedFileId: string
  },
) {
  if (!hasValidResourceIdentity(ownerId, batchId) || !hasValidResourceIdentity(ownerId, partId))
    throw new WorkspaceError(404, '未找到这个公式区域。')
  return resourceTransaction(db, ownerId, async (tx) => {
    await tx.$queryRaw`SELECT id FROM recognition_batches WHERE id=${batchId}::uuid AND "ownerId"=${ownerId}::uuid FOR UPDATE`
    const batch = await tx.recognitionBatch.findFirst({ where: { id: batchId, ownerId } })
    if (!batch || batch.status === 'CANCELLED')
      throw new WorkspaceError(409, '批次不存在或已停止，请新建批次。')
    const part = await tx.recognitionBatchPart.findFirst({
      where: { id: partId, ownerId, image: { batchId } },
      include: { task: { select: { status: true } } },
    })
    if (!part) throw new WorkspaceError(404, '未找到这个公式区域。')
    if (part.requestKey === input.requestKey && part.fileId === input.fileId)
      return { replaced: true }
    if (
      part.taskId !== input.expectedTaskId ||
      part.fileId !== input.expectedFileId ||
      !(part.task?.status === 'FAILED' || (!part.taskId && part.errorMessage))
    )
      throw new WorkspaceError(409, '公式区域已变化，请刷新批次后再上传。')
    if (
      !(await tx.storedFile.findFirst({
        where: { id: input.fileId, ownerId, kind: 'IMAGE', status: 'READY' },
        select: { id: true },
      }))
    )
      throw new WorkspaceError(404, '图片不可用或不属于当前账号，请重新上传。')
    await tx.recognitionBatchPart.update({
      where: { id: partId },
      data: {
        fileId: input.fileId,
        requestKey: input.requestKey,
        taskId: null,
        errorMessage: null,
      },
    })
    await tx.recognitionBatch.update({
      where: { id: batchId },
      data: { status: 'RUNNING', errorMessage: null, leaseToken: null, leaseUntil: null },
    })
    return { replaced: true }
  })
}
