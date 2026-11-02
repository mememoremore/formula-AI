import { createDatabaseClient } from '../../server/database/client'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseTraceparent } from '../../shared/trace-context'
import { test, expect } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { visit, captureFailure } from './browser'
import type { SavedFormula } from '../../shared/types/workspace'

test.afterEach(async ({ page }, info) => captureFailure(page, info))
test('浏览器请求、HTTP、队列与Worker贯通，错误可复制诊断', async ({ page }) => {
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
  const exported: number[] = []
  page.on('response', (r) => {
    if (r.url().endsWith('/api/account/telemetry/traces')) exported.push(r.status())
  })
  await page.setViewportSize({ width: 390, height: 844 })
  await visit(page, '/formulas/' + formula.id)
  const submitted = page.waitForResponse(
    (r) => r.url().endsWith('/explanations') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '一键解释', exact: true }).click()
  const response = await submitted
  expect(response.status()).toBe(202)
  const parent = parseTraceparent(response.request().headers()['traceparent'])!
  expect(parent).toBeTruthy()
  expect(response.headers()['x-trace-id']).toBe(parent.traceId)
  expect(response.headers()['x-request-id']).toMatch(/^[a-f0-9-]{36}$/)
  const { task } = await response.json()
  const db = createDatabaseClient(testEnvironment.databaseUrl)
  try {
    const turn = await db.chatTurn.findUniqueOrThrow({ where: { id: task.id } })
    const rows = await db.$queryRaw<
      { data: { traceparent?: string } }[]
    >`SELECT data FROM pgboss.job WHERE id=${turn.queueJobId}::uuid`
    expect(parseTraceparent(rows[0]!.data.traceparent)?.traceId).toBe(parent.traceId)
    await expect(page.getByTestId('structured-explanation')).toBeVisible()
    await expect
      .poll(() => {
        const lines = readFileSync(
          resolve('tmp/r1-test', testEnvironment.runId, 'worker.log'),
          'utf8',
        ).split('\n')
        return lines.some((line) => {
          try {
            const row = JSON.parse(line)
            return (
              row.event === 'worker.attempt' &&
              row.taskId === task.id &&
              row.traceId === parent.traceId &&
              row.service === 'formula-worker'
            )
          } catch {
            return false
          }
        })
      })
      .toBe(true)
    await expect.poll(() => exported.includes(204)).toBe(true)
    await visit(page, '/formulas/' + formula.id)
    await page.route('**/api/account/formulas/*/explanations', async (route) => {
      if (route.request().method() === 'POST')
        await route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: '{"message":"controlled failure"}',
        })
      else await route.continue()
    })
    await page.getByRole('button', { name: '一键解释', exact: true }).click()
    await expect(page.getByRole('button', { name: '复制诊断信息', exact: true })).toBeVisible()
    const state = await page.evaluate(() => {
      const root = document.querySelector('#__nuxt') as Element & {
        __vue_app__?: {
          config: { globalProperties: { $nuxt: { payload: { state: Record<string, unknown> } } } }
        }
      }
      return root.__vue_app__!.config.globalProperties.$nuxt.payload.state['$slast-diagnostic']
    })
    expect(state).toMatchObject({ status: 503 })
    expect(JSON.stringify(state)).not.toContain(email)
    const reports: { events: Record<string, unknown>[] }[] = []
    page.on('request', (r) => {
      if (r.url().endsWith('/api/account/telemetry/errors'))
        reports.push(r.postDataJSON() as { events: Record<string, unknown>[] })
    })
    const accepted = page.waitForResponse((r) => r.url().endsWith('/api/account/telemetry/errors'))
    await page.evaluate(async () => {
      const root = document.querySelector('#__nuxt') as Element & {
        __vue_app__: {
          config: {
            globalProperties: {
              $nuxt: { callHook: (name: string, ...args: unknown[]) => Promise<void> }
            }
          }
        }
      }
      await root.__vue_app__.config.globalProperties.$nuxt.callHook(
        'vue:error',
        new Error('private-vue-message'),
        null,
        'controlled test',
      )
      setTimeout(() => {
        throw new TypeError('private-window-message')
      }, 0)
      setTimeout(() => {
        void Promise.reject(new Error('private-promise-message'))
      }, 0)
    })
    expect((await accepted).status()).toBe(204)
    await expect.poll(() => reports.flatMap((r) => r.events).length).toBe(3)
    expect(
      reports
        .flatMap((r) => r.events)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['promise', 'vue', 'window'])
    expect(JSON.stringify(reports)).not.toMatch(
      /private-vue-message|private-window-message|private-promise-message/,
    )
    await expect
      .poll(() => {
        const log = readFileSync(resolve('tmp/r1-test', testEnvironment.runId, 'api.log'), 'utf8')
        return log.split('\n').filter((line) => line.includes('"event":"browser.error"')).length
      })
      .toBe(3)
  } finally {
    await db.$disconnect()
  }
})
