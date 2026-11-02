import { createDatabaseClient } from '../../server/database/client'
import { explanationFixture } from '../fixtures/explanation'
import {
  explanationText,
  EXPLANATION_PROMPT_VERSION,
  EXPLANATION_QUESTION,
} from '../../shared/explanation'
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { visit, captureFailure } from './browser'
import type { SavedFormula } from '../../shared/types/workspace'

test.afterEach(async ({ page }, info) => captureFailure(page, info))
test('旧解释的裸公式在手机端渲染且不改历史原文', async ({ page }) => {
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
  const legacy = {
    ...explanationFixture,
    symbols: [],
    conditions: [],
    steps: [],
    warnings: [],
    examples: [
      String.raw`取 x=0：f(0)=\sin^{2}0+\cos^{2}0=0+1=1`,
      String.raw`取 x=\frac{\pi}{4}：f\left(\frac{\pi}{4}\right)=\left(\frac{\sqrt{2}}{2}\right)^2+\left(\frac{\sqrt{2}}{2}\right)^2=1`,
    ],
  }
  const db = createDatabaseClient(testEnvironment.databaseUrl)
  try {
    const user = await db.user.findUniqueOrThrow({ where: { email } })
    const ownerId = user.id
    const conversation = await db.conversation.create({
      data: {
        ownerId,
        formulaVersionId: formula.versions.at(-1)!.id,
        purpose: 'EXPLANATION',
        title: '历史公式渲染验收',
      },
    })
    const turn = await db.chatTurn.create({
      data: {
        ownerId,
        conversationId: conversation.id,
        requestKey: randomUUID(),
        question: EXPLANATION_QUESTION,
        responseKind: 'FORMULA_EXPLANATION',
        promptVersion: EXPLANATION_PROMPT_VERSION,
        requestHash: 'a'.repeat(64),
        status: 'COMPLETED',
        finishedAt: new Date(),
      },
    })
    await db.chatMessage.createMany({
      data: [
        {
          ownerId,
          conversationId: conversation.id,
          turnId: turn.id,
          position: 1,
          role: 'USER',
          content: EXPLANATION_QUESTION,
        },
        {
          ownerId,
          conversationId: conversation.id,
          turnId: turn.id,
          position: 2,
          role: 'ASSISTANT',
          content: explanationText(legacy),
          structuredContent: legacy,
        },
      ],
    })
    for (const width of [320, 390, 430]) {
      await page.setViewportSize({ width, height: 844 })
      await visit(page, '/ai/' + conversation.id)
      const examples = page
        .getByTestId('structured-explanation')
        .locator('section')
        .filter({
          has: page.getByRole('heading', { name: '应用例子', exact: true }),
        })
      await expect(examples.locator('.math-formula')).toHaveCount(3)
      await expect(examples.locator('.katex')).toHaveCount(3)
      await expect(examples.locator('.error-text')).toHaveCount(0)
      await expect(examples.locator('.katex-display')).toHaveCount(1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)).toBe(
        false,
      )
      const longFormula = examples.locator('.math-formula').last()
      await expect(longFormula).toHaveCSS('overflow-x', 'auto')
      if (width === 320)
        expect(await longFormula.evaluate((e) => e.scrollWidth > e.clientWidth)).toBe(true)
      await examples.scrollIntoViewIfNeeded()
    }
    const stored = await db.chatMessage.findFirstOrThrow({
      where: { turnId: turn.id, role: 'ASSISTANT' },
    })
    expect(stored.structuredContent).toEqual(legacy)
    expect(stored.content).toBe(explanationText(legacy))
  } finally {
    await db.$disconnect()
  }
})
