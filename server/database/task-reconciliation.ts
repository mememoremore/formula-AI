import { bumpChatTurn } from './chat-revision'
import type { PrismaClient, Prisma } from '../generated/prisma/client'
import type { PgBoss } from 'pg-boss'
import type { JobKind } from '../../shared/types/tasks'
import { queues } from '../queue/client'
import { lockQueueRecord, queueOwnsTask } from '../queue/record'
import { readBusinessTask, lockTaskConversation, transitionFailure } from './task-lifecycle'
import { hasValidResourceIdentity } from './private-resources'
import { WorkspaceError } from '../services/workspace-error'
export type ReconcileOutcome = 'unchanged' | 'changed' | 'unresolved'
/** 只验证已持久化结果，不创建公式/消息/文件，不接触额度或资源许可。 */
async function hasCompletedResult(
  tx: Prisma.TransactionClient,
  kind: JobKind,
  ownerId: string,
  id: string,
) {
  if (kind === 'recognition')
    return Boolean(
      await tx.formula.findFirst({
        where: { ownerId, recognitionTaskId: id, versions: { some: { number: 1, ownerId } } },
      }),
    )
  if (kind === 'chat')
    return Boolean(
      await tx.chatMessage.findFirst({
        where: { ownerId, turnId: id, role: 'ASSISTANT', status: 'COMPLETED' },
      }),
    )
  return Boolean(
    await tx.exportTask.findFirst({
      where: { id, ownerId, file: { ownerId, kind: 'DOCX', status: 'READY' } },
    }),
  )
}
/** GET兼容入口和后台共用。锁内读取队列事实，不能用旧findJobs快照驱动终态。 */
export async function reconcileTask(
  db: PrismaClient,
  _boss: PgBoss,
  kind: JobKind,
  ownerId: string,
  id: string,
): Promise<ReconcileOutcome> {
  if (!hasValidResourceIdentity(ownerId, id)) throw new WorkspaceError(404, '未找到这个任务。')
  return db.$transaction(
    async (tx) => {
      await lockTaskConversation(tx, kind, ownerId, id)
      const before = await readBusinessTask(tx, kind, ownerId, id)
      if (!before) throw new WorkspaceError(404, '未找到这个任务。')
      if (!['QUEUED', 'PROCESSING'].includes(before.status)) return 'unchanged'
      if (!before.queueJobId) return 'unresolved'
      const job = await lockQueueRecord(tx, queues[kind], before.queueJobId)
      // 缺失不等于失败：可能是保留期/运维/尚未核实的队列问题，不按年龄推断。
      if (!job || !queueOwnsTask(job, ownerId, id)) return 'unresolved'
      const task = await readBusinessTask(tx, kind, ownerId, id)
      if (
        !task ||
        !['QUEUED', 'PROCESSING'].includes(task.status) ||
        task.queueJobId !== before.queueJobId
      )
        return 'unchanged'
      if (job.state === 'active') return 'unchanged' // 过期也交给pg-boss监督决定retry/failed。
      const where = {
        id,
        ownerId,
        queueJobId: before.queueJobId,
        status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] },
      }
      if (job.state === 'created' || job.state === 'retry') {
        if (task.attemptCount > job.retryCount + 1) return 'unresolved'
        if (task.status !== 'PROCESSING') return 'unchanged'
        const data = {
          status: 'QUEUED' as const,
          finishedAt: null,
          errorMessage: '上次处理已中断，正在等待重试。',
        }
        if (kind === 'recognition') await tx.recognitionTask.updateMany({ where, data })
        else if (kind === 'chat') {
          await tx.chatTurn.updateMany({ where, data })
          await bumpChatTurn(tx, ownerId, id)
        } else await tx.exportTask.updateMany({ where, data })
        return 'changed'
      }
      const result = await hasCompletedResult(tx, kind, ownerId, id)
      if (job.state === 'completed' && result) {
        if (!job.startedOn || job.retryCount + 1 > task.maxAttempts) return 'unresolved'
        const data = {
          status: 'COMPLETED' as const,
          startedAt: task.startedAt ?? job.startedOn,
          attemptCount: Math.max(task.attemptCount, job.retryCount + 1),
          finishedAt: new Date(),
          errorMessage: null,
        }
        if (kind === 'recognition')
          await tx.recognitionTask.updateMany({ where, data: { ...data, errorCode: null } })
        else if (kind === 'chat') {
          await tx.chatTurn.updateMany({ where, data })
          await bumpChatTurn(tx, ownerId, id)
        } else await tx.exportTask.updateMany({ where, data })
        return 'changed'
      }
      if (['failed', 'cancelled', 'completed'].includes(job.state)) {
        if (result) return 'unresolved' // 有成品但队列确认不一致，保留，不盲目覆盖/删除。
        if (
          kind === 'chat' &&
          !(await tx.chatMessage.findFirst({
            where: { ownerId, turnId: id, role: 'USER' },
            select: { id: true },
          }))
        )
          return 'unresolved'
        const message =
          job.state === 'completed'
            ? '队列已结束，但处理结果未确认，请重新提交。'
            : '任务处理已中断，请重新提交。'
        const count = await transitionFailure(tx, kind, where, true, message, 'WORKER_INTERRUPTED')
        return count ? 'changed' : 'unchanged'
      }
      return 'unresolved'
    },
    { timeout: 10000 },
  )
}
