import { test, expect, type Page } from '@playwright/test'
import { randomUUID, randomBytes } from 'node:crypto'
import { mkdirSync, readFileSync } from 'node:fs'
import { unzipSync, strFromU8 } from 'fflate'
import { visit, captureFailure } from './browser'
import { testEnvironment } from '../support/integration.ts'
import { createDatabaseClient } from '../../server/database/client'
import type { SavedFormula } from '../../shared/types/workspace'
const db = createDatabaseClient(testEnvironment.databaseUrl)
test.afterAll(() => db.$disconnect())
test.afterEach(async ({ page }, info) => {
  await captureFailure(page, info)
})
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true,
  )
}
for (const width of [320, 390, 430, 1440])
  test(`R18 自由裁剪与手动公式真实链路 / ${width}px`, async ({ page, context }) => {
    await page.setViewportSize({ width, height: 900 })
    await context.route('**/*', async (route) => {
      const url = new URL(route.request().url())
      if (!['http:', 'https:'].includes(url.protocol) || url.origin === testEnvironment.apiUrl)
        await route.continue()
      else await route.abort('blockedbyclient')
    })
    const email = `r18-e2e-${randomUUID()}@formula.test`,
      password = `R18-${randomBytes(18).toString('base64url')}`
    await visit(page, '/login?redirect=/upload')
    await page.getByRole('button', { name: '还没有账号？创建一个' }).click()
    await page.getByPlaceholder('希望我们如何称呼你').fill('R18测试')
    await page.getByPlaceholder('请输入邮箱').fill(email)
    await page.locator('input[type="password"]').fill(password)
    await page.getByRole('button', { name: '创建账号', exact: true }).click()
    await expect(page).toHaveURL(/\/upload$/)
    await page.evaluate(() => {
      const tracker = { urls: new Set<string>(), bitmaps: 0, closed: 0 }
      Object.assign(window, { r18Resources: tracker })
      const create = URL.createObjectURL.bind(URL),
        revoke = URL.revokeObjectURL.bind(URL)
      URL.createObjectURL = (blob) => {
        const value = create(blob)
        tracker.urls.add(value)
        return value
      }
      URL.revokeObjectURL = (url) => {
        tracker.urls.delete(url)
        revoke(url)
      }
      const bitmap = window.createImageBitmap.bind(window)
      window.createImageBitmap = (async (...args: Parameters<typeof createImageBitmap>) => {
        const value = await bitmap(...args)
        tracker.bitmaps++
        const close = value.close.bind(value)
        let done = false
        value.close = () => {
          if (!done) {
            tracker.closed++
            done = true
          }
          close()
        }
        return value
      }) as typeof createImageBitmap
    })
    const sharp = (await import('sharp')).default
    const original = await sharp({
      create: { width: 120, height: 240, channels: 3, background: '#d9d0ff' },
    })
      .withMetadata({ orientation: 6 })
      .jpeg()
      .toBuffer()
    await page
      .getByLabel('选择公式图片', { exact: true })
      .setInputFiles({ name: 'R18方向6.jpg', mimeType: 'image/jpeg', buffer: original })
    const dialog = page.getByRole('dialog', { name: '自由裁剪公式图片' })
    await expect(dialog).toBeVisible()
    await expect(dialog.getByRole('button', { name: '确认裁剪', exact: true })).toBeEnabled()
    expect(await page.locator('cropper-selection').count()).toBe(1)
    const handle = page.locator('cropper-handle[action="se-resize"]'),
      rect = await handle.boundingBox()
    expect(rect).toBeTruthy()
    const canvasBounds = await page.locator('cropper-canvas').boundingBox()
    expect(rect!.x + rect!.width / 2).toBeLessThan(canvasBounds!.x + canvasBounds!.width)
    expect(rect!.y + rect!.height / 2).toBeLessThan(canvasBounds!.y + canvasBounds!.height)
    if (width < 500) {
      const cdp = await context.newCDPSession(page)
      await cdp.send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 2 })
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: rect!.x + rect!.width / 2, y: rect!.y + rect!.height / 2 }],
      })
      for (let i = 1; i <= 5; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { x: rect!.x + rect!.width / 2 - i * 7, y: rect!.y + rect!.height / 2 - i * 3 },
          ],
        })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    } else {
      await page.mouse.move(rect!.x + rect!.width / 2, rect!.y + rect!.height / 2)
      await page.mouse.down()
      await page.mouse.move(rect!.x - 35, rect!.y - 15, { steps: 5 })
      await page.mouse.up()
    }
    if (width < 500) {
      const image = await page.locator('cropper-image').boundingBox(),
        cx = image!.x + image!.width / 2,
        cy = image!.y + image!.height / 2
      const cdp = await context.newCDPSession(page)
      const before = await page
        .locator('cropper-image')
        .evaluate(
          (element) => (element as unknown as { $getTransform(): number[] }).$getTransform()[0],
        )
      await cdp.send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [
          { id: 1, x: cx - 25, y: cy },
          { id: 2, x: cx + 25, y: cy },
        ],
      })
      for (let i = 1; i <= 5; i++)
        await cdp.send('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [
            { id: 1, x: cx - 25 - i * 3, y: cy },
            { id: 2, x: cx + 25 + i * 3, y: cy },
          ],
        })
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
      expect(
        await page
          .locator('cropper-image')
          .evaluate(
            (element) => (element as unknown as { $getTransform(): number[] }).$getTransform()[0],
          ),
      ).toBeGreaterThan(before!)
    }
    await dialog.getByRole('button', { name: '放大图片', exact: true }).click()
    mkdirSync('tmp/r18/screenshots', { recursive: true })
    await page.screenshot({ path: `tmp/r18/screenshots/crop-${width}.png` })
    await dialog.getByRole('button', { name: '确认裁剪', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    const preview = page.getByRole('img', { name: '已选择的公式图片预览' })
    await expect(preview).toBeVisible()
    const size = await preview.evaluate((img) => ({
      width: (img as HTMLImageElement).naturalWidth,
      height: (img as HTMLImageElement).naturalHeight,
      src: (img as HTMLImageElement).src,
    }))
    expect(size.width).toBeLessThan(240)
    expect(size.height).toBeLessThan(120)
    expect(size.width).toBeGreaterThan(size.height)
    await page.getByRole('button', { name: '重新裁剪图片', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '确认裁剪', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: '取消裁剪', exact: true }).click()
    expect(await preview.getAttribute('src')).toBe(size.src)
    await page.getByRole('button', { name: '重新裁剪图片', exact: true }).click()
    await expect(dialog.getByRole('button', { name: '确认裁剪', exact: true })).toBeEnabled()
    await dialog.getByRole('button', { name: '重置裁剪', exact: true }).click()
    await dialog.getByRole('button', { name: '确认裁剪', exact: true }).click()
    await expect
      .poll(() => preview.evaluate((img) => (img as HTMLImageElement).naturalWidth))
      .toBe(240)
    expect(await preview.evaluate((img) => (img as HTMLImageElement).naturalHeight)).toBe(120)
    await page.getByRole('button', { name: '删除图片', exact: true }).click()
    await expect(preview).toHaveCount(0)
    expect(
      await page.evaluate(() => {
        const r = (
          window as unknown as {
            r18Resources: { urls: Set<string>; bitmaps: number; closed: number }
          }
        ).r18Resources
        return { urls: r.urls.size, bitmaps: r.bitmaps, closed: r.closed }
      }),
    ).toEqual({ urls: 0, bitmaps: 3, closed: 3 })
    if (width === 390) {
      // Compare every EXIF orientation against server Sharp autoOrient using the same fixture.
      const pattern = Buffer.from(
        '<svg width="120" height="240" xmlns="http://www.w3.org/2000/svg"><path fill="red" d="M0 0h60v120H0z"/><path fill="blue" d="M60 0h60v120H60z"/><path fill="green" d="M0 120h60v120H0z"/><path fill="yellow" d="M60 120h60v120H60z"/></svg>',
      )
      for (let orientation = 1; orientation <= 8; orientation++) {
        const oriented = await sharp(pattern)
          .withMetadata({ orientation })
          .jpeg({ quality: 95 })
          .toBuffer()
        const expected = await sharp(oriented)
          .autoOrient()
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true })
        await page.getByLabel('选择公式图片', { exact: true }).setInputFiles({
          name: 'orientation-' + orientation + '.jpg',
          mimeType: 'image/jpeg',
          buffer: oriented,
        })
        await page.getByRole('button', { name: '确认裁剪', exact: true }).click()
        await expect(preview).toBeVisible()
        const pixels = await preview.evaluate(async (element) => {
          const image = element as HTMLImageElement
          await image.decode()
          const canvas = document.createElement('canvas')
          canvas.width = image.naturalWidth
          canvas.height = image.naturalHeight
          const context = canvas.getContext('2d')!
          context.drawImage(image, 0, 0)
          const corners = [
            [10, 10],
            [canvas.width - 11, 10],
            [10, canvas.height - 11],
            [canvas.width - 11, canvas.height - 11],
          ].map(([x, y]) => Array.from(context.getImageData(x!, y!, 1, 1).data).slice(0, 3))
          const result = { width: canvas.width, height: canvas.height, corners }
          canvas.width = 0
          canvas.height = 0
          return result
        })
        expect(pixels.width).toBe(expected.info.width)
        expect(pixels.height).toBe(expected.info.height)
        for (const [i, [x, y]] of [
          [10, 10],
          [expected.info.width - 11, 10],
          [10, expected.info.height - 11],
          [expected.info.width - 11, expected.info.height - 11],
        ].entries())
          for (let c = 0; c < 3; c++)
            expect(
              Math.abs(
                pixels.corners[i]![c]! - expected.data[(y! * expected.info.width + x!) * 3 + c]!,
              ),
            ).toBeLessThan(20)
        await page.getByRole('button', { name: '删除图片', exact: true }).click()
      }
    }
    await page.getByLabel('选择公式图片', { exact: true }).setInputFiles({
      name: 'invalid.jpg',
      mimeType: 'image/jpeg',
      buffer: Buffer.from('not an image'),
    })
    await expect(page.getByRole('alert').filter({ hasText: /图片无法打开/ })).toBeVisible()
    await page.getByLabel('选择公式图片', { exact: true }).setInputFiles({
      name: 'too-big.png',
      mimeType: 'image/png',
      buffer: Buffer.alloc(10 * 1024 * 1024 + 1),
    })
    await expect(page.getByRole('alert').filter({ hasText: /不能超过 10MB/ })).toBeVisible()
    await noOverflow(page)
    await page.getByRole('link', { name: '直接输入 LaTeX 创建公式' }).click()
    await expect(page).toHaveURL(/\/formulas\/new$/)
    await page.getByLabel('公式名称', { exact: true }).fill('R18手动公式')
    await page.getByLabel('LaTeX', { exact: true }).fill('\\frac{')
    await expect(page.getByRole('button', { name: '保存到账号公式库' })).toBeDisabled()
    await expect(page.getByText(/公式暂时无法预览/)).toHaveCount(1)
    await expect(page.getByText(/公式暂时无法预览/)).toBeVisible()
    await page.screenshot({
      path: 'tmp/r18/screenshots/manual-error-' + width + '.png',
      fullPage: true,
    })
    let dismissed = false
    page.once('dialog', async (event) => {
      dismissed = true
      await event.dismiss()
    })
    await page.getByRole('link', { name: /返回/ }).first().click()
    expect(dismissed).toBe(true)
    await expect(page).toHaveURL(/\/formulas\/new$/)
    await page.getByLabel('LaTeX', { exact: true }).fill('\\frac{1}{2}')
    await expect(page.locator('.manual-preview .katex')).toBeVisible()
    await noOverflow(page)
    await page.screenshot({ path: `tmp/r18/screenshots/manual-${width}.png`, fullPage: true })
    let body: unknown,
      completedId = ''
    await page.route(
      '**/api/account/formulas',
      async (route) => {
        if (route.request().method() !== 'POST') {
          await route.continue()
          return
        }
        body = route.request().postDataJSON()
        const response = await route.fetch()
        expect(response.status()).toBe(201)
        completedId = ((await response.json()) as SavedFormula).id
        await route.abort('failed')
      },
      { times: 1 },
    )
    await page.getByRole('button', { name: '保存到账号公式库' }).click()
    await expect(page.getByRole('button', { name: '确认上次保存' })).toBeEnabled()
    page.once('dialog', (dialog) => dialog.accept())
    await page.reload()
    await page.waitForFunction(() => !!document.querySelector('#manual-latex'))
    await expect(page.getByLabel('LaTeX', { exact: true })).toHaveValue('\\frac{1}{2}')
    const replay = page.waitForResponse(
      (r) => r.url().endsWith('/api/account/formulas') && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: '确认上次保存' }).click()
    expect((await replay).status()).toBe(200)
    expect((await replay).request().postDataJSON()).toEqual(body)
    await expect(page).toHaveURL(new RegExp('/formulas/' + completedId + '$'))
    const formula = (await (
      await page.request.get('/api/account/formulas/' + completedId)
    ).json()) as SavedFormula
    expect(formula.image).toBeNull()
    expect(formula.versions[0]!.origin).toBe('MANUAL')
    expect(formula.versions[0]!.isMock).toBe(false)
    await page.getByRole('button', { name: '原始输入', exact: true }).click()
    await expect(page.getByText('手动输入，未上传原图；这里保留首个已保存版本。')).toBeVisible()
    await page.getByRole('button', { name: '数学公式', exact: true }).click()
    await page.getByRole('button', { name: '复制 LaTeX', exact: true }).click()
    // Clipboard capability is browser-dependent; the explicit fallback must remain usable.
    await page.evaluate(() =>
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined }),
    )
    await page.getByRole('button', { name: '复制 LaTeX', exact: true }).click()
    await expect(
      page.getByRole('textbox', { name: '复制 LaTeX：手动复制内容', exact: true }),
    ).toHaveValue('\\frac{1}{2}')
    const owner = await db.formula.findUniqueOrThrow({ where: { id: completedId } })
    expect(await db.recognitionTask.count({ where: { ownerId: owner.ownerId } })).toBe(0)
    expect(
      await db.dailyUsage.count({ where: { ownerId: owner.ownerId, kind: 'RECOGNITION' } }),
    ).toBe(0)
    await visit(page, '/ai/new?versionId=' + formula.versions[0]!.id)
    await page.getByRole('textbox', { name: '输入提问，Shift 加回车换行' }).fill('请解释手动公式')
    await page.getByRole('button', { name: '发送提问', exact: true }).click()
    await expect(page).toHaveURL(/\/ai\/[0-9a-f-]+$/)
    await expect(page.getByText('方程可以因式分解', { exact: false }).last()).toBeVisible()
    await visit(page, '/formulas/' + completedId)
    await page.getByRole('button', { name: '导出 Word', exact: true }).click()
    const exportDialog = page.getByRole('dialog', { name: '导出可编辑 Word' })
    await expect(exportDialog.getByRole('option', { name: /v1 · 手动输入/ })).toHaveCount(1)
    await exportDialog.getByText('在 Word 中使用公式', { exact: true }).click()
    await expect(exportDialog.getByText(/Alt\+=/)).toBeVisible()
    await page.screenshot({ path: 'tmp/r18/screenshots/export-' + width + '.png', fullPage: true })
    await page.getByRole('button', { name: '生成 Word 文档', exact: true }).click()
    await expect(page).toHaveURL(/\/exports\/[0-9a-f-]+$/)
    const downloading = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 Word', exact: true }).click()
    const file = await (await downloading).path()
    const xml = strFromU8(unzipSync(readFileSync(file!))['word/document.xml']!)
    expect(xml).toContain('m:oMath')
    expect(xml).toContain('m:f')
    await visit(page, '/library?space=account')
    await expect(page.getByText('R18手动公式', { exact: true })).toBeVisible()
    await noOverflow(page)
    await page.evaluate(() =>
      sessionStorage.setItem(
        'formula-manual-creation-recovery-v1',
        JSON.stringify({ ownerId: 'test-receipt', input: {} }),
      ),
    )
    await visit(page, '/settings')
    page.once('dialog', (dialog) => dialog.accept())
    await page.getByRole('button', { name: '退出登录', exact: true }).click()
    await expect(page).toHaveURL(/\/profile$/)
    expect(
      await page.evaluate(() => sessionStorage.getItem('formula-manual-creation-recovery-v1')),
    ).toBeNull()
    await visit(page, '/formulas/new')
    await expect(page).toHaveURL(/\/login\?redirect=/)
    const proof = {
      width,
      cropCancel: true,
      originalReused: true,
      exifOrientation: 6,
      objectUrlsReleased: true,
      manualId: completedId,
      manualOrigin: 'MANUAL',
      replayStatus: 200,
      recognitionUsage: 0,
      chat: true,
      docx: true,
    }
    console.log(JSON.stringify({ r18: proof }))
  })
