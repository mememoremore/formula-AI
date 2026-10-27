async function checkHome(page) {
  const checks = []
  const base = 'http://127.0.0.1:3200'
  const shots = 'docs/设计稿/R4首页/'
  function ensure(value, name) {
    if (!value) throw new Error(name)
    checks.push(name)
  }
  async function scenario(value) {
    await page.context().addCookies([{ name: 'r4-home', value, url: base, sameSite: 'Lax' }])
  }
  async function ready() {
    await page.locator('#home-title').waitFor()
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })
  }
  async function open(value, path = '/') {
    await scenario(value)
    await page.goto(base + path)
    await ready()
  }
  async function layout(width) {
    const m = await page.evaluate(() => {
      const art = document.querySelector('.hero-art').getBoundingClientRect()
      const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
      return {
        scroll: document.documentElement.scrollWidth,
        artLeft: art.left,
        artRight: art.right,
        navBottom: nav.bottom,
        width: innerWidth,
        images: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
        targets: [
          ...document.querySelectorAll('.home-actions a,.home-brand a,.bottom-nav a'),
        ].every((el) => el.getBoundingClientRect().height >= 44),
        lines: [...document.querySelectorAll('.entry-copy p,.entry-copy h3')].every(
          (el) =>
            el.scrollHeight <= el.clientHeight + 1 &&
            getComputedStyle(el).webkitLineClamp === 'none',
        ),
      }
    })
    ensure(m.scroll === width, `${width}: 首页无整页横向溢出`)
    ensure(m.artLeft >= 0 && m.artRight <= width, `${width}: 插画处于页面边界内`)
    ensure(m.images, `${width}: 图片实际加载`)
    ensure(m.targets, `${width}: 主入口、头像和导航触控高度至少44px`)
    ensure(m.lines, `${width}: 卡片文字完整换行，无行数截断`)
    ensure(Math.abs(m.navBottom - 900) < 1, `${width}: 底部导航固定`)
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  // 必须先完成三个手机宽度，再进入桌面阶段。
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 })
    await open('guest')
    await layout(width)
    ensure(
      await page.getByText('本机预置示例 · 并非真实识别结果', { exact: true }).isVisible(),
      `${width}: 游客示例边界清楚`,
    )
    await page.screenshot({ path: shots + `修改后${width}.png`, fullPage: true })
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    const last = await page.locator('.home-note').boundingBox()
    const nav = await page.locator('.bottom-nav').boundingBox()
    ensure(last.y + last.height <= nav.y, `${width}: 页面末尾不被导航遮挡`)
    await open('records')
    await layout(width)
    ensure(
      await page.getByText('一元二次方程的根', { exact: true }).isVisible(),
      `${width}: 账号公式记录显示`,
    )
    ensure(
      await page.getByText('理解求根公式', { exact: true }).isVisible(),
      `${width}: 账号对话记录显示`,
    )
    ensure((await page.locator('.home-note').count()) === 0, `${width}: 账号不混入游客说明`)
    ensure(
      (await page.locator('.entry-link').first().getAttribute('href')) === '/ai/r4-chat',
      `${width}: 继续对话保留账号会话地址`,
    )
    if (width === 390) await page.screenshot({ path: shots + '账号记录390.png', fullPage: true })
  }
  await page.setViewportSize({ width: 320, height: 900 })
  await open('long')
  await layout(320)
  ensure(
    await page
      .locator('.entry-formula')
      .evaluateAll((els) => els.some((el) => el.scrollWidth > el.clientWidth)),
    '长公式只在可聚焦的公式区域滚动',
  )
  await page.locator('.entry-formula').last().focus()
  await page.screenshot({ path: shots + '长标题与公式320.png', fullPage: true })

  await page.setViewportSize({ width: 390, height: 900 })
  await open('empty')
  ensure(
    await page.getByText('等待你的第一笔', { exact: true }).isVisible(),
    '账号空记录有明确入口',
  )
  await page.screenshot({ path: shots + '空记录390.png', fullPage: true })
  for (const failed of ['formulas-error', 'conversations-error', 'records-error']) {
    await open(failed)
    await page.getByRole('button', { name: '重试最近记录' }).waitFor()
    ensure((await page.locator('.home-note').count()) === 0, `${failed}: 失败不降级演示`)
    if (failed === 'formulas-error')
      ensure(
        await page.getByText('理解求根公式', { exact: true }).isVisible(),
        '公式失败不遮住成功的对话',
      )
    if (failed === 'conversations-error')
      ensure(
        await page.getByText('一元二次方程的根', { exact: true }).isVisible(),
        '对话失败不遮住成功的公式',
      )
    if (failed === 'records-error')
      await page.screenshot({ path: shots + '记录失败390.png', fullPage: true })
    await scenario('records')
    const [formulaResponse, conversationResponse] = await Promise.all([
      page.waitForResponse('**/api/account/library'),
      page.waitForResponse('**/api/account/conversations'),
      page.getByRole('button', { name: '重试最近记录' }).click(),
    ])
    await page.getByText('一元二次方程的根', { exact: true }).waitFor()
    await page.getByText('理解求根公式', { exact: true }).waitFor()
    await page.waitForFunction(() => !document.querySelector('.home-feedback'))
    ensure(
      (await formulaResponse.status()) === 200 && (await conversationResponse.status()) === 200,
      `${failed}: 重试确实重新请求记录接口`,
    )
  }
  await open('session-error')
  ensure(
    await page.getByText('账号状态暂时无法确认', { exact: true }).isVisible(),
    'Session 故障单独显示',
  )
  ensure((await page.locator('.recent-entry').count()) === 0, 'Session 故障不展示游客或私有缓存')
  await page.screenshot({ path: shots + '会话失败390.png', fullPage: true })
  await scenario('records')
  const [sessionResponse] = await Promise.all([
    page.waitForResponse('**/api/account/session'),
    page.getByRole('button', { name: '重新连接账号' }).click(),
  ])
  await page.getByText('一元二次方程的根', { exact: true }).waitFor()
  ensure((await sessionResponse.status()) === 200, 'Session 重试确实重新请求会话接口')

  await open('records', '/__home')
  await scenario('slow')
  await page.getByRole('button', { name: '刷新测试会话' }).click()
  await page.locator('.home-loading').waitFor()
  await page.screenshot({ path: shots + '加载390.png', fullPage: true })
  await scenario('other')
  await page.getByRole('button', { name: '刷新测试会话' }).click()
  await page.getByText('等待你的第一笔', { exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  ensure(
    (await page.getByText('一元二次方程的根', { exact: true }).count()) === 0,
    '慢请求期间更换身份后，旧结果不覆盖新账号',
  )
  await scenario('guest')
  await page.getByRole('button', { name: '刷新测试会话' }).click()
  await page.getByText('本机预置示例 · 并非真实识别结果', { exact: true }).waitFor()
  ensure(
    (await page.getByText('理解求根公式', { exact: true }).count()) === 0,
    '退出到游客后不混入账号对话',
  )

  await open('guest')
  await page.locator('.home-actions a').first().click()
  await page.waitForFunction(() => location.pathname === '/upload')
  ensure(
    await page.evaluate(() => new URLSearchParams(location.search).get('source') === 'camera'),
    '识别入口保留相机语义',
  )
  await page.getByRole('link', { name: '返回上一页' }).click()
  await page.waitForFunction(() => location.pathname === '/')
  await ready()
  await page.locator('.home-actions a').nth(1).click()
  await page.waitForFunction(() => location.pathname === '/upload')
  ensure(
    await page.evaluate(() => !new URLSearchParams(location.search).has('source')),
    '上传入口保留相册语义',
  )
  await open('guest')
  await page.locator('.entry-link').last().click()
  await page.waitForFunction(() => location.pathname.startsWith('/result/'))
  await page.getByRole('link', { name: '返回上一页' }).click()
  await page.waitForFunction(() => location.pathname === '/')
  await ready()
  ensure(
    (await page.locator('.bottom-nav a[aria-current="page"]').innerText()) === '首页',
    '详情返回后首页导航正确',
  )

  const mobilePassed = checks.length
  for (const width of [768, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await open('guest')
    await layout(width)
    ensure(
      (await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().width)) === 480,
      `${width}: 正式首页保留兼容宽度`,
    )
    await page.screenshot({ path: shots + `修改后${width}.png`, fullPage: true })
  }
  await open('guest', '/__home?width=reading')
  ensure(
    (await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().width)) === 760,
    '桌面阅读宽度仅在隔离预览启用',
  )
  await page.screenshot({ path: shots + '桌面阅读宽度候选.png', fullPage: true })
  await scenario('guest')
  return { passed: checks.length, mobilePassed, checks }
}
