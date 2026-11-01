import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { visit, captureFailure } from './browser'
import type { SavedFormula } from '../../shared/types/workspace'

test.afterEach(async ({ page }, info) => captureFailure(page, info))
test('当前公式编辑、提问与导出无需版本选择 / 390px', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const headers = { origin: testEnvironment.apiUrl }
  const email = 'current-' + randomUUID() + '@formula.test'
  const password = 'Current-' + randomUUID()
  const signup = await page.request.post('/api/auth/sign-up/email', {
    headers,
    data: { name: '当前公式测试', email, password },
  })
  expect(signup.status()).toBe(200)
  const verified = await page.request.post('/api/auth/email-otp/verify-email', {
    headers,
    data: { email, otp: readTestOtp(email) },
  })
  expect(verified.status()).toBe(200)
  const login = await page.request.post('/api/auth/sign-in/email', {
    headers,
    data: { email, password },
  })
  expect(login.status()).toBe(200)
  const created = await page.request.post('/api/account/formulas', {
    headers,
    data: { title: '当前公式测试', latex: 'x^2-5x+6=0', requestKey: randomUUID() },
  })
  expect(created.status()).toBe(201)
  const formula = (await created.json()) as SavedFormula
  await visit(page, '/formulas/' + formula.id)
  await expect(page.getByRole('button', { name: /版本记录/ })).toHaveCount(0)
  await expect(page.getByLabel('解释公式版本')).toHaveCount(0)
  await expect(page.getByRole('checkbox', { name: '全部版本' })).toHaveCount(0)
  await page.getByRole('button', { name: /^编辑公式/ }).click()
  await page.getByLabel('LaTeX', { exact: true }).fill('x^2-7x+12=0')
  await page.getByRole('button', { name: '确认并保存', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('link', { name: '继续提问', exact: true })).toHaveAttribute(
    'href',
    '/ai/new?formulaId=' + formula.id,
  )
  await page.getByRole('link', { name: '继续提问', exact: true }).click()
  await expect(page.locator('.draft-context')).toContainText('12')
  await page.getByRole('textbox', { name: '输入提问，Shift 加回车换行' }).fill('解释这个公式')
  await page.getByRole('button', { name: '发送提问', exact: true }).click()
  await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
  const conversationId = page.url().split('/').at(-1)!
  const conversation = await (
    await page.request.get('/api/account/conversations/' + conversationId)
  ).json()
  expect(conversation.context.latex).toBe('x^2-7x+12=0')
  expect(conversation.title).not.toMatch(/ · v[0-9]+/)
  await visit(page, '/formulas/' + formula.id)
  await page.getByRole('button', { name: '导出 Word', exact: true }).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('combobox')).toHaveCount(0)
  await expect(dialog.getByText('当前公式', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: '生成 Word 文档', exact: true }).click()
  await expect(page).toHaveURL(/\/exports\/[0-9a-f-]+$/)
  const download = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Word', exact: true }).click()
  const file = await download
  expect(file.suggestedFilename()).not.toMatch(/-v[0-9]+\.docx$/)
  const xml = strFromU8(unzipSync(readFileSync((await file.path())!))['word/document.xml']!)
  expect(xml).toContain('x^2-7x+12=0')
  expect(xml).not.toMatch(/公式版本 v[0-9]+/)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
})
