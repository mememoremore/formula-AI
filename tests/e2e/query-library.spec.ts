import { test, expect, type APIRequestContext } from '@playwright/test'
import { randomUUID } from 'node:crypto'
import { testEnvironment } from '../support/integration'
import { readTestOtp } from '../support/registration-mail'
import { createDatabaseClient } from '../../server/database/client'
import { createFormula } from '../../server/database/formulas'
import { visit, captureFailure } from './browser'

const db = createDatabaseClient(testEnvironment.databaseUrl)
test.afterAll(async () => {
  await db.$disconnect()
})
test.afterEach(async ({ page }, info) => captureFailure(page, info))
const headers = { origin: testEnvironment.apiUrl }
async function register(request: APIRequestContext) {
  const email = `query-${randomUUID()}@formula.test`,
    password = 'Query-' + randomUUID()
  const response = await request.post('/api/auth/sign-up/email', {
    headers,
    data: { name: 'Query验收', email, password },
  })
  expect(response.status()).toBe(200)
  const { user } = (await response.json()) as { user: { id: string } }
  expect(
    (
      await request.post('/api/auth/email-otp/verify-email', {
        headers,
        data: { email, otp: readTestOtp(email) },
      })
    ).status(),
  ).toBe(200)
  expect(
    (
      await request.post('/api/auth/sign-in/email', { headers, data: { email, password } })
    ).status(),
  ).toBe(200)
  return { id: user.id, email, password }
}

