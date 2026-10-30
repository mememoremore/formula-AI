async function checkDetail(page) {
  const base = 'http://127.0.0.1:3200',
    shots = 'tmp/r6-detail-check/',
    checks = []
  const ensure = (value, name) => {
    if (!value) throw new Error(name)
    checks.push(name)
  }
  await page.addInitScript(() => {
    if (window.__r6Installed) return
    window.__r6Installed = true
    window.__r6Errors = []
    window.__r6Calls = []
    window.__r6Confirms = 0
    window.__r6Allow = false
    window.confirm = () => {
      window.__r6Confirms++
      return window.__r6Allow
    }
    for (const level of ['warn', 'error']) {
      const orig = console[level].bind(console)
      console[level] = (...args) => {
        const s = args.filter((a) => typeof a === 'string').join(' ')
        if (/Hydration|\[Vue warn\]|NUXT_E\d+/.test(s)) window.__r6Errors.push(s)
        orig(...args)
      }
    }
    window.addEventListener('error', (e) => {
      if (e.message) window.__r6Errors.push(e.message)
    })
    window.addEventListener('unhandledrejection', (e) => window.__r6Errors.push(String(e.reason)))
    const fetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      window.__r6Calls.push({ url: String(input), method: init?.method ?? 'GET', body: init?.body })
      return fetch(input, init)
    }
  })
  let seq = 0
  async function mode(value, fresh = false) {
    const c = [{ name: 'r6-detail', value, url: base }]
    if (fresh) c.push({ name: 'r6-run', value: 'r6-' + Date.now() + '-' + ++seq, url: base })
    await page.context().addCookies(c)
  }
  async function ready() {
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    const errors = await page.evaluate(() => window.__r6Errors)
    ensure(!errors.length, '页面无脚本或水合错误')
  }
  async function open(value = 'account', path = '/formulas/r6-formula', fresh = true) {
    await mode(value, fresh)
    await page.goto(base + path)
    await ready()
  }
  async function close() {
    await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
    await page.getByRole('dialog').waitFor({ state: 'hidden' })
  }
  async function editor() {
    await page.getByRole('button', { name: /编辑公式/ }).click()
    await page.getByRole('dialog').waitFor()
  }
  async function layout(width, kind) {
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      inner: innerWidth,
      frame: document.querySelector('.app-shell').getBoundingClientRect().width,
      nav: !!document.querySelector('.bottom-nav'),
      math: document.querySelector('.detail-paper .math-formula')?.getBoundingClientRect().toJSON(),
    }))
    ensure(m.scroll === width, kind + width + ': 无整页横溢')
    ensure(!m.nav, kind + width + ': 保留详情无导航布局')
    ensure(m.frame <= width, kind + width + ': 容器在视口内')
    const heights = await page
      .locator('.detail-tabs button,.menu-item,.detail-actions > .button')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height))
    ensure(
      heights.every((h) => h >= 44),
      kind + width + ': 操作触控至少44px',
    )
    if (width <= 430 && kind === '账号') {
      const scroll = await page.locator('.detail-paper .math-formula').evaluate((e) => {
        e.scrollLeft = 100
        return e.scrollLeft
      })
      ensure(scroll > 0, kind + width + ': 复杂长公式独立滚动')
      await page.locator('.detail-paper .math-formula').evaluate((e) => {
        e.scrollLeft = 0
      })
    }
  }
  await mode('')
  await page.goto(base + '/result/integral?space=demo')
  await page.evaluate(() => localStorage.removeItem('formula-ai:demo:v1'))
  await page.reload()
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 })
    await open()
    await layout(width, '账号')
    await page.screenshot({ path: shots + '账号修改后' + width + '.png', fullPage: true })
    await page.getByRole('button', { name: '原始图片', exact: true }).click()
    ensure(
      await page.locator('.source-image img').evaluate(async (e) => {
        await e.decode()
        return e.complete && e.naturalWidth > 0
      }),
      '原图实际加载' + width,
    )
    await page.screenshot({ path: shots + '原图' + width + '.png', fullPage: true })
    await editor()
    ensure(
      (await page.getByRole('textbox', { name: 'LaTeX', exact: true }).inputValue()).includes(
        'pmatrix',
      ),
      '编辑回填' + width,
    )
    await page.screenshot({ path: shots + '账号编辑' + width + '.png', fullPage: true })
    await close()
    await mode('')
    await page.goto(base + '/result/integral?space=demo')
    await ready()
    await layout(width, '游客')
    await page.screenshot({ path: shots + 'guest修改后' + width + '.png', fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 900 })
  // 游客：不调用账号保存；草稿关闭/返回/刷新保护。
  await page.goto(base + '/library?space=demo')
  await ready()
  await page.locator('a[href*="/result/integral"]').first().click()
  await ready()
  await editor()
  const demoTitle = page.getByRole('textbox', { name: '公式名称', exact: true })
  const demoLatex = page.getByRole('textbox', { name: 'LaTeX', exact: true })
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  ensure((await page.evaluate(() => window.__r6Confirms)) === 0, '未改内容关闭无需确认')
  await editor()
  await demoLatex.fill('\\frac{')
  ensure(
    await page.getByRole('button', { name: '保存修改', exact: true }).isDisabled(),
    '游客非法LaTeX禁止保存且提示',
  )
  await demoTitle.fill('本机修订')
  await demoLatex.fill('x=7')
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  ensure(await page.getByRole('dialog').isVisible(), '游客取消放弃保留草稿')
  const reloadProtected = await page.evaluate(() => {
    const e = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(e)
    return e.defaultPrevented
  })
  ensure(reloadProtected, '游客刷新触发浏览器离开保护')
  await page.goBack()
  ensure(await page.getByRole('dialog').isVisible(), '游客浏览器后退受到保护')
  await page.getByRole('button', { name: '保存修改', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ensure(
    await page.getByRole('heading', { name: '本机修订', exact: true }).isVisible(),
    '游客保存更新详情',
  )
  ensure(
    !(await page.evaluate(() => window.__r6Calls)).some(
      (c) => c.method === 'POST' && c.url.includes('/api/account/formulas'),
    ),
    '游客编辑不调用账号保存',
  )
  await page.getByRole('button', { name: /版本记录/ }).click()
  ensure((await page.locator('.version-row').count()) >= 2, '游客保留本机历史版本')
  await close()
  // 账号保存失败/冲突/重试，重复点击。
  await open('save-error', '/library?space=account')
  await page.locator('a[href*="/formulas/r6-formula"]').first().click()
  await ready()
  await editor()
  await page.getByRole('textbox', { name: 'LaTeX', exact: true }).fill('\\frac{')
  ensure(
    await page.getByRole('button', { name: '确认并保存', exact: true }).isDisabled(),
    '账号非法 LaTeX 明确提示并禁止保存',
  )
  await page.getByRole('textbox', { name: '公式名称', exact: true }).fill('账号新标题')
  await page.getByRole('textbox', { name: 'LaTeX', exact: true }).fill('y=42')
  await page.getByRole('button', { name: '确认并保存', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '保存失败' }).waitFor()
  ensure(
    (await page.getByRole('textbox', { name: 'LaTeX', exact: true }).inputValue()) === 'y=42',
    '账号失败保留草稿',
  )
  await mode('account')
  ensure(
    await page.evaluate(async () => {
      const formula = await (await fetch('/api/account/formulas/r6-formula')).json()
      const latest = formula.versions.at(-1)
      const response = await fetch('/api/account/formulas/r6-formula/versions', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          title: '外部窗口的新标题',
          latex: latest.latex,
          expectedVersionId: latest.id,
          expectedTitle: formula.title,
        }),
      })
      const renamed = await response.json()
      return (
        response.status === 200 &&
        renamed.title === '外部窗口的新标题' &&
        renamed.versions.at(-1).id === latest.id
      )
    }),
    '另一个窗口仅改标题，不推进内容版本',
  )
  await page.getByRole('button', { name: '确认并保存', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '其他窗口' }).waitFor()
  ensure(
    (await page.getByRole('textbox', { name: '公式名称', exact: true }).inputValue()) ===
      '账号新标题',
    '冲突仍保留名称和正文',
  )
  await page.screenshot({ path: shots + '保存冲突390.png', fullPage: true })
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base })
  await page.getByRole('button', { name: '复制当前草稿', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '草稿已复制' }).waitFor()
  ensure(
    await page.evaluate(
      async () =>
        (await navigator.clipboard.readText()).replace(/\r\n/g, '\n') === '账号新标题\n\ny=42',
    ),
    '冲突草稿完整复制，名称和正文不丢失',
  )
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  ensure(await page.getByRole('dialog').isVisible(), '账号关闭草稿受保护')
  ensure(
    await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(e)
      return e.defaultPrevented
    }),
    '账号刷新保护',
  )
  await page.goBack()
  ensure(await page.getByRole('dialog').isVisible(), '账号路由离开受保护')
  ensure(
    await page.getByRole('button', { name: '确认并保存', exact: true }).isDisabled(),
    '冲突后禁止直接重放旧草稿',
  )
  await page.getByRole('button', { name: '重新读取最新内容', exact: true }).click()
  ensure(
    (await page.getByRole('textbox', { name: 'LaTeX', exact: true }).inputValue()) === 'y=42',
    '取消放弃时仍保留草稿',
  )
  await page.evaluate(() => {
    window.__r6Allow = true
  })
  await mode('error')
  await page.getByRole('button', { name: '重新读取最新内容', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '读取失败' }).waitFor()
  ensure(
    (await page.getByRole('textbox', { name: 'LaTeX', exact: true }).inputValue()) === 'y=42',
    '读取最新内容失败仍保留草稿',
  )
  await mode('slow')
  await page.getByRole('button', { name: '重新读取最新内容', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelector('dialog[open] input')?.value === '外部窗口的新标题',
  )
  ensure(
    (await page.getByRole('textbox', { name: '公式名称', exact: true }).inputValue()) ===
      '外部窗口的新标题',
    '明确放弃后回填最新内容',
  )
  ensure(
    await page.getByRole('button', { name: '确认并保存', exact: true }).isDisabled(),
    '重新读取未修改时不保存',
  )
  await page.screenshot({ path: shots + '恢复最新内容390.png', fullPage: true })
  await page.getByRole('textbox', { name: '公式名称', exact: true }).fill('账号新标题')
  await page.getByRole('textbox', { name: 'LaTeX', exact: true }).fill('y=42')
  await page.evaluate(() => {
    window.__r6Allow = false
  })
  await page.getByRole('button', { name: '确认并保存', exact: true }).click()
  ensure(
    await page.getByRole('button', { name: '正在保存…', exact: true }).isDisabled(),
    '保存中禁止重复点击',
  )
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  ensure(await page.getByRole('dialog').isVisible(), '保存中禁止关闭')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ensure(
    await page.getByRole('heading', { name: '账号新标题', exact: true }).isVisible(),
    '账号成功保存更新标题',
  )
  const calls = await page.evaluate(() =>
    window.__r6Calls.filter(
      (c) =>
        c.url.endsWith('/versions') &&
        c.method === 'POST' &&
        JSON.parse(c.body).title === '账号新标题',
    ),
  )
  ensure(calls.length === 3, '失败、冲突和成功各一次提交，无重复提交')
  ensure(
    JSON.stringify(calls.map((c) => JSON.parse(c.body).expectedTitle)) ===
      JSON.stringify([
        '矩阵与定积分：一次公式探索',
        '矩阵与定积分：一次公式探索',
        '外部窗口的新标题',
      ]),
    '请求传打开快照原标题，不能传新标题代替',
  )
  await editor()
  ensure(
    (await page.getByRole('textbox', { name: 'LaTeX', exact: true }).inputValue()) === 'y=42',
    '再次编辑回填已保存内容',
  )
  const confirms = await page.evaluate(() => window.__r6Confirms)
  await close()
  ensure((await page.evaluate(() => window.__r6Confirms)) === confirms, '账号未改内容无需确认')
  await page.reload()
  await ready()
  ensure(
    await page.getByRole('heading', { name: '账号新标题', exact: true }).isVisible(),
    '深链接刷新读取已保存内容',
  )
  await page.getByRole('button', { name: /版本记录/ }).click()
  ensure((await page.locator('.version-row').count()) === 3, '新增内容仅创建一个版本')
  await page.locator('.version-row').last().locator('summary').click()
  ensure(
    (await page.locator('.version-row').last().getByRole('link').getAttribute('href')).includes(
      'r6-v1',
    ),
    '历史讨论固定原版本',
  )
  await page.screenshot({ path: shots + '版本记录390.png', fullPage: true })
  await close()
  // 收藏、分类与导出。
  await mode('favorite-error')
  await page.getByRole('button', { name: '收藏这条公式', exact: true }).click()
  await page.waitForLoadState('networkidle')
  ensure(
    await page.getByRole('button', { name: '收藏这条公式', exact: true }).isVisible(),
    '收藏失败不留下错误状态',
  )
  await mode('account')
  await page.getByRole('button', { name: '收藏这条公式', exact: true }).click()
  await page.getByRole('button', { name: '取消收藏这条公式', exact: true }).waitFor()
  ensure(true, '收藏成功及时更新')
  await mode('category-error')
  await page.getByRole('button', { name: '代数', exact: true }).click()
  await page.getByRole('button', { name: '重新加载分类', exact: true }).waitFor()
  await mode('account')
  await page.getByRole('button', { name: '重新加载分类', exact: true }).click()
  await page.getByRole('dialog').getByText('微积分', { exact: true }).click()
  await page.getByRole('button', { name: '保存分类', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ensure(
    await page.getByRole('button', { name: '微积分', exact: true }).isVisible(),
    '分类失败重试后更新',
  )
  await page.getByRole('button', { name: '导出 Word', exact: true }).click()
  await page.getByRole('combobox').selectOption('r6-v1')
  ensure(await page.getByText('将导出 v1 的已保存内容').isVisible(), '导出选择历史已保存版本')
  await page.screenshot({ path: shots + '导出版本390.png', fullPage: true })
  await mode('export-error')
  await page.getByRole('button', { name: '生成 Word 文档', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '导出任务' }).waitFor()
  ensure(
    await page.getByRole('heading', { name: '账号新标题', exact: true }).isVisible(),
    '导出失败与详情错误分离',
  )
  await mode('account')
  await page.getByRole('button', { name: '生成 Word 文档', exact: true }).click()
  await page.waitForURL('**/exports/r6-export')
  const exports = await page.evaluate(() =>
    window.__r6Calls
      .filter((c) => c.url.endsWith('/exports') && c.method === 'POST')
      .map((c) => JSON.parse(c.body)),
  )
  ensure(
    exports.length === 2 &&
      exports[0].formulaVersionId === 'r6-v1' &&
      exports[1].requestKey === exports[0].requestKey,
    '导出重试保持固定版本与幂等键',
  )
  // 公式库->编辑->返回，筛选和更新。
  await page.goto(base + '/library?space=account&q=账号')
  await ready()
  await page.locator('a[href*="/formulas/r6-formula"]').first().click()
  await ready()
  await editor()
  await page.getByRole('textbox', { name: '公式名称', exact: true }).fill('账号返回新名')
  await page.getByRole('textbox', { name: 'LaTeX', exact: true }).fill('z=99')
  await page.getByRole('button', { name: '确认并保存', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.getByRole('link', { name: '返回上一页', exact: true }).click()
  await page.waitForURL('**/library?space=account&q=%E8%B4%A6%E5%8F%B7')
  await ready()
  ensure(
    await page.getByRole('heading', { name: '账号返回新名', exact: true }).isVisible(),
    '返回保留查询并更新列表标题',
  )
  ensure(
    (await page.locator('.formula-list-card').textContent()).includes('微积分'),
    '返回列表分类同步',
  )
  ensure(
    await page.getByRole('button', { name: '取消收藏账号返回新名', exact: true }).isVisible(),
    '返回列表收藏保持',
  )
  await open('error')
  await page.getByRole('button', { name: '重新加载', exact: true }).waitFor()
  await page.screenshot({ path: shots + '读取失败390.png', fullPage: true })
  await mode('slow')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.getByRole('status').filter({ hasText: '正在读取公式' }).waitFor()
  await page.screenshot({ path: shots + '加载中390.png', fullPage: true })
  await page.locator('.formula-detail').waitFor()
  ensure(true, '详情失败真正重试')
  await open('notfound')
  ensure(
    await page.getByRole('heading', { name: '未找到这条公式', exact: true }).isVisible(),
    '404 与网络错误区分',
  )
  await page.screenshot({ path: shots + '未找到390.png', fullPage: true })
  await open('account', '/formulas/r6-formula?preview=tools')
  await mode('session-error')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByRole('heading', { name: '暂时无法确认账号', exact: true }).waitFor()
  ensure(!(await page.locator('.formula-detail').count()), 'Session 失败不展示私有快照')
  await mode('account')
  await page.getByRole('button', { name: '重新连接账号', exact: true }).click()
  await page.locator('.formula-detail').waitFor()
  ensure(true, 'Session 失败可独立重试')
  await mode('other')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByRole('heading', { name: '未找到这条公式', exact: true }).waitFor()
  ensure(!(await page.locator('.formula-detail').count()), '账号切换隐藏旧私有数据')
  await mode('logout')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByRole('heading', { name: '请登录后查看', exact: true }).waitFor()
  ensure(!(await page.locator('.formula-detail').count()), '退出后不显示私有数据或游客假成功')
  await open('account', '/formulas/invalid-id')
  ensure(
    await page.getByRole('heading', { name: '未找到这条公式', exact: true }).isVisible(),
    '非法账号 ID 不回退为游客',
  )
  await mode('')
  await page.goto(base + '/result/missing-local-formula?space=demo')
  await ready()
  ensure(
    await page.getByRole('heading', { name: '未找到这条公式', exact: true }).isVisible(),
    '缺失游客记录明确空态',
  )
  const mobilePassed = checks.length
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await open()
    await layout(width, '账号')
    await page.screenshot({ path: shots + '账号修改后' + width + '.png', fullPage: true })
    await mode('')
    await page.goto(base + '/result/integral?space=demo')
    await ready()
    await layout(width, '游客')
    await page.screenshot({ path: shots + 'guest修改后' + width + '.png', fullPage: true })
  }
  await open('account', '/formulas/r6-formula?width=workspace')
  await page.screenshot({ path: shots + '桌面workspace1440.png', fullPage: true })
  const workspace = await page
    .locator('.app-shell')
    .evaluate((e) => e.getBoundingClientRect().width)
  await open('account')
  const reading = await page.locator('.app-shell').evaluate((e) => e.getBoundingClientRect().width)
  ensure(workspace === 1080 && reading === 760, 'reading/workspace 对照宽度可验收')
  await page.screenshot({ path: shots + '桌面reading1440.png', fullPage: true })
  await ready()
  return { passed: checks.length, mobilePassed, checks }
}
