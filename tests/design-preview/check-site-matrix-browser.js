async function checkSiteMatrix(page) {
  const base = 'http://127.0.0.1:3200',
    stamp = Date.now().toString(36),
    rows = []
  const cases = [
    ['首页', '/', 'r4-home', 'records'],
    ['公式库', '/library?space=account', 'r5-library', 'account'],
    ['公式详情', '/formulas/r6-formula', 'r6-detail', 'account'],
    ['演示结果', '/result/integral?space=demo', 'r6-detail', 'guest'],
    ['上传', '/upload?space=account', 'r7-recognition', 'account'],
    ['识别任务', '/recognitions/r7-t1', 'r7-recognition', 'processing'],
    ['会话列表', '/ai?space=account', 'r8-chat', 'account'],
    ['新对话', '/ai/new?space=account', 'r8-chat', 'account'],
    ['正式聊天', '/ai/88888888-8888-4888-8888-888888888888', 'r8-chat', 'account'],
    ['登录', '/login', 'r9-account', 'guest'],
    ['个人中心', '/profile?space=account', 'r9-account', 'account'],
    ['资料编辑', '/profile/edit', 'r9-account', 'account'],
    ['设置', '/settings', 'r9-account', 'account'],
    ['导出', '/exports/r10-export', 'r10-final', 'completed'],
    ['帮助', '/help', 'r10-final', 'guest'],
    ['反馈', '/feedback', 'r10-final', 'guest'],
    ['关于', '/about', 'r10-final', 'guest'],
  ]
  await page.addInitScript(() => {
    window.__r10Diagnostics = []
    window.confirm = () => true
    window.addEventListener('error', (event) => window.__r10Diagnostics.push(event.message))
    window.addEventListener('unhandledrejection', (event) =>
      window.__r10Diagnostics.push(String(event.reason)),
    )
    const warn = console.warn.bind(console)
    console.warn = (...args) => {
      if (/hydration|Vue warn/i.test(String(args[0]))) window.__r10Diagnostics.push(String(args[0]))
      warn(...args)
    }
  })
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (let index = 0; index < cases.length; index++) {
      const [name, path, cookie, mode] = cases[index]
      await page.context().clearCookies()
      const prefix = cookie.split('-')[0]
      await page.context().addCookies([
        { name: cookie, value: mode, url: base },
        {
          name: prefix + '-run',
          value: prefix + '-matrix-' + stamp + '-' + width + '-' + index,
          url: base,
        },
      ])
      await page.goto(base + path, { waitUntil: 'domcontentloaded' })
      await page.waitForFunction(
        () =>
          document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
            ?.isHydrating === false,
      )
      await page.locator('.app-shell').waitFor()
      await page.evaluate(() => document.fonts.ready)
      await page.screenshot({
        path: `docs/设计稿/R10全站收尾/全站-${name}-${width}.png`,
        fullPage: true,
      })
      const metrics = await page.evaluate(() => {
        const shell = document.querySelector('.app-shell').getBoundingClientRect(),
          nav = document.querySelector('.bottom-nav')?.getBoundingClientRect()
        return {
          title: document.title,
          overflow: document.documentElement.scrollWidth > innerWidth + 1,
          frame: shell.width,
          nav: nav ? nav.bottom <= innerHeight + 1 : null,
          errors: window.__r10Diagnostics,
          broken: [...document.images]
            .filter((image) => !image.complete || image.naturalWidth === 0)
            .map((image) => image.src),
        }
      })
      if (
        metrics.overflow ||
        metrics.errors.length ||
        metrics.broken.length ||
        metrics.nav === false
      )
        throw Error(JSON.stringify({ name, width, ...metrics }))
      await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
      const bottom = await page.evaluate(() => {
        const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect(),
          main = document.querySelector('main').getBoundingClientRect()
        return !nav || main.bottom <= nav.top + 1
      })
      // main includes the navigation reserve; inspect the final content element rather than its padding.
      const clear = await page.evaluate(() => {
        const nav = document.querySelector('.bottom-nav')?.getBoundingClientRect()
        const content = document.querySelector('main > :last-child')?.getBoundingClientRect()
        return !nav || !content || content.bottom <= nav.top + 1
      })
      if (!clear) throw Error(name + width + '底部内容遮挡')
      if (width === 390)
        await page.screenshot({ path: `docs/设计稿/R10全站收尾/全站底部-${name}-390.png` })
      let refreshAndBack = false
      if (width === 390) {
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () =>
            document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
              ?.isHydrating === false,
        )
        await page.waitForFunction((title) => document.title === title, metrics.title)
        await page.evaluate(
          (target) =>
            document
              .querySelector('#__nuxt')
              .__vue_app__.config.globalProperties.$nuxt.$router.push(target),
          path === '/about' ? '/help' : '/about',
        )
        await page.waitForFunction(
          (target) => location.pathname === target,
          path === '/about' ? '/help' : '/about',
        )
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction((target) => location.pathname + location.search === target, path)
        await page.waitForFunction((title) => document.title === title, metrics.title)
        refreshAndBack = true
      }
      rows.push({
        name,
        path,
        width,
        ...metrics,
        clear,
        mainIncludesReserve: !bottom,
        refreshAndBack,
      })
    }
  }
  return {
    passed: rows.length,
    rows,
    note: '真实浏览器+受控HTTP；每页成功态与导航/溢出/资源烟测，完整业务状态另由专项回归覆盖',
  }
}
