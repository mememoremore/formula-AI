async function checkChat(page) {
  const base = 'http://127.0.0.1:3200',
    id = '88888888-8888-4888-8888-888888888888',
    shots = 'docs/设计稿/R8聊天/',
    checks = []
  const runSuffix = Date.now().toString(36)
  const ensure = (value, name) => {
    if (!value) throw Error(name)
    checks.push(name)
  }
  await page.addInitScript(() => {
    window.__r8Errors = []
    window.__r8Sources = []
    for (const level of ['warn', 'error']) {
      const original = console[level]
      console[level] = (...args) => {
        if (/Hydration|Vue warn|Unhandled/i.test(String(args[0])))
          window.__r8Errors.push(String(args[0]))
        original.apply(console, args)
      }
    }
    window.addEventListener('error', (e) => window.__r8Errors.push(e.message))
    window.addEventListener('unhandledrejection', (e) => window.__r8Errors.push(String(e.reason)))
    const Native = window.EventSource
    window.EventSource = class extends Native {
      constructor(...args) {
        super(...args)
        window.__r8Sources.push(this)
      }
    }
    window.confirm = () => true
  })
  async function cookies(mode, run) {
    await page.evaluate(() => sessionStorage.removeItem('formula-ai:chat-pending:v1'))
    await page.context().addCookies([
      { name: 'r8-chat', value: mode, url: base },
      { name: 'r8-run', value: run + '-' + runSuffix, url: base },
    ])
  }
  async function mode(value) {
    await page.context().addCookies([{ name: 'r8-chat', value, url: base }])
  }
  async function open(path) {
    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('main')
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
  }
  async function debug(action) {
    return page.evaluate(
      async (action) =>
        await (
          await fetch(
            '/api/__r8debug',
            action
              ? {
                  method: 'POST',
                  headers: { 'content-type': 'application/json' },
                  body: JSON.stringify({ action }),
                }
              : {},
          )
        ).json(),
      action,
    )
  }
  async function readyChat() {
    await page.locator('.account-chat textarea').waitFor()
    await page.locator('.account-chat .chat-message').first().waitFor()
  }
  async function shape(name) {
    const value = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      composer: (() => {
        const r = document.querySelector('.chat-composer')?.getBoundingClientRect()
        return !r || (r.left >= 0 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1)
      })(),
      bad: [...document.querySelectorAll('button,a.button')]
        .filter(
          (e) =>
            e.getBoundingClientRect().height > 0 &&
            !e.disabled &&
            e.getBoundingClientRect().height < 43,
        )
        .map((e) => e.textContent),
    }))
    ensure(!value.overflow, name + '无整页横溢')
    ensure(value.composer, name + '输入区在视口内')
    ensure(!value.bad.length, name + '操作触控至少44px')
    ensure(!(await page.evaluate(() => window.__r8Errors)).length, name + '无脚本或水合异常')
  }
  let mobilePassed = 0
  for (const width of [320, 390, 430]) {
    await cookies('account', 'r8-layout-' + width)
    await page.setViewportSize({ width, height: 850 })
    await open('/ai')
    await page.getByRole('link', { name: '新对话', exact: true }).waitFor()
    await shape('列表' + width)
    await page.screenshot({ path: shots + '会话修改后' + width + '.png', fullPage: true })
    await open('/ai/new')
    await page.getByRole('heading', { name: '把公式，一步步读懂' }).waitFor()
    await shape('新建' + width)
    ensure((await debug()).creates.length === 0, '进入新建不创建会话' + width)
    await page.screenshot({ path: shots + '新建修改后' + width + '.png', fullPage: true })
    await open('/ai/' + id)
    await readyChat()
    await shape('聊天' + width)
    ensure((await page.locator('pre code').count()) === 1, '代码独立展示' + width)
    ensure((await page.locator('.message-content script').count()) === 0, '模型HTML不执行' + width)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: shots + '聊天修改后' + width + '.png', fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 850 })
  await cookies('account', 'r8-search')
  await open('/ai')
  await page.getByRole('button', { name: '加载更多', exact: true }).click()
  await page.getByRole('heading', { name: '另一段公式思考' }).waitFor()
  ensure((await page.locator('.conversation-item').count()) === 2, '会话分页去重追加')
  await page.getByRole('searchbox').fill('不存在')
  await page.getByRole('button', { name: '搜索对话', exact: true }).click()
  await page.getByText('没有找到匹配的对话', { exact: true }).waitFor()
  ensure((await page.locator('.conversation-item').count()) === 0, '搜索空结果不混旧分页')
  await open('/ai?q=配方')
  await page.getByRole('heading', { name: '读懂一元二次方程' }).click()
  await readyChat()
  await page.goBack()
  await page.getByRole('heading', { name: '读懂一元二次方程' }).waitFor()
  ensure((await page.evaluate(() => location.search)).includes('q='), '详情返回恢复URL搜索')
  await page.getByRole('searchbox').fill('慢')
  await page.getByRole('button', { name: '搜索对话', exact: true }).click()
  await page.waitForFunction(() => decodeURIComponent(location.search).includes('慢'))
  await page.getByRole('searchbox').fill('不存在')
  await page.getByRole('button', { name: '搜索对话', exact: true }).click()
  await page.getByText('没有找到匹配的对话', { exact: true }).waitFor()
  await page.waitForTimeout(850)
  ensure((await page.locator('.conversation-item').count()) === 0, '慢搜索不覆盖新关键词')
  await mode('list-error')
  await open('/ai')
  await page.getByText('对话记录暂时无法读取。').waitFor()
  await mode('account')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await page.getByRole('heading', { name: '读懂一元二次方程' }).waitFor()
  ensure(true, '列表失败可重试')
  await cookies('empty', 'r8-empty')
  await open('/ai')
  await page.getByText('开始第一段思考', { exact: true }).waitFor()
  await page.screenshot({ path: shots + '会话空390.png', fullPage: true })
  ensure(true, '空会话列表')
  await cookies('account', 'r8-picker')
  await open('/ai/new')
  await page.getByRole('button', { name: '选择库中公式' }).click()
  await page.getByRole('button', { name: '加载更多公式' }).click()
  await page.getByText('积分公式', { exact: true }).waitFor()
  ensure((await page.locator('.context-option').count()) === 2, '公式选择器后续分页可选')
  await page.screenshot({ path: shots + '公式选择390.png', fullPage: true })
  await page.getByRole('button', { name: '一元二次方程' }).click()
  await page.getByText('一元二次方程 · v1', { exact: true }).waitFor()
  ensure(true, '选择绑定现有固定版本')
  await page.getByRole('textbox').fill('中文输入中的问题')
  await page.getByRole('textbox').dispatchEvent('compositionstart')
  await page.getByRole('textbox').press('Enter')
  ensure((await debug()).creates.length === 0, 'IME组合输入Enter不发送')
  await page.getByRole('textbox').dispatchEvent('compositionend')
  await page.getByRole('textbox').press('Shift+Enter')
  ensure((await debug()).creates.length === 0, 'Shift Enter只换行')
  await page.getByRole('textbox').fill('多行\n问题\n第三行\n第四行\n第五行\n第六行')
  await shape('多行输入')
  await page.screenshot({ path: shots + '多行输入390.png', fullPage: true })
  await page.getByRole('textbox').fill('首次发送测试')
  await page.getByRole('button', { name: '发送提问' }).evaluate((e) => {
    e.click()
    e.click()
  })
  await page.waitForURL('**/ai/' + id)
  await readyChat()
  const first = await debug()
  ensure(first.creates.length === 1 && first.sends.length === 1, '首次快速双击仅创建并发送一次')
  await cookies('create-lost', 'r8-create-lost')
  await open('/ai/new')
  await page.getByRole('textbox').fill('创建响应不确定')
  await page.getByRole('button', { name: '发送提问' }).click()
  await page.getByRole('button', { name: '确认原提问' }).waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.getByRole('button', { name: '确认原提问' }).waitFor()
  await page.getByRole('button', { name: '确认原提问' }).click()
  await page.waitForURL('**/ai/' + id)
  let lost = await debug()
  ensure(
    lost.creates.length === 2 && new Set(lost.creates).size === 1,
    '创建响应未知刷新后沿用原键',
  )
  ensure(lost.sends.length === 1, '创建恢复只发一次首问')
  await cookies('send-lost', 'r8-send-lost')
  await open('/ai/' + id)
  await readyChat()
  await page.getByRole('textbox').fill('原问题不能变')
  await page.getByRole('button', { name: '发送提问' }).click()
  await page.getByRole('button', { name: '确认原提问' }).waitFor()
  ensure((await page.getByRole('textbox').getAttribute('readonly')) !== null, '未确认提问禁止改写')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.getByRole('button', { name: '确认原提问' }).waitFor()
  await page.screenshot({ path: shots + '发送未确认390.png', fullPage: true })
  await page.getByRole('button', { name: '确认原提问' }).click()
  await page.waitForTimeout(650)
  lost = await debug()
  ensure(
    lost.sends.length === 2 && new Set(lost.sends.map((s) => s.key)).size === 1,
    '普通发送刷新重试沿用原键',
  )
  ensure(
    lost.value.messages.filter((m) => m.role === 'USER').length === 2,
    '重试不重复追加用户消息',
  )
  await cookies('account', 'r8-stream')
  await open('/ai/' + id)
  await readyChat()
  await debug('queued')
  await page
    .getByRole('button', { name: '重新连接', exact: true })
    .count()
    .then(async (n) => {
      if (n) await page.getByRole('button', { name: '重新连接', exact: true }).click()
      else await page.reload({ waitUntil: 'domcontentloaded' })
    })
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor()
  await page.screenshot({ path: shots + '排队390.png', fullPage: true })
  await debug('partial')
  await page.locator('.streaming').waitFor()
  await page.screenshot({ path: shots + '生成中390.png', fullPage: true })
  ensure((await debug()).streams > 0, '真实EventSource收到HTTP快照')
  const queued = await debug()
  queued.value.currentTurn.status = 'QUEUED'
  queued.value.currentTurn.partialContent = ''
  queued.value.currentTurn.attemptCount = 0
  await page.evaluate((snapshot) => {
    const source = window.__r8Sources.at(-1)
    source.dispatchEvent(new MessageEvent('snapshot', { data: JSON.stringify(snapshot) }))
  }, queued.value)
  ensure((await page.locator('.streaming').count()) === 1, '较旧SSE不回退新尝试片段')
  await page.getByRole('button', { name: '停止生成', exact: true }).evaluate((e) => {
    e.click()
    e.click()
  })
  await page
    .getByText('已停止生成。 已生成的内容会保留；重新发送会使用一次额度。', { exact: false })
    .waitFor()
  ensure((await debug()).stops === 1, '连续停止只发一个请求')
  await page.screenshot({ path: shots + '已停止390.png', fullPage: true })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await readyChat()
  ensure(
    (await page.getByRole('button', { name: '停止生成', exact: true }).count()) === 0,
    '刷新保留停止结果',
  )
  await cookies('offline', 'r8-offline')
  await open('/ai/' + id)
  await readyChat()
  await debug('partial')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor()
  await page
    .getByText('实时连接暂不可用，已改用状态查询。可以手动重新连接。', { exact: true })
    .waitFor({ timeout: 15000 })
  let offline = await debug()
  ensure(offline.streams >= 3 && offline.reads >= 2, 'SSE有限重连后GET回退')
  ensure(offline.sends.length === 0, '重连不触发生成')
  await page.screenshot({ path: shots + '断线回退390.png', fullPage: true })
  await mode('account')
  await debug('complete')
  await page.waitForFunction(() => !document.querySelector('[aria-label="停止生成"]'), {
    timeout: 12000,
  })
  ensure(true, '轮询读到断线期间的完成结果')
  await cookies('stop-error', 'r8-stop-error')
  await open('/ai/' + id)
  await readyChat()
  await debug('partial')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await page.getByText('暂时无法确认停止结果，请重新读取对话。', { exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '停止生成', exact: true }).isEnabled(),
    '停止失败不冒充已取消',
  )
  await mode('account')
  await debug('failed')
  await page.getByText('受控模型失败', { exact: false }).waitFor()
  await page.screenshot({ path: shots + '失败片段390.png', fullPage: true })
  ensure(
    (await page.getByText('部分内容保留；回答未完成。', { exact: true }).count()) === 1,
    '失败回答部分内容保留',
  )
  await cookies('account', 'r8-long')
  await open('/ai/' + id)
  await readyChat()
  await debug('long')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await readyChat()
  await shape('长会话长公式')
  ensure(
    await page
      .locator('.math-formula')
      .evaluateAll((els) => els.some((e) => e.scrollWidth > e.clientWidth + 10)),
    '长公式独立横向滚动',
  )
  await page.evaluate(() => scrollTo(0, 0))
  await page.waitForTimeout(200)
  await page.getByRole('button', { name: '回到最新内容 ↓' }).waitFor()
  const top = await page.evaluate(() => scrollY)
  await page.waitForTimeout(450)
  ensure((await page.evaluate(() => scrollY)) === top, '上翻阅读不强制到底')
  await page.getByRole('button', { name: '回到最新内容 ↓' }).click()
  ensure((await page.evaluate(() => scrollY)) > top, '回到最新按钮可用')
  await page.screenshot({ path: shots + '长会话390.png', fullPage: true })
  await cookies('account', 'r8-owner')
  await open('/ai/' + id + '?preview=tools')
  await readyChat()
  await mode('other')
  await page.getByRole('button', { name: '刷新测试身份' }).click()
  await page.getByText('对话不存在或当前账号无法访问，请返回会话列表。', { exact: true }).waitFor()
  ensure((await page.locator('.chat-message').count()) === 0, '切换账号不显示旧私有内容')
  await page.screenshot({ path: shots + '无权限390.png', fullPage: true })
  await mode('logout')
  await page.getByRole('button', { name: '刷新测试身份' }).click()
  await page.getByRole('link', { name: '登录查看对话' }).waitFor()
  ensure((await page.locator('.account-chat').count()) === 0, '退出隐藏私有对话')
  await cookies('network', 'r8-network')
  await open('/ai/' + id)
  await page.getByRole('button', { name: '重新连接', exact: true }).waitFor()
  await mode('account')
  await page.getByRole('button', { name: '重新连接', exact: true }).click()
  await readyChat()
  ensure(true, 'GET网络失败可恢复')
  await cookies('guest', 'r8-guest')
  await open('/ai')
  await page.getByRole('link', { name: '打开本机演示对话' }).click()
  await page.getByRole('textbox').fill('演示问题')
  await page.getByRole('button', { name: '发送提问' }).click()
  await page.locator('.demo-chat pre').waitFor()
  await page.screenshot({ path: shots + '游客对话390.png', fullPage: true })
  ensure(
    (await debug()).creates.length === 0 && (await debug()).sends.length === 0,
    '游客不调用账号创建或发送',
  )
  await page.getByRole('button', { name: '清空本机对话' }).click()
  await page.getByRole('heading', { name: '从一个问题开始' }).waitFor()
  ensure(true, '本机线程清空')
  await cookies('account', 'r8-late-get')
  await open('/ai/' + id)
  await readyChat()
  await debug('partial')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => window.__r8Sources?.length > 0)
  await page.locator('.streaming').waitFor()
  let releaseGet, markGet
  const getGate = new Promise((r) => (releaseGet = r)),
    getCaptured = new Promise((r) => (markGet = r))
  await page.route(base + '/api/account/conversations/' + id, async (route) => {
    const response = await route.fetch()
    markGet()
    await getGate
    await route.fulfill({ response })
  })
  await page.evaluate(() => window.__r8Sources.at(-1).dispatchEvent(new Event('error')))
  await page.getByRole('button', { name: '重新连接实时更新' }).click()
  await getCaptured
  await debug('advanced')
  await page.locator('.streaming').filter({ hasText: '这是后续保存的解释内容。' }).waitFor()
  releaseGet()
  await page.waitForTimeout(400)
  ensure(
    (await page.locator('.streaming').textContent()).includes('这是后续保存的解释内容。'),
    '真实HTTP旧GET不能覆盖后到SSE',
  )
  await page.unroute(base + '/api/account/conversations/' + id)
  let releaseStop, markStop
  const stopGate = new Promise((r) => (releaseStop = r)),
    stopCaptured = new Promise((r) => (markStop = r))
  await page.route('**/turns/*/cancel', async (route) => {
    const response = await route.fetch()
    markStop()
    await stopGate
    await route.fulfill({ response })
  })
  await page.getByRole('button', { name: '停止生成', exact: true }).click()
  await stopCaptured
  await debug('next-turn')
  await page.getByText('其他窗口的新问题', { exact: true }).waitFor()
  releaseStop()
  await page.waitForTimeout(400)
  ensure(
    (await page.getByRole('button', { name: '停止生成', exact: true }).count()) === 1,
    '迟到旧停止响应不关闭新轮次',
  )
  ensure((await debug()).stops === 1, '交错恢复没有额外停止或提交')
  await page.unroute('**/turns/*/cancel')
  await cookies('account', 'r8-late-create')
  await open('/ai/new')
  let releaseCreate, markCreate
  const createGate = new Promise((r) => (releaseCreate = r)),
    createCaptured = new Promise((r) => (markCreate = r))
  await page.route(base + '/api/account/conversations', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.continue()
      return
    }
    const response = await route.fetch()
    markCreate()
    await createGate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByRole('textbox').fill('离页之后不导航')
  await page.getByRole('button', { name: '发送提问' }).click()
  await createCaptured
  await page.getByRole('link', { name: '返回上一页' }).click()
  await page.waitForURL('**/ai')
  releaseCreate()
  await page.waitForTimeout(600)
  ensure((await page.evaluate(() => location.pathname)) === '/ai', '离页后旧创建回调不导航')
  await page.unroute(base + '/api/account/conversations')
  await open('/ai/new')
  await page.getByRole('button', { name: '确认原提问' }).click()
  await page.waitForURL('**/ai/' + id)
  const lateCreate = await debug()
  ensure(new Set(lateCreate.creates).size === 1, '离页恢复仍复用原会话请求键')

  await cookies('account', 'r8-corrupt')
  await page.evaluate(() => sessionStorage.setItem('formula-ai:chat-pending:v1', '{broken'))
  await open('/ai/new')
  await page
    .getByText('待确认请求无法恢复，已暂停发送。请先核对账号会话记录，检查会话存储后重新加载。', {
      exact: true,
    })
    .waitFor()
  ensure(
    await page.getByRole('button', { name: '发送提问' }).isDisabled(),
    '损坏恢复信息阻止盲目新建',
  )
  ensure((await debug()).creates.length === 0, '损坏存储零创建请求')
  await cookies('account', 'r8-storage-denied')
  await open('/ai/new')
  await page.evaluate(() => {
    window.__r8Set = Storage.prototype.setItem
    Storage.prototype.setItem = function () {
      throw new Error('受控存储拒绝')
    }
  })
  await page.getByRole('textbox').fill('存储拒绝时不发请求')
  await page.getByRole('button', { name: '发送提问' }).click()
  await page
    .getByText('无法保存待确认请求，请允许会话存储后重试；不要重复创建对话。', { exact: true })
    .waitFor()
  ensure(
    (await debug()).creates.length === 0 && (await debug()).sends.length === 0,
    '存储不可用时在创建与发送之前阻断',
  )
  await page.screenshot({ path: shots + '存储拒绝390.png', fullPage: true })
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__r8Set
  })
  await page.getByRole('button', { name: '确认原提问' }).click()
  await page.waitForURL('**/ai/' + id)
  ensure((await debug()).creates.length === 1, '恢复存储后确认原请求')
  await page.getByRole('textbox').fill('多行\n输入\n测试')
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', { configurable: true, get: () => 500 })
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await page.waitForTimeout(100)
  ensure(
    await page.locator('.chat-composer').evaluate((el) => el.getBoundingClientRect().bottom <= 500),
    '模拟视口缩小输入框上移',
  )
  await page.screenshot({ path: shots + '视口缩小模拟390.png', fullPage: true })
  await page.evaluate(() => {
    delete window.visualViewport.height
    window.visualViewport.dispatchEvent(new Event('resize'))
  })
  await page.getByRole('textbox').fill('')

  mobilePassed = checks.length
  for (const width of [768, 1024, 1440]) {
    await cookies('account', 'r8-layout-' + width)
    await page.setViewportSize({ width, height: 850 })
    await open('/ai')
    await page.getByRole('link', { name: '新对话', exact: true }).waitFor()
    await shape('列表' + width)
    await page.screenshot({ path: shots + '会话修改后' + width + '.png', fullPage: true })
    await open('/ai/new')
    await page.getByRole('heading', { name: '把公式，一步步读懂' }).waitFor()
    await shape('新建' + width)
    ensure((await debug()).creates.length === 0, '进入新建不创建会话' + width)
    await page.screenshot({ path: shots + '新建修改后' + width + '.png', fullPage: true })
    await open('/ai/' + id)
    await readyChat()
    await shape('聊天' + width)
    ensure((await page.locator('pre code').count()) === 1, '代码独立展示' + width)
    ensure((await page.locator('.message-content script').count()) === 0, '模型HTML不执行' + width)
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: shots + '聊天修改后' + width + '.png', fullPage: true })
  }
  return { passed: checks.length, mobilePassed, checks }
}
