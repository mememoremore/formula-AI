import { testEnvironment } from '../support/integration.ts'
import { readFile, writeFile } from 'node:fs/promises'
import { randomBytes, randomUUID } from 'node:crypto'
import assert from 'node:assert/strict'
import { createDatabaseClient } from '../../server/database/client'
import { createAuthentication } from '../../server/auth/config'
import { createQueueClient, queues, type JobPayload } from '../../server/queue/client'
import { createConversation, submitChatTurn } from '../../server/database/conversations'
import { defaultUsageLimits } from '../../server/database/usage'
import { beginAttempt } from '../../server/worker/lifecycle'
import { startTaskRecovery } from '../../server/worker/recovery'
import { processChat } from '../../server/worker/chat'
const db = createDatabaseClient(testEnvironment.databaseUrl),
  boss = createQueueClient(testEnvironment.databaseUrl)
await boss.start()
try {
  if (process.argv[2] === 'cleanup') {
    const { ownerId } = JSON.parse(await readFile('tmp/r13-browser-fixture.json', 'utf8')) as {
      ownerId: string
    }
    const user = await db.user.findUniqueOrThrow({ where: { id: ownerId } })
    assert.ok(user.email.startsWith('r13-browser-') && user.email.endsWith('@formula.test'))
    const jobs = await boss.findJobs(queues.chat, { data: { ownerId }, limit: 1000 })
    if (jobs.length)
      await boss.deleteJob(
        queues.chat,
        jobs.map((j) => j.id),
      )
    await db.user.delete({ where: { id: ownerId } })
    console.log('R13 browser-owned fixture cleanup PASS')
  } else if (process.argv[2] === 'prepare') {
    const auth = createAuthentication(db, {
      baseURL: testEnvironment.apiUrl,
      secret: testEnvironment.authSecret,
      isDevelopment: false,
    })
    const result = await auth.api.signUpEmail({
      body: {
        name: 'R13浏览器验收',
        email: `r13-browser-${randomUUID()}@formula.test`,
        password: randomBytes(24).toString('base64url'),
      },
      returnHeaders: true,
    })
    const ownerId = result.response.user.id
    const cookies = result.headers.getSetCookie().map((value) => {
      const entry = value.split(';')[0]!,
        pos = entry.indexOf('=')
      return {
        name: entry.slice(0, pos),
        value: entry.slice(pos + 1),
        domain: '127.0.0.1',
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      }
    })
    for (const failed of [true, false]) {
      const conversation = await createConversation(db, ownerId, null, randomUUID())
      await db.conversation.update({
        where: { id: conversation.id },
        data: { title: failed ? 'R13浏览器·恢复失败' : 'R13浏览器·正常完成' },
      })
      const task = await submitChatTurn(db, boss, defaultUsageLimits, {
        ownerId,
        conversationId: conversation.id,
        requestKey: randomUUID(),
        question: '验证任务终态，不发起真实模型请求。',
      })
      const [job] = await boss.fetch<JobPayload>(queues.chat, { includeMetadata: true })
      assert.equal(job?.data.taskId, task.id)
      if (failed) {
        await beginAttempt(db, 'chat', job!)
        await boss.cancel(job!.name, { id: job!.id, retryCount: job!.retryCount })
        const recovery = await startTaskRecovery(db, boss, {
          enabled: true,
          intervalMs: 20,
          batchSize: 10,
        })
        await recovery.stop()
        assert.equal(
          (await db.chatTurn.findUniqueOrThrow({ where: { id: task.id } })).status,
          'FAILED',
        )
      } else
        await processChat(db, boss, job!, {
          isMock: true,
          model: 'r13-browser',
          async *stream() {
            yield { text: 'R13后台验证回答：公式可以继续学习。', finishReason: 'stop' }
          },
        })
    }
    await writeFile('tmp/r13-browser-fixture.json', JSON.stringify({ ownerId }), { mode: 0o600 })
    await writeFile('tmp/r13-browser-auth.json', JSON.stringify({ cookies, origins: [] }), {
      mode: 0o600,
    })
    console.log('R13 browser fixtures ready; credentials not printed')
  } else throw new Error('Explicit prepare or cleanup required')
} finally {
  await boss.stop()
  await db.$disconnect()
}