for (const width of [320, 390, 430, 1440])
  test(`@queries 公式库SSR水合、缓存复用、分页、写入恢复与换号隔离 / ${width}px`, async ({
    page,
    browser,
    context,
  }) => {
    await page.setViewportSize({ width, height: 844 })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === testEnvironment.apiUrl)
        await route.continue()
      else await route.abort('blockedbyclient')
    })
    const a = await register(page.request)
    const categories = await Promise.all(
      ['集合一', '集合二'].map((name) => db.category.create({ data: { ownerId: a.id, name } })),
    )
    for (let i = 0; i < 22; i++)
      await createFormula(db, {
        ownerId: a.id,
        title: 'Query公式' + String(i).padStart(2, '0'),
        latex: `x+${i}`,
        origin: 'MANUAL',
        categoryId: categories[i % 2]!.id,
      })
    const otherContext = await browser.newContext({ baseURL: testEnvironment.apiUrl })
    try {
      const b = await register(otherContext.request)
      await createFormula(db, {
        ownerId: b.id,
        title: '仅账号B的公式',
        latex: 'b=2',
        origin: 'MANUAL',
      })
      for (const path of ['/api/account/library', '/api/account/categories'])
        expect((await page.request.get(path, { headers: { 'x-account-id': b.id } })).status()).toBe(
          403,
        )
      expect(
        (
          await page.request.post('/api/account/categories', {
            headers: { ...headers, 'x-account-id': b.id },
            data: { name: '不应创建' },
          })
        ).status(),
      ).toBe(403)
      const [htmlA, htmlB] = await Promise.all([
        (await page.request.get('/library')).text(),
        (await otherContext.request.get('/library')).text(),
      ])
      expect(htmlA).toContain('Query公式21')
      expect(htmlA).not.toContain('仅账号B的公式')
      expect(htmlB).toContain('仅账号B的公式')
      expect(htmlB).not.toContain('Query公式21')
      let listReads = 0,
        categoryReads = 0
      page.on('request', (request) => {
        const path = new URL(request.url()).pathname
        if (request.method() === 'GET' && path === '/api/account/library') listReads++
        if (request.method() === 'GET' && path === '/api/account/categories') categoryReads++
      })
      await visit(page, '/library')
      await expect(page.locator('.formula-list-card')).toHaveCount(20)
      expect(listReads).toBe(0)
      expect(categoryReads).toBe(0)
      await page.screenshot({ path: test.info().outputPath('query-library-' + width + '.png') })
      const search = page.getByRole('searchbox', { name: '搜索公式名称或内容' })
      await search.fill('21')
      await page.getByRole('button', { name: '搜索公式', exact: true }).click()
      await expect(page.locator('.formula-list-card')).toHaveCount(1)
      expect(listReads).toBe(1)
      await search.fill('')
      await expect(page.locator('.formula-list-card')).toHaveCount(20)
      expect(listReads).toBe(1)
      await page
        .locator('.category-filters')
        .getByRole('button', { name: /集合一/ })
        .click()
      await expect(page.locator('.formula-list-card')).toHaveCount(11)
      expect(listReads).toBe(2)
      await page.locator('.category-filters').getByRole('button', { name: /全部/ }).click()
      await expect(page.locator('.formula-list-card')).toHaveCount(20)
      expect(listReads).toBe(2)
      await page.getByRole('button', { name: '加载更多', exact: true }).click()
      await expect(page.locator('.formula-list-card')).toHaveCount(22)
      await page.getByRole('button', { name: '收藏Query公式21', exact: true }).click()
      await expect(
        page.getByRole('button', { name: '取消收藏Query公式21', exact: true }),
      ).toBeVisible()
      await page.getByRole('link', { name: '收藏', exact: true }).click()
      await expect(page.locator('.formula-list-card')).toHaveCount(1)
      await page.getByRole('button', { name: '取消收藏Query公式21', exact: true }).click()
      await expect(page.locator('.formula-list-card')).toHaveCount(0)
      await page.getByRole('link', { name: '全部', exact: true }).click()
      await expect(page.getByRole('link', { name: '查看Query公式21', exact: true })).toBeVisible()
      await page.getByRole('link', { name: '查看Query公式21', exact: true }).click()
      await page.getByRole('button', { name: /^编辑公式/ }).click()
      await page.getByLabel('公式名称', { exact: true }).fill('Query新名称')
      await page.getByRole('button', { name: '确认并保存', exact: true }).click()
      await expect(page.getByRole('dialog')).toHaveCount(0)
      await page.goBack()
      await expect(page.getByRole('link', { name: '查看Query新名称', exact: true })).toBeVisible()
      const beforePicker = categoryReads
      await page.getByRole('button', { name: '修改Query新名称的分类', exact: true }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog.getByText('集合二', { exact: true })).toBeVisible()
      expect(categoryReads).toBe(beforePicker)
      await dialog.getByText('集合一', { exact: true }).click()
      await expect(dialog.getByLabel('集合一', { exact: true })).toBeChecked()
      await dialog.getByRole('button', { name: '保存分类', exact: true }).click()
      await expect(dialog).toHaveCount(0)
      await expect(
        page.locator('.formula-list-card').filter({ hasText: 'Query新名称' }),
      ).toContainText('集合一')
      await page.getByRole('button', { name: '管理分类', exact: true }).click()
      const manager = page.getByRole('dialog', { name: '管理分类', exact: true })
      await manager.getByLabel('新建分类', { exact: true }).fill('Query临时分类')
      let categoryWrites = 0
      const categoryFailure = async (route: import('@playwright/test').Route) => {
        if (route.request().method() !== 'POST') return route.continue()
        categoryWrites++
        if (categoryWrites === 1)
          return route.fulfill({
            status: 500,
            contentType: 'application/json',
            body: JSON.stringify({ message: 'fixture failure' }),
          })
        await route.continue()
      }
      await page.route('**/api/account/categories', categoryFailure)
      await manager.getByRole('button', { name: '创建分类', exact: true }).click()
      await expect(manager.getByRole('alert')).toBeVisible()
      expect(categoryWrites).toBe(1)
      await expect(manager.getByLabel('新建分类', { exact: true })).toHaveValue('Query临时分类')
      await manager.getByRole('button', { name: '创建分类', exact: true }).click()
      await expect(
        manager.getByRole('button', { name: '重命名Query临时分类', exact: true }),
      ).toBeVisible()
      expect(categoryWrites).toBe(2)
      await page.unroute('**/api/account/categories', categoryFailure)
      await manager.getByRole('button', { name: '重命名Query临时分类', exact: true }).click()
      await manager.getByLabel('修改分类名称', { exact: true }).fill('Query分类改名')
      await manager.getByRole('button', { name: '保存名称', exact: true }).click()
      await expect(
        manager.getByRole('button', { name: '删除Query分类改名', exact: true }),
      ).toBeVisible()
      await manager.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await page
        .locator('.category-filters')
        .getByRole('button', { name: /Query分类改名/ })
        .click()
      await expect(page).toHaveURL(/category=/)
      await expect(page.locator('.formula-list-card')).toHaveCount(0)
      await page.getByRole('button', { name: '管理分类', exact: true }).click()
      await manager.getByRole('button', { name: '删除Query分类改名', exact: true }).click()
      await manager.getByRole('button', { name: '确认删除分类', exact: true }).click()
      await expect(
        manager.getByRole('button', { name: '删除Query分类改名', exact: true }),
      ).toHaveCount(0)
      await expect(page).not.toHaveURL(/category=/)
      await manager.getByRole('button', { name: '关闭弹窗', exact: true }).click()
      await expect(page.locator('#main-content .diagnostic-copy')).toBeVisible()
      // Lose the first successful create response; replay its persisted key/body instead of creating again.
      await page.getByRole('link', { name: '创建公式', exact: true }).click()
      await expect(page.locator('.diagnostic-copy')).toHaveCount(0)
      await page.getByLabel('公式名称', { exact: true }).fill('Query回执新公式')
      await page.getByLabel('LaTeX', { exact: true }).fill('x+123')
      const createBodies: unknown[] = []
      const lostCreate = async (route: import('@playwright/test').Route) => {
        if (route.request().method() !== 'POST') return route.continue()
        createBodies.push(route.request().postDataJSON())
        if (createBodies.length === 1) {
          await route.fetch()
          await route.abort('failed')
        } else await route.continue()
      }
      await page.route('**/api/account/formulas', lostCreate)
      await page.getByRole('button', { name: '保存到账号公式库', exact: true }).click()
      await expect(page.getByRole('button', { name: '确认上次保存', exact: true })).toBeVisible()
      expect(createBodies).toHaveLength(1)
      const diagnostic = page.locator('#main-content .diagnostic-copy')
      await expect(diagnostic).toBeVisible()
      expect(await diagnostic.evaluate((el) => getComputedStyle(el).position)).toBe('static')
      await page.screenshot({
        path: test.info().outputPath('query-recovery-' + width + '.png'),
        mask: [page.locator('input,textarea')],
      })
      await page.getByRole('button', { name: '确认上次保存', exact: true }).click()
      await expect(page).toHaveURL(/\/formulas\/[a-f0-9-]+$/)
      expect(createBodies).toHaveLength(2)
      expect(createBodies[0]).toEqual(createBodies[1])
      expect(await db.formula.count({ where: { ownerId: a.id, title: 'Query回执新公式' } })).toBe(1)
      await page.unroute('**/api/account/formulas', lostCreate)
      await page.getByText('更多操作', { exact: true }).click()
      await page.getByRole('button', { name: '删除公式', exact: true }).click()
      await page
        .getByRole('dialog', { name: '删除公式', exact: true })
        .getByRole('button', { name: '确认删除', exact: true })
        .click()
      await expect(page).toHaveURL(/\/library/)
      await expect(
        page.getByRole('link', { name: '查看Query回执新公式', exact: true }),
      ).toHaveCount(0)
      // Real application logout calls the central cache boundary; login B in the same browser app.
      await page.getByRole('link', { name: '我的', exact: true }).click()
      await page.getByRole('link', { name: /设置/ }).click()
      await page.getByRole('button', { name: '退出登录', exact: true }).click()
      await expect(page).toHaveURL(/\/login/)
      await page.getByPlaceholder('请输入邮箱').fill(b.email)
      await page.getByPlaceholder('请输入密码').fill(b.password)
      await page.getByRole('button', { name: '登录', exact: true }).click()
      await expect(page).not.toHaveURL(/\/login/)
      await page.getByRole('link', { name: '公式库', exact: true }).click()
      await expect(page.getByRole('link', { name: '查看仅账号B的公式', exact: true })).toBeVisible()
      await expect(page.getByRole('link', { name: /查看Query/ })).toHaveCount(0)
      expect(
        await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      ).toBe(true)
    } finally {
      await otherContext.close()
    }
  })
