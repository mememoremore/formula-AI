async function checkLayoutAndNavigation(page) {
  const checks = []
  function ensure(condition, name) {
    if (!condition) throw new Error(name)
    checks.push(name)
  }
  const base = 'http://127.0.0.1:3200'
  const shots = 'docs/设计稿/R3布局导航/'
  async function address() {
    return page.evaluate(() => ({
      pathname: location.pathname,
      hash: location.hash,
      query: Object.fromEntries(new URLSearchParams(location.search)),
    }))
  }
  async function ready() {
    await page.locator('.app-shell').waitFor()
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    for (const mode of ['compact', 'reading', 'workspace']) {
      await page.goto(base + '/__layout?width=' + mode)
      await ready()
      const metrics = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell').getBoundingClientRect()
        const nav = document.querySelector('.bottom-nav').getBoundingClientRect()
        return {
          overflow: document.documentElement.scrollWidth > innerWidth,
          shell: shell.width,
          nav: nav.width,
          fixed: getComputedStyle(document.querySelector('.bottom-nav')).position,
          bottom: nav.bottom,
          formulaOverflow:
            document.querySelector('.math-formula').scrollWidth >
            document.querySelector('.math-formula').clientWidth,
        }
      })
      const expected = Math.min(
        width,
        width < 900 ? 480 : { compact: 480, reading: 760, workspace: 1080 }[mode],
      )
      ensure(!metrics.overflow, `${width}/${mode}: 无整页横向溢出`)
      ensure(
        metrics.shell === expected && metrics.nav === expected,
        `${width}/${mode}: 内容与导航宽度一致`,
      )
      ensure(
        metrics.fixed === 'fixed' && Math.abs(metrics.bottom - 844) < 1,
        `${width}/${mode}: 导航固定在视口底部`,
      )
      if (width === 320) ensure(metrics.formulaOverflow, `${mode}: 长公式内部滚动`)
      if ((width === 320 || width === 390) && mode === 'compact')
        await page.screenshot({ path: shots + `手机${width}布局.png` })
      if (width === 1440 && mode === 'workspace')
        await page.screenshot({ path: shots + '桌面工作区布局.png' })
    }
  }

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(base + '/__layout')
  await ready()
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  const end = await page.locator('#layout-end').boundingBox()
  const nav = await page.locator('.bottom-nav').boundingBox()
  ensure(end.y + end.height <= nav.y, '长页末尾按钮不被固定导航遮挡')
  await page.screenshot({ path: shots + '长页面末尾与导航.png' })
  await page.locator('#layout-end').click()
  await page.getByRole('dialog', { name: '布局验证弹窗' }).waitFor()
  const scrollBefore = await page.evaluate(() => scrollY)
  await page.mouse.move(2, 2)
  await page.mouse.wheel(0, -500)
  await page.evaluate(() => new Promise(requestAnimationFrame))
  ensure((await page.evaluate(() => scrollY)) === scrollBefore, '弹窗打开后背景不能滚动')
  ensure(
    await page.evaluate(() => document.elementFromPoint(195, 820).tagName === 'DIALOG'),
    '原生弹窗顶层覆盖底部导航',
  )
  await page.getByLabel('本次备注').fill('仅验证焦点，不保存')
  await page.screenshot({ path: shots + '弹窗与固定导航层级.png' })
  await page.keyboard.press('Escape')
  ensure(!(await page.getByRole('dialog').isVisible()), 'Esc 关闭弹窗')
  ensure(
    await page.locator('#layout-end').evaluate((el) => el === document.activeElement),
    '弹窗关闭后焦点恢复',
  )
  ensure(
    await page.evaluate(() => getComputedStyle(document.documentElement).overflow !== 'hidden'),
    '弹窗关闭后滚动锁解除',
  )

  await page.goto(base + '/__layout?composer=on')
  await ready()
  await page.locator('.chat-composer textarea').fill('输入区与导航之间留有间距')
  await page.getByRole('button', { name: '显示反馈', exact: true }).click()
  await page.locator('.toast').waitFor()
  const composer = await page.locator('.chat-composer').boundingBox()
  const currentNav = await page.locator('.bottom-nav').boundingBox()
  const toast = await page.locator('.toast').boundingBox()
  ensure(composer.y + composer.height < currentNav.y, '输入区位于导航上方')
  ensure(toast.y + toast.height < composer.y, 'Toast 不覆盖输入区')
  await page.locator('.chat-composer textarea').focus()
  await page.screenshot({ path: shots + '输入区反馈与导航.png' })
  await page.goto(base + '/__layout?nav=off')
  await ready()
  ensure(
    await page.evaluate(
      () => !document.documentElement.style.getPropertyValue('--chat-composer-height'),
    ),
    '输入区卸载后释放高度变量',
  )
  await page.getByRole('button', { name: '显示反馈', exact: true }).click()
  ensure((await page.locator('.toast').boundingBox()).y > 700, '无导航页面不预留导航高度')

  await page.goto(base + '/__layout')
  await ready()
  await page.addStyleTag({ content: ':root { --safe-area-top: 28px; --safe-area-bottom: 34px; }' })
  const safe = await page.evaluate(() => ({
    top: parseFloat(getComputedStyle(document.querySelector('.page-content')).paddingTop),
    bottom: parseFloat(getComputedStyle(document.querySelector('.page-content')).paddingBottom),
    nav: parseFloat(getComputedStyle(document.querySelector('.bottom-nav')).paddingBottom),
  }))
  ensure(
    safe.top === 56 && safe.bottom === 142 && safe.nav === 43,
    '模拟上下安全区正确计入内容和导航（非真机认证）',
  )

  await page.goto(base + '/__layout?step=1')
  await ready()
  await page.evaluate(() => scrollTo(0, 500))
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$router.push('/__layout?step=2'),
  )
  await ready()
  ensure((await page.evaluate(() => scrollY)) === 500, '同页查询更新不强制跳到顶部')
  await page.evaluate(() => scrollTo(0, 1100))
  await page.goBack()
  await ready()
  ensure((await page.evaluate(() => scrollY)) === 500, '同页查询的浏览器后退也恢复历史滚动位置')

  // 以下访问真实产品路由。启动器无数据库/模型/存储凭据，仅验证游客和认证跳转。
  await page.goto(base + '/favorites?space=demo&keep=1#main-content')
  await ready()
  let url = await address()
  ensure(
    url.pathname === '/library' &&
      url.query.view === 'favorites' &&
      url.query.keep === '1' &&
      url.hash === '#main-content',
    '旧地址规范化并保留其他查询和锚点',
  )
  await page.reload()
  await ready()
  ensure((await address()).pathname === '/library', '旧地址规范化后刷新不循环')
  await page.locator('.bottom-nav').getByRole('link', { name: '公式库', exact: true }).click()
  ensure((await address()).query.view === 'favorites', '再次点击当前入口保留筛选')

  await page.goto(base + '/library?space=demo&view=all&keep=context')
  await ready()
  const detailLink = page.locator('a[href^="/result/"]').first()
  await detailLink.waitFor()
  await detailLink.click()
  await ready()
  ensure((await address()).pathname.startsWith('/result/'), '游客动态详情深链接可访问')
  await page.reload()
  await ready()
  ensure(
    (await page.getByRole('link', { name: '返回上一页' }).getAttribute('href')).includes(
      'keep=context',
    ),
    '详情刷新后仍可返回完整列表上下文',
  )
  await page.getByRole('link', { name: '返回上一页' }).click()
  await ready()
  ensure((await address()).query.keep === 'context', '页面返回保留列表上下文')
  await page.goForward()
  await ready()
  ensure((await address()).pathname.startsWith('/result/'), '浏览器前进可重新进入详情')
  await page.goBack()
  await ready()
  await page.locator('.bottom-nav').getByRole('link', { name: 'AI', exact: true }).click()
  await ready()
  ensure(
    (await address()).pathname === '/ai' && (await address()).query.space === 'demo',
    '跨入口保留演示空间',
  )
  ensure(
    (await page.locator('.bottom-nav a[aria-current="page"]').innerText()) === 'AI',
    '主导航活动项正确',
  )

  await page.goto(base + '/help')
  await ready()
  await page.evaluate(() => scrollTo(0, 180))
  const helpScroll = await page.evaluate(() => scrollY)
  // 通过 Nuxt 路由器驱动，不触发业务操作。
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/about'),
  )
  await ready()
  await page.goBack()
  await ready()
  ensure(
    Math.abs((await page.evaluate(() => scrollY)) - helpScroll) < 3,
    '浏览器后退恢复长页滚动位置',
  )
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/about'),
  )
  await ready()
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/help'),
  )
  await ready()
  ensure(
    helpScroll > 0 && Math.abs((await page.evaluate(() => scrollY)) - helpScroll) < 3,
    '重新进入已访问页面时有界快照恢复滚动',
  )

  for (const path of [
    '/formulas/r3-check?version=2',
    '/recognitions/r3-check',
    '/exports/r3-check',
    '/ai/r3-check',
    '/profile/edit',
  ]) {
    await page.goto(base + path)
    await ready()
    url = await address()
    ensure(url.pathname === '/login' && url.query.redirect === path, `${path}: 深链接认证保留目标`)
  }
  await page.goto(base + '/account/tasks/r3-check?keep=1')
  await ready()
  ensure(
    (await address()).query.redirect === '/recognitions/r3-check?keep=1',
    '旧任务深链接先规范化再保留登录目标',
  )

  await page.goto(base + '/ai/new?space=demo')
  await ready()
  ensure(await page.locator('.chat-composer').isVisible(), '真实游客聊天输入区可访问')
  ensure((await page.locator('.bottom-nav').count()) === 0, '真实聊天页沿用原本无导航模式')
  await page.goto(base + '/profile?space=demo')
  await ready()
  ensure(
    (await page.locator('.bottom-nav a[aria-current="page"]').innerText()) === '我的',
    '我的入口活动项正确',
  )

  // 只拦截浏览器请求；SSR 始终由隔离层空会话替身处理。
  // 登录不写 Cookie、不创建真实账号、不调用认证数据库。
  const user = {
    id: 'r3-fixture-user',
    name: '布局验收',
    email: 'r3@example.invalid',
    emailVerified: true,
    image: null,
  }
  const session = {
    id: 'r3-fixture-session',
    userId: user.id,
    token: 'r3-fixture-token',
    expiresAt: '2099-01-01T00:00:00.000Z',
    createdAt: '2026-10-26T00:00:00.000Z',
    updatedAt: '2026-10-26T00:00:00.000Z',
  }
  await page.goto(base + '/login?redirect=%2Fhelp%3Ffrom%3Dlogin')
  await ready()
  await page.route('**/api/auth/**', async (route) => {
    const url = route.request().url()
    if (url.includes('/sign-in/email') && route.request().method() === 'POST') {
      await route.fulfill({ json: { redirect: false, token: session.token, user } })
    } else if (url.includes('/get-session')) {
      await route.fulfill({ json: { session, user } })
    } else {
      await route.abort()
    }
  })
  await page.route('**/api/account/session', (route) => route.fulfill({ json: { user } }))
  try {
    await page.getByPlaceholder('请输入邮箱').fill('r3@example.invalid')
    await page.getByPlaceholder('请输入密码', { exact: true }).fill('r3-fixture-password')
    const [response] = await Promise.all([
      page.waitForResponse('**/api/auth/sign-in/email'),
      page.getByRole('button', { name: '登录', exact: true }).click(),
    ])
    await page.waitForURL('**/help?from=login')
    await page.waitForFunction(
      () =>
        location.pathname === '/help' &&
        new URLSearchParams(location.search).get('from') === 'login',
    )
    await ready()
    const loginStatus = await response.status()
    const loginAddress = await address()
    ensure(
      loginStatus === 200 && loginAddress.query.from === 'login',
      '受控登录成功后回到完整站内目标: ' + JSON.stringify({ loginStatus, loginAddress }),
    )
    const authRequests = await page.evaluate(() =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.includes('/api/auth/')),
    )
    ensure(
      authRequests.every((url) => url.includes('/sign-in/email') || url.includes('/get-session')),
      '登录验收没有未受控的认证请求',
    )
  } finally {
    await page.unroute('**/api/auth/**')
    await page.unroute('**/api/account/session')
  }
  return { passed: checks.length, checks }
}
