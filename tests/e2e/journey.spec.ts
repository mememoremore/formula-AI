import { test, expect, type Page } from '@playwright/test'
import { randomUUID, randomBytes } from 'node:crypto'
import { visit, captureFailure } from './browser'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { testEnvironment } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import type { SavedFormula } from '../../shared/types/workspace'

const db = createDatabaseClient(testEnvironment.databaseUrl)
test.afterAll(async () => {
  await db.$disconnect()
})
test.afterEach(async ({ page }, info) => {
  await captureFailure(page, info)
})
test.beforeEach(async ({ context }) => {
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    if (!['http:', 'https:'].includes(url.protocol) || url.origin === testEnvironment.apiUrl)
      await route.continue()
    else await route.abort('blockedbyclient')
  })
})
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}
async function signup(page: Page, email: string, password: string) {
  await visit(page, '/login?redirect=/upload')
  await page.getByRole('button', { name: '还没有账号？创建一个' }).click()
  await page.getByPlaceholder('希望我们如何称呼你').fill('R16测试')
  await page.getByPlaceholder('请输入邮箱').fill(email)
  await page.locator('input[type="password"]').fill(password)
  const registration = page.waitForResponse(
    (response) =>
      response.url().endsWith('/api/auth/sign-up/email') && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  expect((await registration).status()).toBe(200)
  await expect(page).toHaveURL(/\/upload$/)
  const session = await page.request.get('/api/account/session')
  expect(session.status()).toBe(200)
  expect(((await session.json()) as { user: { email: string } | null }).user?.email).toBe(email)
}
async function send(page: Page, text: string) {
  const input = page.getByRole('textbox', { name: '输入提问，Shift 加回车换行' })
  await expect(input).toBeEnabled()
  await input.fill(text)
  await page.getByRole('button', { name: '发送提问', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
  const conversationId = page.url().split('/').at(-1)!
  await expect
    .poll(
      async () =>
        (
          await db.chatTurn.findFirst({
            where: { conversationId, question: text },
          })
        )?.status,
    )
    .toBe('COMPLETED')
  await expect(page.getByText(text, { exact: true })).toBeVisible()
  await expect(page.getByText('方程可以因式分解', { exact: false }).last()).toBeVisible()
  await expect(page.getByRole('button', { name: '停止生成', exact: true })).toHaveCount(0)
}

for (const width of [320, 390, 430, 1440])
  test(`真实链路 A–D / ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 })
    const email = `e2e-${randomUUID()}@formula.test`
    const password = `E2e-${randomBytes(18).toString('base64url')}`
    await signup(page, email, password)
    await noOverflow(page)
    // A small valid PNG, real Sharp validation and real S3 upload.
    const sharp = (await import('sharp')).default
    const image = await sharp({
      create: { width: 320, height: 180, channels: 3, background: '#fffdf8' },
    })
      .png()
      .toBuffer()
    await page
      .getByLabel('选择公式图片', { exact: true })
      .setInputFiles({ name: 'R16公式.png', mimeType: 'image/png', buffer: image })
    await expect(page.getByRole('img', { name: '已选择的公式图片预览' })).toBeVisible()
    await noOverflow(page)
    await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
    await expect(page).toHaveURL(/\/recognitions\/[0-9a-f-]+$/)
    await expect(page.getByRole('link', { name: /查看.*公式|查看.*结果/ })).toBeVisible()
    await page.getByRole('link', { name: /查看.*公式|查看.*结果/ }).click()
    await expect(page).toHaveURL(/\/formulas\/[0-9a-f-]+$/)
    const formulaId = page.url().split('/').at(-1)!
    const initialResponse = await page.request.get(`/api/account/formulas/${formulaId}`)
    expect(initialResponse.status()).toBe(200)
    const initial = (await initialResponse.json()) as SavedFormula
    const v1 = initial.versions[0]!
    await page.getByRole('button', { name: /^编辑公式/ }).click()
    await page.getByLabel('公式名称', { exact: true }).fill('R16已修订公式')
    await page.getByLabel('LaTeX', { exact: true }).fill('x^2-7x+12=0')
    await page.getByRole('button', { name: '确认并保存' }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await page.getByRole('button', { name: /版本记录/ }).click()
    await expect(page.getByRole('dialog').getByText(/v1 ·/)).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await page.getByRole('button', { name: '收藏这条公式', exact: true }).click()
    await expect(page.getByRole('button', { name: '取消收藏这条公式', exact: true })).toBeVisible()
    const category = await page.request.post('/api/account/categories', {
      data: { name: 'R16分类' },
      headers: { origin: testEnvironment.apiUrl },
    })
    expect(category.ok()).toBe(true)
    const categoryData = (await category.json()) as { id: string }
    await page.getByRole('button', { name: '未分类', exact: true }).click()
    await page.getByRole('dialog').getByRole('combobox').selectOption(categoryData.id)
    await page.getByRole('button', { name: '保存分类', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await noOverflow(page)
    await visit(page, '/library?space=account&view=favorites')
    await expect(page.getByText('R16已修订公式', { exact: true })).toBeVisible()
    await visit(page, `/ai/new?versionId=${v1.id}`)
    const events: number[] = []
    page.on('response', (response) => {
      if (response.url().includes('/events')) events.push(response.status())
    })
    await send(page, '请解释这个公式')
    const conversationId = page.url().split('/').at(-1)!
    await send(page, '继续解释推导')
    await page.reload()
    await expect(page.getByText('继续解释推导', { exact: true })).toBeVisible()
    expect(events.some((status) => status === 200)).toBe(true)
    await noOverflow(page)
    const calls = await db.chatCallAttempt.findMany({ where: { turn: { conversationId } } })
    expect(calls).toHaveLength(2)
    expect(
      calls.every(
        (call) =>
          call.status === 'SUCCEEDED' && call.usageSource === 'MOCK' && call.totalTokens === null,
      ),
    ).toBe(true)
    await visit(page, `/formulas/${formulaId}`)
    await page.getByRole('button', { name: '导出 Word', exact: true }).click()
    await page.getByRole('dialog').getByRole('combobox').selectOption(v1.id)
    await page.getByRole('button', { name: '生成 Word 文档', exact: true }).click()
    await expect(page).toHaveURL(/\/exports\/[0-9a-f-]+$/)
    const exportId = page.url().split('/').at(-1)!
    const downloadPromise = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 Word', exact: true }).click()
    const download = await downloadPromise
    const path = await download.path()
    expect(path).toBeTruthy()
    const xml = strFromU8(unzipSync(readFileSync(path!))['word/document.xml']!)
    expect(xml).toContain('x^2-5x+6=0')
    expect(xml).not.toContain('x^2-7x+12=0')
    expect(xml).toContain('m:oMath')
    await visit(page, '/settings')
    page.on('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await signup(page, `e2e-b-${randomUUID()}@formula.test`, password)
    for (const resource of [
      `/api/account/formulas/${formulaId}`,
      `/api/account/conversations/${conversationId}`,
      `/api/account/exports/${exportId}`,
      `/api/account/exports/${exportId}/download`,
      `/api/account/files/${initial.image!.id}/content`,
    ]) {
      const denied = await page.request.get(resource)
      expect([403, 404]).toContain(denied.status())
    }
    await visit(page, '/settings')
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
    await visit(page, '/login?redirect=/library?space=account')
    await page.getByPlaceholder('请输入邮箱').fill(email)
    await page.getByPlaceholder('请输入密码').fill(password)
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page).toHaveURL(/\/library/)
    await expect(page.getByText('R16已修订公式', { exact: true })).toBeVisible()
    await visit(page, `/formulas/${formulaId}`)
    await page.goBack()
    await expect(page).toHaveURL(/\/library/)
    await expect(page.getByText('R16已修订公式', { exact: true })).toBeVisible()
    await visit(page, '/r16-nonexistent-page')
    await expect(page.getByRole('heading', { name: '这一页暂时不在这里' })).toBeVisible()
    await noOverflow(page)
    await page.getByRole('button', { name: '返回首页', exact: true }).click()
    await expect(page).toHaveURL(/\/$/)
  })
