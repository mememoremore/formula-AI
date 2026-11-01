import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { visit, captureFailure } from './browser'
import type { SavedFormula } from '../../shared/types/workspace'

test.afterEach(async ({ page }, info) => captureFailure(page, info))
test('解释提问在回答前、追问在回答后，历史不暴露模型标识', async ({ page }) => {
  const headers = { origin: testEnvironment.apiUrl }
  const email = 'explanation-ui-' + randomUUID() + '@formula.test'
  const password = 'Explanation-' + randomUUID()
  expect(
    (
      await page.request.post('/api/auth/sign-up/email', {
        headers,
        data: { name: '解释验收', email, password },
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
  const created = await page.request.post('/api/account/formulas', {
    headers,
    data: { title: '解释排序验收', latex: 'x^2-5x+6=0', requestKey: randomUUID() },
  })
  expect(created.status()).toBe(201)
  const formula = (await created.json()) as SavedFormula
  const submitted = await page.request.post(
    '/api/account/formulas/' + formula.id + '/explanations',
    { headers, data: { versionId: formula.versions.at(-1)!.id, requestKey: randomUUID() } },
  )
  expect(submitted.status()).toBe(202)
  const conversationId = (await submitted.json()).conversationId
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/account/conversations/' + conversationId)).json())
          .baseExplanation?.messageId,
    )
    .toBeTruthy()
  expect(
    (
      await page.request.post('/api/account/conversations/' + conversationId + '/messages', {
        headers,
        data: { question: '这个公式有什么用？', requestKey: randomUUID() },
      })
    ).status(),
  ).toBe(202)
  await expect
    .poll(
      async () =>
        (await (await page.request.get('/api/account/conversations/' + conversationId)).json())
          .currentTurn?.status,
    )
    .toBe('COMPLETED')
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 })
    await visit(page, '/ai/' + conversationId)
    await expect(page.getByTestId('structured-explanation')).toBeVisible()
    await expect(page.locator('.explanation-question')).toHaveText('请解释这个公式。')
    const order = await page.evaluate(() => {
      const question = document.querySelector('.explanation-question')!
      const answer = document.querySelector('.explanation-base')!
      const follow = Array.from(document.querySelectorAll('.chat-messages .user')).find(
        (e) => e.textContent?.trim() === '这个公式有什么用？',
      )!
      return {
        before: !!(question.compareDocumentPosition(answer) & Node.DOCUMENT_POSITION_FOLLOWING),
        after: !!(answer.compareDocumentPosition(follow) & Node.DOCUMENT_POSITION_FOLLOWING),
        overflow: document.documentElement.scrollWidth > innerWidth + 1,
      }
    })
    expect(order).toEqual({ before: true, after: true, overflow: false })
    await expect(page.getByText('请结构化解释这个固定版本公式。', { exact: true })).toHaveCount(0)
    await expect(page.getByText(/DeepSeek|deepseek-flash/)).toHaveCount(0)
    await expect(page.getByText('模拟解释', { exact: true })).toBeVisible()
    await visit(page, '/formulas/' + formula.id + '#explanation-history')
    const history = await (
      await page.request.get('/api/account/formulas/' + formula.id + '/explanations')
    ).json()
    const link = page.locator('.explanation-history a').first()
    await expect(link).toContainText('解释完成')
    if (history.items[0].modelVersion)
      expect(await link.innerText()).not.toContain(history.items[0].modelVersion)
  }
})
