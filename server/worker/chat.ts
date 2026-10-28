import { bumpConversation } from '../database/chat-revision'
import { lockTaskConversation } from '../database/task-lifecycle'
import { readPromptHistory } from '../database/chat-history'
import { recordCallObservation } from '../database/chat-calls'
import type { ChatCallObserver, ChatUsage } from '../chat/adapter'
import type { PgBoss } from 'pg-boss'
import type { PrismaClient } from '../generated/prisma/client'
import type { ChatAdapter } from '../chat/adapter'
import { mockChatAdapter } from '../chat/mock-adapter'
import { completeClaim, touchClaim, LostJobClaim, type RunningJob } from '../queue/claim'
import { saveChatProgress } from '../database/chat-progress'
import { withInferenceDeadline } from '../inference/deadline'
import { InferenceFailure } from '../inference/failure'
import { runTask } from './lifecycle'

export async function processChat(
  db: PrismaClient,
  boss: PgBoss,
  job: RunningJob,
  adapter: ChatAdapter = mockChatAdapter,
) {
  await runTask(db, boss, 'chat', job, async () => {
    const turn = await db.chatTurn.findFirstOrThrow({
      where: { id: job.data.taskId, ownerId: job.data.ownerId, queueJobId: job.id },
      include: { conversation: { include: { formulaVersion: true } } },
    })
    const call = await db.$transaction(async (tx) => {
      await lockTaskConversation(tx, 'chat', turn.ownerId, turn.id)
      await touchClaim(boss, tx, job)
      const initialized = await tx.chatTurn.updateMany({
        where: {
          id: turn.id,
          ownerId: turn.ownerId,
          queueJobId: job.id,
          status: 'PROCESSING',
          attemptCount: job.retryCount + 1,
        },
        data: { partialContent: '', responseIsMock: adapter.isMock, responseModel: adapter.model },
      })
      if (!initialized.count) throw new LostJobClaim()
      await bumpConversation(tx, turn.conversationId)
      return tx.chatCallAttempt.create({
        data: {
          ownerId: turn.ownerId,
          turnId: turn.id,
          workerAttempt: job.retryCount + 1,
          queueJobId: job.id,
          provider: adapter.isMock ? 'mock' : 'deepseek',
          model: adapter.model,
          isMock: adapter.isMock,
          usageSource: adapter.isMock ? 'MOCK' : 'UNKNOWN',
        },
      })
    })
    const messages = await readPromptHistory(db, turn.ownerId, turn.conversationId)
    const context = turn.conversation.formulaVersion
    const controller = new AbortController()
    const parent = job.signal ? AbortSignal.any([job.signal, controller.signal]) : controller.signal
    // 无正文时也能发现用户停止或新Worker接管，不必等待供应商首字。
    let checking = false
    const monitor = setInterval(async () => {
      if (checking) return
      checking = true
      try {
        const active = await db.chatTurn.findFirst({
          where: {
            id: turn.id,
            ownerId: turn.ownerId,
            queueJobId: job.id,
            status: 'PROCESSING',
            attemptCount: job.retryCount + 1,
          },
          select: { id: true },
        })
        if (!active) controller.abort(new LostJobClaim())
      } catch {
        controller.abort(new InferenceFailure('UPSTREAM', '任务状态暂时不可用，请稍后重试。', true))
      } finally {
        checking = false
      }
    }, 1000)
    let content = ''
    let lastSaved = 0
    let finishReason = ''
    let usage: ChatUsage | undefined
    let upstreamSucceeded = false
    const started = performance.now()
    const observer: ChatCallObserver = {
      async beforeDispatch() {
        await db.$transaction(async (tx) => {
          await lockTaskConversation(tx, 'chat', turn.ownerId, turn.id)
          await touchClaim(boss, tx, job)
          const active = await tx.chatTurn.findFirst({
            where: {
              id: turn.id,
              ownerId: turn.ownerId,
              status: 'PROCESSING',
              attemptCount: job.retryCount + 1,
            },
          })
          if (!active) throw new LostJobClaim()
          await tx.chatCallAttempt.update({
            where: { id: call.id },
            data: { status: 'IN_FLIGHT', dispatchIntentAt: new Date() },
          })
        })
      },
      async invoked() {
        await recordCallObservation(db, call.id, { transportInvokedAt: new Date() })
      },
      async responded(httpStatus, requestId) {
        await recordCallObservation(db, call.id, {
          httpStatus,
          responseObservedAt: new Date(),
          providerRequestId:
            requestId && /^[a-zA-Z0-9._:-]{1,200}$/.test(requestId) ? requestId : null,
        })
      },
    }
    try {
      // 替身不经过HTTP；仅记录意图，绝不虚构供应商transport/用量。
      if (adapter.isMock) await observer.beforeDispatch()
      await withInferenceDeadline(async (signal) => {
        for await (const delta of adapter.stream(
          {
            formula: context ? { versionId: context.id, latex: context.latex } : undefined,
            messages: [...messages, { role: 'user', content: turn.question }],
          },
          signal,
          observer,
        )) {
          signal.throwIfAborted()
          if (delta.usage && !adapter.isMock) usage = delta.usage
          content += delta.text
          if (content.length > 16000)
            throw new InferenceFailure(
              'INVALID_INPUT',
              '回答超过长度上限，已停止。请缩小问题范围。',
              false,
            )
          if (delta.finishReason) finishReason = delta.finishReason
          if (Date.now() - lastSaved >= 250 && delta.text) {
            await saveChatProgress(db, boss, job, content)
            lastSaved = Date.now()
          }
        }
        signal.throwIfAborted()
        if (finishReason !== 'stop' || !content.trim()) {
          await saveChatProgress(db, boss, job, content)
          throw new InferenceFailure('INVALID_INPUT', '回答未完整生成，请调整问题后重试。', false)
        }
      }, parent)
      upstreamSucceeded = true
      await recordCallObservation(db, call.id, {
        status: 'SUCCEEDED',
        closedAt: new Date(),
        durationMs: Math.round(performance.now() - started),
        finishReason,
        ...(usage ? { usageSource: 'PROVIDER_REPORTED', ...usage } : {}),
      })
      await db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM conversations WHERE id=${turn.conversationId}::uuid AND "ownerId"=${turn.ownerId}::uuid FOR UPDATE`
        await touchClaim(boss, tx, job)
        const active = await tx.chatTurn.findFirst({
          where: {
            id: turn.id,
            ownerId: turn.ownerId,
            queueJobId: job.id,
            status: 'PROCESSING',
            attemptCount: job.retryCount + 1,
          },
        })
        if (!active) throw new LostJobClaim()
        const question = await tx.chatMessage.findFirstOrThrow({
          where: { turnId: turn.id, ownerId: turn.ownerId, role: 'USER' },
        })
        await tx.chatMessage.create({
          data: {
            ownerId: turn.ownerId,
            conversationId: turn.conversationId,
            turnId: turn.id,
            position: question.position + 1,
            role: 'ASSISTANT',
            content,
            isMock: adapter.isMock,
            modelVersion: adapter.model,
          },
        })
        await tx.chatTurn.update({
          where: { id: turn.id },
          data: {
            partialContent: content,
            status: 'COMPLETED',
            finishedAt: new Date(),
            errorMessage: null,
          },
        })
        await bumpConversation(tx, turn.conversationId)
        await tx.chatCallAttempt.update({
          where: { id: call.id },
          data: { resultCommittedAt: new Date(), resultDiscardedAt: null },
        })
        await completeClaim(boss, tx, job)
      })
    } catch (error) {
      const stopped = await db.chatTurn
        .findFirst({
          where: { id: turn.id, ownerId: turn.ownerId },
          select: { status: true, errorMessage: true },
        })
        .catch(() => null)
      await recordCallObservation(db, call.id, {
        status: upstreamSucceeded
          ? 'SUCCEEDED'
          : stopped?.status === 'FAILED' && stopped.errorMessage === '已停止生成。'
            ? 'CANCELLED'
            : error instanceof LostJobClaim || parent.aborted
              ? 'UNKNOWN'
              : 'FAILED',
        resultDiscardedAt: new Date(),
        closedAt: new Date(),
        durationMs: Math.round(performance.now() - started),
        errorCode: error instanceof InferenceFailure ? error.code : 'UNCONFIRMED',
        ...(usage ? { usageSource: 'PROVIDER_REPORTED', ...usage } : {}),
      }).catch(() => {
        /* 后台根据真实队列事实核对，不能把未知调用当成未调用。 */
      })
      throw error
    } finally {
      clearInterval(monitor)
    }
  })
}
