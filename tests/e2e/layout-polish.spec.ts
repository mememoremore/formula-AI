import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { visit, captureFailure } from './browser'
import type { SavedFormula } from '../../shared/types/workspace'

test.afterEach(async ({ page }, info) => captureFailure(page, info))
test('逐页排版：320、390、430、1440px 与缺关联状态', async ({ page }) => {
  test.setTimeout(240000)
  const headers = { origin: testEnvironment.apiUrl }
  const email = 'layout-' + randomUUID() + '@formula.test'
  const password = 'Layout-' + randomUUID()
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers,
        data: { name: '排版验收', email, password },
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
  const formulas: SavedFormula[] = []
  for (let i = 0; i < 8; i++) {
    const response = await page.request.post('/api/account/formulas', {
      headers,
      data: {
        requestKey: randomUUID(),
        title: '布局公式' + i,
        latex: i === 1 ? '\\int_{-\\infty}^{+\\infty} e^{-x^2}dx=\\sqrt{\\pi}' : 'x^2-5x+6=0',
      },
    })
    expect(response.status()).toBe(201)
    formulas.push(await response.json())
  }
  async function noOverflow() {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
      true,
    )
  }
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    await visit(page, '/formulas/' + formulas[0]!.id)
    const ai = page.getByRole('button', { name: '一键解释', exact: true })
    await expect(ai).toBeEnabled()
    expect((await ai.boundingBox())!.y + (await ai.boundingBox())!.height).toBeLessThan(800)
    await expect(page.getByRole('button', { name: '删除公式', exact: true })).not.toBeVisible()
    await page.getByText('更多操作', { exact: true }).click()
    await expect(page.getByRole('button', { name: '删除公式', exact: true })).toBeVisible()
    await page.getByText('更多操作', { exact: true }).click()
    await noOverflow()
    await page.screenshot({ path: test.info().outputPath('detail-' + width + '.png') })
    await visit(page, '/formulas/' + formulas[0]!.id + '#explanation-history')
    await expect(page.locator('.explanation-records')).toHaveAttribute('open', '')
    await visit(page, '/library')
    const card = page.locator('.formula-list-card').first()
    expect((await card.boundingBox())!.height).toBeLessThan(200)
    await noOverflow()
    await visit(page, '/upload')
    expect((await page.locator('.upload-zone').boundingBox())!.height).toBeLessThan(200)
    const album = await page
      .getByRole('button', { name: '从相册或文件选择', exact: true })
      .boundingBox()
    const camera = await page.getByRole('button', { name: '拍照', exact: true }).boundingBox()
    expect(Math.abs(album!.width - camera!.width)).toBeLessThan(1)
    await expect(
      page.locator('.upload-settings').getByRole('radio', { name: '手写公式', exact: true }),
    ).toBeChecked()
    await expect(page.getByText('查看今日额度', { exact: true })).toBeVisible()
    await noOverflow()
    await page.screenshot({ path: test.info().outputPath('upload-' + width + '.png') })
    await visit(page, '/formulas/new')
    const source = page.getByLabel('LaTeX', { exact: true })
    await expect(source).toBeEnabled()
    await source.fill(('x+'.repeat(30) + 'x\n').repeat(14))
    await expect.poll(async () => (await source.boundingBox())!.height).toBeGreaterThanOrEqual(260)
    await source.fill('')
    await noOverflow()
    await visit(page, '/ai/new')
    await expect(page.getByRole('button', { name: '理解一个概念', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '解释符号含义', exact: true })).toHaveCount(0)
    await page.getByRole('button', { name: '选择库中公式', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '选择对话中的公式' })
    const search = dialog.getByRole('searchbox', { name: '搜索库中公式' })
    await expect(search).toBeVisible()
    const top = (await search.boundingBox())!.y
    await dialog.locator('.picker-results').evaluate((e) => (e.scrollTop = e.scrollHeight))
    expect((await search.boundingBox())!.y).toBe(top)
    await dialog.getByRole('button', { name: '布局公式0', exact: true }).click()
    await expect(page).toHaveURL(new RegExp('formulaId=' + formulas[0]!.id))
    await expect(page.getByRole('button', { name: '解释符号含义', exact: true })).toBeVisible()
    await noOverflow()
    await visit(page, '/settings')
    await expect(page.getByText('账号与偏好', { exact: true })).toHaveCount(0)
    await page.getByText('账号使用额度', { exact: true }).click()
    await expect(page.getByRole('heading', { name: '今日可用次数', exact: true })).toBeVisible()
    await noOverflow()
    await visit(page, '/help')
    await page.getByText('没有图片，也能创建公式吗？', { exact: true }).click()
    await expect(page.locator('.help-item[open]')).toHaveCount(1)
    await noOverflow()
    await visit(page, '/feedback')
    await expect(page.getByRole('link', { name: '打开 GitHub 反馈页' })).toHaveAttribute(
      'href',
      'https://github.com/mememoremore/formula-AI/issues/new',
    )
    await noOverflow()
    await visit(page, '/profile')
    await expect(page.locator('.shortcut').first()).toContainText('8 条')
    await noOverflow()
  }
  const sharp = (await import('sharp')).default
  const image = await sharp({
    create: { width: 160, height: 80, channels: 3, background: '#ffffff' },
  })
    .png()
    .toBuffer()
  const uploaded = await page.request.post('/api/account/files', {
    headers: {
      ...headers,
      'content-type': 'image/png',
      'x-file-name': encodeURIComponent('布局验收.png'),
      'x-upload-key': randomUUID(),
    },
    data: image,
  })
  expect(uploaded.status()).toBe(200)
  const file = (await uploaded.json()).image
  const submitted = await page.request.post('/api/account/recognitions', {
    headers,
    data: { fileId: file.id, mode: 'handwritten', requestKey: randomUUID() },
  })
  expect(submitted.status()).toBe(202)
  const taskId = (await submitted.json()).id
  let resultId = ''
  await expect
    .poll(async () => {
      const task = await (await page.request.get('/api/account/tasks/' + taskId)).json()
      resultId = task.formulaId ?? ''
      return task.status
    })
    .toBe('COMPLETED')
  expect(resultId).toBeTruthy()
  expect(
    (await page.request.delete('/api/account/formulas/' + resultId, { headers })).status(),
  ).toBe(204)
  await visit(page, '/recognitions/' + taskId)
  await expect(page.getByRole('heading', { name: '公式已删除', exact: true })).toBeVisible()
  await expect(page.getByText('结果已保存在你的账号。', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('link', { name: '重新选择图片识别', exact: true })).toBeVisible()
})
