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
    const initialized = await db.$transaction(async (tx) => {
      await touchClaim(boss, tx, job)
      return tx.chatTurn.updateMany({
        where: {
          id: turn.id,
          ownerId: turn.ownerId,
          queueJobId: job.id,
          status: 'PROCESSING',
          attemptCount: job.retryCount + 1,
        },
        data: { partialContent: '', responseIsMock: adapter.isMock, responseModel: adapter.model },
      })
    })
    if (!initialized.count) throw new LostJobClaim()
    const messages = await db.chatMessage.findMany({
      where: { conversationId: turn.conversationId, ownerId: turn.ownerId, status: 'COMPLETED' },
      orderBy: { position: 'desc' },
      take: 19,
    })
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
    try {
      await withInferenceDeadline(async (signal) => {
        for await (const delta of adapter.stream(
          {
            formula: context ? { versionId: context.id, latex: context.latex } : undefined,
            messages: messages.toReversed().map((message) => ({
              role: message.role === 'USER' ? 'user' : 'assistant',
              content: message.content,
            })),
          },
          signal,
        )) {
          signal.throwIfAborted()
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
        await tx.conversation.update({
          where: { id: turn.conversationId },
          data: { updatedAt: new Date() },
        })
        await completeClaim(boss, tx, job)
      })
    } finally {
      clearInterval(monitor)
    }
  })
}
