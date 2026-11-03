import { readTestOtp } from '../support/registration-mail'
import { test, expect } from '@playwright/test'
import { randomUUID, randomBytes, createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { testEnvironment } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import { visit, captureFailure } from './browser'

const db = createDatabaseClient(testEnvironment.databaseUrl)
test.afterAll(async () => {
  await db.$disconnect()
})
test.afterEach(async ({ page }, info) => {
  await captureFailure(page, info)
})
test('@fault 真实回执丢失、失败/停止历史、重试与 Worker 进程退出', async ({ page, context }) => {
  test.setTimeout(240000)
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (url.origin === testEnvironment.apiUrl || !['http:', 'https:'].includes(url.protocol))
      await route.continue()
    else await route.abort('blockedbyclient')
  })
  await page.setViewportSize({ width: 390, height: 900 })
  // Real signup/OTP/session fixture; this test focuses on task recovery.
  const email = 'fault-' + randomUUID() + '@formula.test',
    password = 'E2e-' + randomBytes(18).toString('base64url')
  const headers = { origin: testEnvironment.apiUrl }
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers,
        data: { name: '故障验收', email, password },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await page.request.post('/api/auth/email-otp/verify-email', {
        headers,
        data: { email, otp: readTestOtp(email) },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', { headers, data: { email, password } })
    ).status(),
  ).toBe(200)
  await visit(page, '/ai/new')
  let discarded = false
  await page.route('**/api/account/conversations', async (route) => {
    if (route.request().method() === 'POST' && !discarded) {
      discarded = true
      await route.fetch() // Real server commits; only the client receipt is lost.
      await route.abort('failed')
    } else await route.continue()
  })
  const input = page.getByRole('textbox', { name: '输入提问，Shift 加回车换行' })
  await expect(input).toBeEnabled()
  await input.fill('[e2e:fail] 首轮失败')
  await page.getByRole('button', { name: '发送提问', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认原提问' })).toBeVisible()
  await page.getByRole('button', { name: '确认原提问' }).click()
  await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
  const id = page.url().split('/').at(-1)!
  const { ownerId } = await db.conversation.findUniqueOrThrow({ where: { id } })
  expect(await db.conversation.count({ where: { ownerId } })).toBe(1)
  const waitTurn = async (question: string, status: string) => {
    await expect
      .poll(
        async () =>
          (await db.chatTurn.findFirst({ where: { conversationId: id, question } }))?.status,
        { timeout: 90000 },
      )
      .toBe(status)
    return db.chatTurn.findFirstOrThrow({ where: { conversationId: id, question } })
  }
  const submit = async (question: string) => {
    await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0)
    await expect(input).toBeEnabled()
    await input.fill(question)
    await page.getByRole('button', { name: '发送提问', exact: true }).click()
  }
  await waitTurn('[e2e:fail] 首轮失败', 'FAILED')
  await submit('失败后的正常追问')
  await waitTurn('失败后的正常追问', 'COMPLETED')
  await submit('[e2e:stop] 停止这一轮')
  await expect
    .poll(
      async () =>
        (
          await db.chatTurn.findFirst({
            where: { conversationId: id, question: '[e2e:stop] 停止这一轮' },
          })
        )?.partialContent,
    )
    .toContain('受控模型')
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  expect((await waitTurn('[e2e:stop] 停止这一轮', 'FAILED')).errorMessage).toBe('已停止生成。')
  await submit('停止后的正常追问')
  await waitTurn('停止后的正常追问', 'COMPLETED')
  await submit('[e2e:retry] 可重试故障')
  expect((await waitTurn('[e2e:retry] 可重试故障', 'COMPLETED')).attemptCount).toBe(2)
  await visit(page, '/ai')
  await visit(page, `/ai/${id}`) // Reconnect real EventSource; no new generation request.
  await submit('[e2e:crash] 进程退出后恢复')
  await expect
    .poll(
      async () =>
        (
          await db.chatTurn.findFirst({
            where: {
              conversationId: id,
              question: '[e2e:crash] 进程退出后恢复',
            },
          })
        )?.partialContent,
    )
    .toContain('受控模型')
  await context.setOffline(true)
  const crashed = await waitTurn('[e2e:crash] 进程退出后恢复', 'COMPLETED')
  await context.setOffline(false)
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0)
  expect(crashed.attemptCount).toBe(2)
  expect(await db.chatTurn.count({ where: { conversationId: id } })).toBe(6)
  expect((await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used).toBe(6)
  await expect
    .poll(async () =>
      db.chatCallAttempt.count({ where: { turnId: crashed.id, status: 'UNKNOWN' } }),
    )
    .toBe(1)
  const proofs = readFileSync(
    resolve('tmp/r1-test', testEnvironment.runId, 'prompt-proof.jsonl'),
    'utf8',
  )
    .trim()
    .split('\n')
    .map(
      (line) => JSON.parse(line) as { taskId: string; messages: { role: string; hash: string }[] },
    )
    .filter((entry) => entry.taskId === crashed.id)
  const hash = (text: string) => createHash('sha256').update(text).digest('hex')
  expect(proofs).toHaveLength(2)
  for (const proof of proofs) {
    expect(
      proof.messages.filter((message) => message.role === 'user').map((message) => message.hash),
    ).toEqual(
      [
        '失败后的正常追问',
        '停止后的正常追问',
        '[e2e:retry] 可重试故障',
        '[e2e:crash] 进程退出后恢复',
      ].map(hash),
    )
  }
  await page.reload()
  await expect(page.getByText('[e2e:crash] 进程退出后恢复', { exact: true })).toBeVisible()
})

