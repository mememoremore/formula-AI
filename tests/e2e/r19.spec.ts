import { test, expect } from '@playwright/test'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { visit, captureFailure } from './browser'
import { testEnvironment } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import type { SavedFormula } from '../../shared/types/workspace'
const db = createDatabaseClient(testEnvironment.databaseUrl)
test.afterAll(() => db.$disconnect())
test.afterEach(async ({ page }, info) => captureFailure(page, info))
for (const width of [320, 390, 430, 1440])
  test(`R19结构化解释、历史、重新生成和追问 / ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 })
    await context.route('**/*', async (route) => {
      const u = new URL(route.request().url())
      if (!['http:', 'https:'].includes(u.protocol) || u.origin === testEnvironment.apiUrl)
        await route.continue()
      else await route.abort('blockedbyclient')
    })
    await visit(page, '/login?redirect=/library?space=account')
    await page.getByRole('button', { name: '还没有账号？创建一个' }).click()
    await page.getByPlaceholder('希望我们如何称呼你').fill('R19测试')
    await page.getByPlaceholder('请输入邮箱').fill(`r19-${randomUUID()}@formula.test`)
    await page
      .locator('input[type="password"]')
      .fill('R19-' + randomBytes(18).toString('base64url'))
    await page.getByRole('button', { name: '创建账号', exact: true }).click()
    await expect(page).toHaveURL(
      (url) => url.pathname === '/library' && url.searchParams.get('space') === 'account',
    )
    const created = await page.request.post('/api/account/formulas', {
      headers: { origin: testEnvironment.apiUrl },
      data: { requestKey: randomUUID(), title: 'R19二次方程', latex: 'x^2-5x+6=0' },
    })
    expect(created.status()).toBe(201)
    const formula = (await created.json()) as SavedFormula
    await visit(page, '/formulas/' + formula.id)
    await expect(page.getByRole('button', { name: '生成新的结构化解释' })).toBeEnabled()
    let lost = false
    await page.route('**/api/account/formulas/*/explanations', async (route) => {
      if (route.request().method() === 'POST' && !lost) {
        lost = true
        const r = await route.fetch()
        expect(r.status()).toBe(202)
        await route.abort('failed')
      } else await route.continue()
    })
    await page.getByRole('button', { name: '生成新的结构化解释' }).click()
    await expect(page.getByRole('button', { name: '确认原解释请求' })).toBeEnabled()
    await page.reload()
    await expect(page.getByRole('button', { name: '确认原解释请求' })).toBeEnabled()
    await page.getByRole('button', { name: '确认原解释请求' }).click()
    await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
    const first = page.url().split('/').at(-1)!
    await expect(page.getByTestId('structured-explanation')).toBeVisible()
    await expect(page.getByText('固定 v1 · 模拟解释', { exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: '符号含义', exact: true })).toBeVisible()
    await expect(
      page.getByText('先理解公式的结构，再核对适用条件。', { exact: true }),
    ).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    const { ownerId } = await db.conversation.findUniqueOrThrow({ where: { id: first } })
    expect(await db.conversation.count({ where: { ownerId, purpose: 'EXPLANATION' } })).toBe(1)
    expect((await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used).toBe(
      1,
    )
    expect(await db.recognitionTask.count({ where: { ownerId } })).toBe(0)
    mkdirSync('tmp/r19/screenshots', { recursive: true })
    await page.screenshot({ path: `tmp/r19/screenshots/explanation-${width}.png`, fullPage: true })
    const composer = page.getByRole('textbox', { name: '输入提问，Shift 加回车换行' })
    await expect(composer).toBeEnabled()
    await composer.fill('请基于原解释进一步说明条件')
    await page.getByRole('button', { name: '发送提问', exact: true }).click()
    await expect
      .poll(
        async () =>
          (
            await db.chatTurn.findFirst({
              where: { conversationId: first, question: '请基于原解释进一步说明条件' },
            })
          )?.status,
      )
      .toBe('COMPLETED')
    await expect(page.getByText('方程可以因式分解', { exact: false }).last()).toBeVisible()
    await page.reload()
    await expect(page.getByTestId('structured-explanation')).toBeVisible()
    await page.getByRole('link', { name: '重新生成 / 解释历史' }).click()
    await expect(page.getByRole('link', { name: /v1 · 解释完成/ })).toBeVisible()
    await page.getByRole('button', { name: '生成新的结构化解释' }).click()
    await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
    const second = page.url().split('/').at(-1)!
    expect(second).not.toBe(first)
    await expect(page.getByTestId('structured-explanation')).toBeVisible()
    expect(await db.conversation.count({ where: { ownerId, purpose: 'EXPLANATION' } })).toBe(2)
    await visit(page, '/ai/' + first)
    await expect(page.getByTestId('structured-explanation')).toBeVisible()
    await expect(page.getByText('请基于原解释进一步说明条件', { exact: true })).toBeVisible()
    expect((await db.dailyUsage.findFirstOrThrow({ where: { ownerId, kind: 'CHAT' } })).used).toBe(
      3,
    )
    expect(
      await page.evaluate(() => sessionStorage.getItem('formula-explanation-request-v1')),
    ).toBeNull()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  })
