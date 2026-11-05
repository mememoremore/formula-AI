import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import sharp from 'sharp'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { visit, captureFailure } from './browser'

test.afterEach(async ({ page }, info) => captureFailure(page, info))

test('资料schema保留头像省略/null与未确认写入草稿，多屏宽显示正常', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const headers = { origin: testEnvironment.apiUrl }
  const email = 'profile-schema-' + randomUUID() + '@formula.test'
  const password = 'Profile-' + randomUUID()
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers,
        data: { email, password, name: '资料验收' },
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
  const png = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#7766cc' } })
    .png()
    .toBuffer()
  expect(
    (
      await page.request.patch('/api/account/profile', {
        headers,
        data: { name: '资料验收', avatar: 'data:image/png;base64,' + png.toString('base64') },
      })
    ).status(),
  ).toBe(200)
  await visit(page, '/profile/edit')
  const name = page.getByRole('textbox', { name: '昵称', exact: true })
  const save = page.getByRole('button', { name: '保存资料', exact: true })
  await expect(name).toHaveValue('资料验收')
  await expect(save).toBeDisabled()
  let committed = 0
  let body: Record<string, unknown> | undefined
  await page.route('**/api/account/profile', async (route) => {
    if (route.request().method() !== 'PATCH') return route.continue()
    body = route.request().postDataJSON()
    committed = (await route.fetch()).status()
    await route.abort('failed')
  })
  await name.fill('  原样草稿  ')
  await save.click()
  await expect(page.getByRole('alert').filter({ hasText: '保存结果暂时未能确认' })).toBeVisible()
  expect(committed).toBe(200)
  expect(body).toEqual({ name: '原样草稿' })
  await expect(name).toHaveValue('  原样草稿  ')
  const session = await (await page.request.get('/api/account/session')).json()
  expect(session.user.name).toBe('原样草稿')
  expect(session.user.image).toBeTruthy()
  await page.unroute('**/api/account/profile')
  const saved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/account/profile' &&
      response.request().method() === 'PATCH',
  )
  await save.click()
  expect((await saved).status()).toBe(200)
  await expect(name).toHaveValue('原样草稿')
  await expect(save).toBeDisabled()
  await page.getByRole('button', { name: '更换头像', exact: true }).click()
  await page.getByRole('button', { name: '恢复默认头像', exact: true }).click()
  const reset = page.waitForRequest(
    (request) =>
      new URL(request.url()).pathname === '/api/account/profile' && request.method() === 'PATCH',
  )
  const resetSaved = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/account/profile' &&
      response.request().method() === 'PATCH',
  )
  await save.click()
  expect((await reset).postDataJSON()).toEqual({ name: '原样草稿', avatar: null })
  expect((await resetSaved).status()).toBe(200)
  await expect(save).toBeDisabled()
  expect((await (await page.request.get('/api/account/session')).json()).user.image).toBeNull()
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await expect(name).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
    await page.screenshot({
      path: test.info().outputPath('profile-' + width + '.png'),
      fullPage: true,
    })
  }
})