test('@fault 重新生成保留旧片段且回执重放不重复扣额；断网及前台事件只读恢复', async ({
  page,
  context,
}) => {
  test.setTimeout(180000)
  const headers = { origin: testEnvironment.apiUrl },
    email = 'recovery-' + randomUUID() + '@formula.test',
    password = 'Recovery-' + randomUUID()
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers,
        data: { name: '恢复验收', email, password },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await page.request.post('/api/auth/email-otp/verify-email', {
        headers,
        data: { email, otp: readTestOtp(email) },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await page.request.post('/api/auth/sign-in/email', { headers, data: { email, password } })
    ).status(),
  ).toBe(200)
  await page.setViewportSize({ width: 390, height: 900 })
  await visit(page, '/ai/new')
  const question = '[e2e:once-fail] [e2e:slow] 自动恢复测试'
  await page.getByRole('textbox', { name: '输入提问，Shift 加回车换行' }).fill(question)
  await page.getByRole('button', { name: '发送提问', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
  const id = page.url().split('/').at(-1)!
  await expect(
    page.getByRole('button', { name: '重新生成（使用1次额度）', exact: true }),
  ).toBeVisible()
  const old = await db.chatTurn.findFirstOrThrow({
    where: { conversationId: id, status: 'FAILED' },
  })
  expect(old.partialContent).toContain('受控模型')
  const originalMessage = await db.chatMessage.findFirstOrThrow({
    where: { turnId: old.id, role: 'ASSISTANT' },
  })
  let lost = false,
    posts = 0,
    reads = 0
  page.on('request', (r) => {
    if (r.url().includes('/conversations/' + id)) {
      if (r.method() === 'POST' && r.url().endsWith('/messages')) posts++
      if (r.method() === 'GET' && !r.url().includes('/events')) reads++
    }
  })
  await page.route('**/api/account/conversations/' + id + '/messages', async (route) => {
    if (!lost) {
      lost = true
      await route.fetch()
      await route.abort('failed')
    } else await route.continue()
  })
  await page.getByRole('button', { name: '重新生成（使用1次额度）', exact: true }).click()
  await expect(page.getByRole('button', { name: '确认原提问', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '确认原提问', exact: true }).click()
  await context.setOffline(true)
  await page.waitForTimeout(4000)
  await context.setOffline(false)
  await expect
    .poll(
      async () =>
        (
          await db.chatTurn.findMany({
            where: { conversationId: id },
            orderBy: { createdAt: 'asc' },
          })
        ).at(-1)?.status,
      { timeout: 60000 },
    )
    .toBe('COMPLETED')
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0)
  expect(await db.chatTurn.count({ where: { conversationId: id } })).toBe(2)
  expect(
    (await db.dailyUsage.findFirstOrThrow({ where: { ownerId: old.ownerId, kind: 'CHAT' } })).used,
  ).toBe(2)
  expect(
    (await db.chatMessage.findUniqueOrThrow({ where: { id: originalMessage.id } })).content,
  ).toBe(originalMessage.content)
  const before = reads,
    beforePosts = posts
  await page.waitForTimeout(1100)
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' })
    document.dispatchEvent(new Event('visibilitychange'))
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' })
    document.dispatchEvent(new Event('visibilitychange'))
  })
  await expect.poll(() => reads).toBeGreaterThan(before)
  expect(posts).toBe(beforePosts)
  await page.evaluate(() => {
    delete (document as unknown as Record<string, unknown>).visibilityState
  })
  expect(await db.chatTurn.count({ where: { conversationId: id } })).toBe(2)
})
