async function checkLibrary(page) {
  const base = 'http://127.0.0.1:3200'
  const shots = 'docs/设计稿/R5公式库/'
  const algebra = '11111111-1111-4111-8111-111111111111'
  const calculus = '22222222-2222-4222-8222-222222222222'
  const checks = []
  await page.addInitScript(() => {
    window.__r5Diagnostics = []
    for (const level of ['warn', 'error']) {
      const original = console[level].bind(console)
      console[level] = (...args) => {
        const message = args.filter((arg) => typeof arg === 'string').join(' ')
        if (/Hydration|\[Vue warn\]|NUXT_E\d+/.test(message)) window.__r5Diagnostics.push(message)
        original(...args)
      }
    }
    window.addEventListener('error', (event) => {
      if (event.message) window.__r5Diagnostics.push(event.message)
    })
    window.addEventListener('unhandledrejection', (event) =>
      window.__r5Diagnostics.push(String(event.reason)),
    )
  })
  async function diagnostics() {
    const errors = await page.evaluate(() => window.__r5Diagnostics ?? [])
    if (errors.length) throw new Error('页面脚本或水合诊断: ' + errors[0])
  }
  const ensure = (ok, name) => {
    if (!ok) throw new Error(name)
    checks.push(name)
  }
  let sequence = 0
  async function mode(value, fresh = false) {
    const cookies = [{ name: 'r5-library', value, url: base }]
    if (fresh)
      cookies.push({ name: 'r5-run', value: 'r5-' + Date.now() + '-' + ++sequence, url: base })
    await page.context().addCookies(cookies)
  }
  async function ready() {
    await page.getByRole('heading', { name: '我的公式库', exact: true }).waitFor()
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      await document.fonts.ready
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))
    })
    await diagnostics()
  }
  async function open(value, query = '', fresh = false, path = '/library') {
    await diagnostics()
    await mode(value, fresh)
    await page.goto(base + path + (query ? '?' + query : ''))
    await ready()
  }
  async function rows(n) {
    await page
      .locator('.formula-list-card')
      .nth(n - 1)
      .waitFor()
    await page.locator('.formula-list-card').nth(n).waitFor({ state: 'hidden' })
  }
  async function layout(width) {
    const m = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      frame: document.querySelector('.app-shell').getBoundingClientRect().width,
      nav: document.querySelector('.bottom-nav').getBoundingClientRect().toJSON(),
      art: document.querySelector('.library-hero img').getBoundingClientRect().toJSON(),
      cols: getComputedStyle(
        document.querySelector('.library-grid') ?? document.querySelector('main'),
      ).gridTemplateColumns,
      images: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      targets: [
        ...document.querySelectorAll(
          '.library-views a,.favorite-button,.category-filters button,.chip-list button,.library-search button',
        ),
      ].every((el) => el.getBoundingClientRect().height >= 44),
    }))
    ensure(m.scroll === width, `${width}: 无整页横向溢出`)
    ensure(m.art.right <= width && m.art.left >= 0, `${width}: 插画不越界`)
    ensure(m.images, `${width}: 素材实际加载`)
    ensure(m.targets, `${width}: 筛选收藏搜索触控高度至少44px`)
    ensure(
      Math.abs(m.nav.bottom - 900) < 1 && m.nav.width === m.frame,
      `${width}: 固定导航与容器宽度一致`,
    )
    if (width <= 430) ensure(!m.cols.includes(' '), `${width}: 手机保持单列`)
    return m
  }
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await open('guest', 'space=demo')
  // 只重置本脚本创建的独立浏览器上下文，不涉及用户日常浏览器或账号资源。
  await page.evaluate(() => localStorage.removeItem('formula-ai:demo:v1'))
  await page.reload()
  await ready()
  // 手机先完成游客和受控账号，再进入业务状态和桌面阶段。
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 })
    await open('guest', 'space=demo')
    await layout(width)
    await page.screenshot({ path: shots + '游客修改后' + width + '.png', fullPage: true })
    await open('account', 'space=account', true)
    await rows(2)
    await layout(width)
    ensure(
      await page
        .locator('.card-latex')
        .first()
        .evaluate((el) => el.scrollWidth > el.clientWidth),
      `${width}: 长公式独立滚动`,
    )
    await page.screenshot({ path: shots + '账号修改后' + width + '.png', fullPage: true })
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
    const more = await page.getByRole('button', { name: '加载更多', exact: true }).boundingBox()
    const nav = await page.locator('.bottom-nav').boundingBox()
    ensure(more.y + more.height <= nav.y, `${width}: 加载更多不被导航遮挡`)
  }
  await page.setViewportSize({ width: 390, height: 900 })
  await open('guest', 'space=demo')
  await page.getByRole('searchbox').fill('定积分')
  await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === '定积分')
  ensure((await page.locator('.formula-list-card').count()) === 1, '游客搜索有结果')
  await page.getByRole('searchbox').fill('no-such-formula')
  await page.getByText('没有找到匹配的公式', { exact: true }).waitFor()
  ensure((await page.locator('.formula-list-card').count()) === 0, '游客无结果区分空态')
  await page.getByRole('searchbox').fill('')
  await page.getByRole('link', { name: '最近识别', exact: true }).click()
  await page.getByText('还没有演示识别记录', { exact: true }).waitFor()
  ensure((await page.locator('.formula-list-card').count()) === 0, '游客最近识别不冒充预置样例')
  await page.getByRole('link', { name: '全部', exact: true }).click()
  await page.getByRole('button', { name: '新建分类' }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('本机学习')
  await page.getByRole('button', { name: '创建分类', exact: true }).click()
  await page.getByRole('button', { name: '本机学习', exact: true }).waitFor()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ensure((await page.locator('dialog[open]').count()) === 0, '游客新建分类保留且弹窗关闭')

  await open('duplicates', 'space=account', true)
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await rows(4)
  ensure((await page.locator('.formula-list-card').count()) === 4, '追加去除同页重复')
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await rows(5)
  ensure(
    (await page.getByRole('button', { name: '加载更多', exact: true }).count()) === 0,
    '分页终点清楚',
  )
  await page.locator('.formula-card-body').first().click()
  await page.getByRole('heading', { name: '公式详情', exact: true }).waitFor()
  await page.getByRole('link', { name: '返回上一页' }).click()
  await ready()
  await rows(5)
  ensure(
    await page.evaluate(() => new URLSearchParams(location.search).get('space') === 'account'),
    '详情返回保留空间与已加载窗口',
  )
  await page.goForward()
  await page.getByRole('heading', { name: '公式详情', exact: true }).waitFor()
  await page.goBack()
  await ready()
  await rows(5)
  ensure((await page.locator('.formula-list-card').count()) === 5, '浏览器前进后退保留列表窗口')

  await open('account', 'space=account', true)
  await page.getByRole('searchbox').fill('公式2')
  await page.getByRole('button', { name: '搜索公式', exact: true }).click()
  await rows(1)
  ensure(
    (await page.locator('.formula-card-body h3').innerText()) === '公式2：记录与理解',
    '账号关键词匹配',
  )
  await page.reload()
  await ready()
  await rows(1)
  ensure((await page.getByRole('searchbox').inputValue()) === '公式2', '刷新保留 URL 搜索')
  await page.getByRole('searchbox').fill('not-found')
  await page.getByRole('button', { name: '搜索公式', exact: true }).click()
  await page.getByText('没有找到匹配的公式', { exact: true }).waitFor()
  await page.goBack()
  await ready()
  await rows(1)
  ensure((await page.getByRole('searchbox').inputValue()) === '公式2', '后退恢复关键词和结果')
  await page.getByRole('searchbox').fill('slow')
  await page.getByRole('button', { name: '搜索公式', exact: true }).click()
  await page.waitForFunction(() => new URLSearchParams(location.search).get('q') === 'slow')
  await page.getByRole('searchbox').fill('公式1')
  await page.getByRole('button', { name: '搜索公式', exact: true }).click()
  await rows(1)
  await page.waitForLoadState('networkidle')
  ensure(
    (await page.locator('.formula-card-body h3').innerText()) === '公式1：记录与理解',
    '慢搜索结果不能覆盖新关键词',
  )

  await page.getByRole('searchbox').evaluate((element) => {
    window.__librarySearch = element
  })
  for (const name of ['收藏', '最近识别', '全部']) {
    await page.getByRole('link', { name, exact: true }).click()
    ensure(
      await page.getByRole('searchbox').evaluate((element) => element === window.__librarySearch),
      name + '切换时保留搜索框',
    )
    ensure((await page.getByRole('searchbox').inputValue()) === '公式1', name + '切换时保留搜索词')
  }
  await open('more-slow', 'space=account', true)
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.getByRole('button', { name: '正在加载…', exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '正在加载…', exact: true }).isDisabled(),
    '追加加载期间禁止重复提交',
  )
  await page.screenshot({ path: shots + '加载更多390.png' })
  await page.getByRole('button', { name: /^代数/ }).click()
  await page.waitForFunction(
    () =>
      new URLSearchParams(location.search).get('category') ===
      '11111111-1111-4111-8111-111111111111',
  )
  await rows(2)
  await page.waitForLoadState('networkidle')
  ensure(
    await page
      .locator('.category-tag')
      .evaluateAll((els) => els.every((el) => el.textContent.includes('代数'))),
    '追加期间切分类，旧页不能混入',
  )

  await open('more-error', 'space=account', true)
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '加载失败' }).waitFor()
  ensure((await page.locator('.formula-list-card').count()) === 2, '追加失败保留已有公式')
  await mode('account')
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await rows(4)
  ensure((await page.locator('.formula-list-card').count()) === 4, '追加重试不重复上一页')
  await open('more-slow', 'space=account', true)
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.getByRole('button', { name: '取消收藏公式1：记录与理解', exact: true }).click()
  await page.getByRole('button', { name: '收藏公式1：记录与理解', exact: true }).waitFor()
  await page.waitForLoadState('networkidle')
  ensure((await page.locator('.formula-list-card').count()) === 2, '收藏提交使旧追加请求失效')
  await mode('account')
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await rows(4)
  ensure(
    (await page
      .getByRole('button', { name: '收藏公式1：记录与理解', exact: true })
      .getAttribute('aria-pressed')) === 'false',
    '重新追加不会覆盖刚提交的收藏状态',
  )
  await open('error', 'space=account', true)
  await page.getByText('暂时无法读取公式，请重试或重新选择分类。', { exact: true }).waitFor()
  await page.screenshot({ path: shots + '列表失败390.png', fullPage: true })
  await mode('account')
  const [retried] = await Promise.all([
    page.waitForResponse('**/api/account/library*'),
    page.getByRole('button', { name: '重新加载', exact: true }).click(),
  ])
  await rows(2)
  ensure((await retried.status()) === 200, '手动重试真正发起请求，不命中初始缓存')
  await open('category-error', 'space=account&category=' + algebra, true)
  await page.getByText('分类暂时无法读取。', { exact: true }).waitFor()
  await rows(2)
  ensure((await page.locator('.formula-list-card').count()) === 2, '分类请求失败不隐藏成功公式')
  await mode('account')
  await page.getByRole('button', { name: '重新加载分类', exact: true }).click()
  await page.getByRole('button', { name: /^代数/ }).waitFor()
  ensure(
    await page.evaluate(
      () =>
        new URLSearchParams(location.search).get('category') ===
        '11111111-1111-4111-8111-111111111111',
    ),
    '分类重试保留 URL 选择',
  )
  await open('empty', 'space=account', true)
  await page.getByText('从第一条公式开始', { exact: true }).waitFor()
  await page.screenshot({ path: shots + '账号空态390.png', fullPage: true })
  ensure((await page.getByRole('alert').count()) === 0, '空列表不伪装成请求失败')

  await open('account', 'space=account', true)
  await page.getByRole('link', { name: '收藏', exact: true }).click()
  await page.waitForFunction(() => new URLSearchParams(location.search).get('view') === 'favorites')
  await rows(2)
  ensure(
    await page.evaluate(() => new URLSearchParams(location.search).get('view') === 'favorites'),
    '收藏视图写入 URL',
  )
  await page.getByRole('button', { name: '取消收藏公式1：记录与理解', exact: true }).click()
  await rows(1)
  ensure(
    (await page.locator('.formula-card-body h3').innerText()) === '公式3：记录与理解',
    '取消收藏后从当前视图移除',
  )
  await page.getByRole('button', { name: '取消收藏公式3：记录与理解', exact: true }).click()
  await page.getByText('当前页已整理完成', { exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '加载更多', exact: true }).isEnabled(),
    '移除当前页全部收藏后仍可继续加载',
  )
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await rows(1)
  ensure(
    (await page.locator('.formula-card-body h3').innerText()) === '公式5：记录与理解',
    '空窗口追加后续收藏不误报整个收藏为空',
  )
  await page.getByRole('link', { name: '全部', exact: true }).click()
  await rows(2)
  ensure(
    (await page
      .getByRole('button', { name: '收藏公式1：记录与理解', exact: true })
      .getAttribute('aria-pressed')) === 'false',
    '全部视图读取最新收藏状态',
  )
  await page.locator('.formula-card-body').first().click()
  await page.getByRole('heading', { name: '公式详情', exact: true }).waitFor()
  ensure(
    (await page.locator('.favorite-button').getAttribute('aria-pressed')) === 'false',
    '详情入口收藏状态一致',
  )
  await page.getByRole('link', { name: '返回上一页' }).click()
  await ready()
  await page.getByRole('button', { name: '收藏公式1：记录与理解', exact: true }).click()
  await page.getByRole('button', { name: '取消收藏公式1：记录与理解', exact: true }).waitFor()
  ensure(
    (await page
      .getByRole('button', { name: '取消收藏公式1：记录与理解', exact: true })
      .getAttribute('aria-pressed')) === 'true',
    '恢复收藏并保留原有按钮反馈',
  )

  await page.getByRole('button', { name: '管理分类', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('测试分类')
  await page.getByRole('button', { name: '创建分类', exact: true }).click()
  await page.getByRole('dialog').getByText('测试分类', { exact: true }).waitFor()
  await page.getByRole('button', { name: '重命名测试分类', exact: true }).click()
  await page.getByRole('dialog').getByRole('textbox').fill('重命名分类')
  await page.getByRole('button', { name: '保存名称', exact: true }).click()
  await page.getByRole('dialog').getByText('重命名分类', { exact: true }).waitFor()
  await page.screenshot({ path: shots + '分类弹窗390.png' })
  ensure(
    await page.evaluate(() => document.elementFromPoint(195, 870).tagName === 'DIALOG'),
    '分类弹窗在导航上方',
  )
  await page.getByRole('button', { name: '删除重命名分类', exact: true }).click()
  await page.getByRole('button', { name: '确认删除分类', exact: true }).click()
  await page
    .getByRole('dialog')
    .getByText('重命名分类', { exact: true })
    .waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await page.locator('.category-tag').first().click()
  await page.getByRole('dialog').getByText('微积分', { exact: true }).click()
  await page.getByRole('button', { name: '保存分类', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  await page.waitForFunction(() =>
    document.querySelector('.category-tag')?.textContent.includes('微积分'),
  )
  ensure(
    (await page.locator('.category-tag').first().innerText()).includes('微积分'),
    '分类新建、重命名、删除和归类原有入口均可用',
  )

  await open('account', 'space=account&view=recent', true)
  ensure((await page.locator('.history-item').count()) === 2, '识别历史第一页显示')
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.waitForFunction(() => document.querySelectorAll('.history-item').length === 4)
  ensure(await page.getByText('识别中', { exact: true }).isVisible(), '第二页活动任务可见')
  await mode('history-finish')
  await page.getByText('新增识别记录', { exact: true }).waitFor()
  await page.waitForFunction(
    () => !document.querySelector('.history-item')?.parentElement.textContent.includes('识别中'),
  )
  ensure(
    (await page.locator('.history-item').count()) === 5,
    '后页活动任务完成，轮询保留窗口并纳入新记录',
  )
  ensure(await page.getByText('识别记录4', { exact: true }).isVisible(), '刷新没有丢掉已加载尾项')
  await page.screenshot({ path: shots + '历史更新390.png', fullPage: true })
  await mode('history-error')
  await page.getByRole('button', { name: '刷新', exact: true }).click()
  await page.getByText('暂时无法读取识别记录。', { exact: true }).waitFor()
  ensure((await page.locator('.history-item').count()) === 5, '历史刷新失败仍保留成功窗口')
  await mode('history-finish')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.waitForFunction(() => !document.querySelector('[role=alert]'))
  ensure((await page.locator('.history-item').count()) === 5, '历史重试保留已加载记录且不重复')

  await open('account', 'space=account&preview=tools', true)
  await mode('other')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByText('从第一条公式开始', { exact: true }).waitFor()
  ensure((await page.locator('.formula-list-card').count()) === 0, '身份切换后不显示旧账号列表')
  ensure(
    (await page.getByRole('button', { name: /^代数/ }).count()) === 0,
    '身份切换后分类缓存隔离',
  )
  await open('guest', 'space=demo', false, '/favorites')
  await ready()
  ensure(
    await page.evaluate(
      () =>
        location.pathname === '/library' &&
        new URLSearchParams(location.search).get('view') === 'favorites',
    ),
    '旧收藏地址规范化',
  )
  const mobilePassed = checks.length

  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await open('account', 'space=account', true)
    await rows(2)
    const m = await layout(width)
    ensure(m.frame === Math.min(width, width < 900 ? 480 : 1080), `${width}: 仅公式库采用响应宽度`)
    ensure(
      width < 900 ? !m.cols.includes(' ') : m.cols.split(' ').length === 2,
      `${width}: 卡片列数符合阅读宽度`,
    )
    await page.screenshot({ path: shots + '桌面修改后' + width + '.png', fullPage: true })
  }
  await open('account', 'space=account&width=compact', true)
  await rows(2)
  ensure(
    (await page.locator('.app-shell').evaluate((el) => el.getBoundingClientRect().width)) === 480,
    '桌面 compact 对照保留',
  )
  await page.screenshot({ path: shots + '桌面紧凑对照1440.png', fullPage: true })
  await mode('guest')
  await diagnostics()
  return { passed: checks.length, mobilePassed, checks }
}
