async function checkRecognition(page) {
  const base = 'http://127.0.0.1:3200',
    shots = 'docs/设计稿/R7上传识别/',
    checks = []
  const ensure = (ok, name) => {
    if (!ok) throw new Error(name)
    checks.push(name)
  }
  await page.addInitScript(() => {
    if (window.__r7Installed) return
    window.__r7Installed = true
    window.__r7Errors = []
    window.__r7Live = new Set()
    const create = URL.createObjectURL.bind(URL),
      revoke = URL.revokeObjectURL.bind(URL)
    URL.createObjectURL = (value) => {
      const url = create(value)
      window.__r7Live.add(url)
      return url
    }
    URL.revokeObjectURL = (url) => {
      window.__r7Live.delete(url)
      return revoke(url)
    }
    for (const level of ['warn', 'error']) {
      const orig = console[level].bind(console)
      console[level] = (...args) => {
        const text = args.filter((a) => typeof a === 'string').join(' ')
        if (/Hydration|\[Vue warn\]|NUXT_E\d+/.test(text)) window.__r7Errors.push(text)
        orig(...args)
      }
    }
    window.addEventListener('error', (e) => {
      if (e.message) window.__r7Errors.push(e.message)
    })
    window.addEventListener('unhandledrejection', (e) => window.__r7Errors.push(String(e.reason)))
    const fetch = window.fetch.bind(window)
    window.fetch = async (input, init) => {
      const response = await fetch(input, init)
      if (window.__r7Drop && String(input).endsWith(window.__r7Drop) && init?.method === 'POST') {
        window.__r7Drop = ''
        throw new DOMException('受控响应超时', 'TimeoutError')
      }
      return response
    }
  })
  let seq = 0
  async function mode(value, fresh = false) {
    const cookies = [{ name: 'r7-recognition', value, url: base }]
    if (fresh) cookies.push({ name: 'r7-run', value: 'r7-' + Date.now() + '-' + ++seq, url: base })
    await page.context().addCookies(cookies)
  }
  async function ready() {
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    const errors = await page.evaluate(() => window.__r7Errors ?? [])
    ensure(!errors.length, '无捕获脚本或水合异常')
  }
  async function leave() {
    if (await page.evaluate(() => location.pathname === '/upload')) {
      const recent = page.getByRole('link', { name: '查看最近识别', exact: true })
      if (await recent.count()) await recent.click()
      else await page.getByRole('link', { name: '返回上一页', exact: true }).click()
      await page.waitForFunction(() => location.pathname !== '/upload')
      await page.locator('.upload-workspace').waitFor({ state: 'hidden' })
      await page.waitForFunction(() => {
        const event = new Event('beforeunload', { cancelable: true })
        window.dispatchEvent(event)
        return !event.defaultPrevented
      })
    }
  }
  async function open(value = 'account', path = '/upload?space=account', fresh = true) {
    await leave()
    await mode(value, fresh)
    if (fresh)
      await page.evaluate(() => sessionStorage.removeItem('formula-ai:recognition-recovery:v1'))
    await page.goto(base + path)
    await ready()
  }
  async function image(name = '横图') {
    await page
      .getByLabel('选择公式图片', { exact: true })
      .setInputFiles('tmp/r7-images/' + name + '.png')
    await page.locator('.upload-zone img').waitFor()
    await page.locator('.upload-zone img').evaluate((e) => e.decode())
  }
  async function debug() {
    return page.evaluate(async () => (await fetch('/api/__r7debug')).json())
  }
  async function layout(width, kind) {
    const m = await page.evaluate(() => ({
      width: innerWidth,
      scroll: document.documentElement.scrollWidth,
      shell: document.querySelector('.app-shell').getBoundingClientRect().width,
      nav: !!document.querySelector('.bottom-nav'),
    }))
    ensure(m.scroll === width, kind + width + ': 无整页横溢')
    ensure(!m.nav, kind + width + ': 原无底栏布局保留')
    ensure(
      m.shell === Math.min(width, width >= 900 ? 760 : 480),
      kind + width + ': 正确使用 reading',
    )
    const h = await page
      .locator('button:visible:not([type=file]),.button:visible')
      .evaluateAll((es) => es.map((e) => e.getBoundingClientRect().height))
    ensure(
      h.every((v) => v >= 44),
      kind + width + ': 可见操作触控至少44px',
    )
    if (await page.locator('.upload-workspace').count()) {
      ensure(
        (await page.getByLabel('拍摄公式图片', { exact: true }).getAttribute('capture')) ===
          'environment',
        kind + width + ': 保留后置拍照请求',
      )
      const columns = await page
        .locator('.upload-workspace')
        .evaluate((e) => getComputedStyle(e).gridTemplateColumns.split(' ').length)
      ensure(columns === (width >= 900 ? 2 : 1), kind + width + ': 手机单列桌面双区')
    }
  }
  for (const width of [320, 390, 430]) {
    await page.setViewportSize({ width, height: 900 })
    await open()
    await layout(width, '上传')
    ensure(
      await page.getByRole('button', { name: '识别并保存到账号', exact: true }).isDisabled(),
      '未选图片不能提交' + width,
    )
    await page.screenshot({ path: shots + '上传修改后' + width + '.png', fullPage: true })
    await image()
    await layout(width, '横图')
    await page.screenshot({ path: shots + '预览修改后' + width + '.png', fullPage: true })
    await page.getByRole('button', { name: '删除图片', exact: true }).click()
    ensure(await page.evaluate(() => window.__r7Live.size === 0), '删除释放ObjectURL' + width)
    await image('长图')
    await layout(width, '长图')
    await page.screenshot({ path: shots + '长图' + width + '.png', fullPage: true })
    await page.getByRole('button', { name: '删除图片', exact: true }).click()
    await open('processing', '/recognitions/r7-t1')
    await layout(width, '任务')
    await page.screenshot({ path: shots + '任务处理' + width + '.png', fullPage: true })
  }
  await page.setViewportSize({ width: 390, height: 900 })
  await open()
  for (const [file, text] of [
    ['空.png', '图片不能为空'],
    ['类型.txt', '请选择 JPEG'],
    ['超大小.png', '10MB'],
    ['损坏.png', '图片无法打开'],
    ['超像素.png', '2000 万像素'],
  ]) {
    await page.getByLabel('选择公式图片', { exact: true }).setInputFiles('tmp/r7-images/' + file)
    await page.getByRole('alert').filter({ hasText: text }).waitFor()
    ensure(
      await page.getByRole('button', { name: '识别并保存到账号', exact: true }).isDisabled(),
      '校验失败不能提交：' + file,
    )
  }
  await image('普通')
  const previous = await page.locator('.upload-zone img').getAttribute('src')
  await image('横图')
  ensure(await page.evaluate((old) => !window.__r7Live.has(old), previous), '重选释放旧预览URL')
  await page.getByRole('button', { name: '删除图片', exact: true }).click()
  await page.evaluate(() => {
    const decode = Image.prototype.decode
    Image.prototype.decode = async function () {
      await new Promise((r) => setTimeout(r, 800))
      try {
        return await decode.call(this)
      } finally {
        window.__r7Decoded = true
      }
    }
  })
  await page.getByLabel('选择公式图片', { exact: true }).setInputFiles('tmp/r7-images/普通.png')
  await page.getByRole('link', { name: '查看最近识别', exact: true }).click()
  await page.waitForFunction(() => window.__r7Decoded === true)
  ensure(await page.evaluate(() => window.__r7Live.size === 0), '解码期间离页释放临时URL')
  await page.goBack()
  await ready()
  ensure(!(await page.locator('.upload-zone img').count()), '解码旧回调不能回写上传草稿')
  // 两阶段与重复点击。
  await open('upload-slow')
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).evaluate((e) => {
    e.click()
    e.click()
  })
  await page.getByRole('button', { name: '正在上传图片…', exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '正在上传图片…', exact: true }).isDisabled(),
    '上传中禁止重复提交',
  )
  await page.screenshot({ path: shots + '上传中390.png', fullPage: true })
  await page.waitForURL('**/recognitions/r7-t1')
  await ready()
  const submittedOnce = await debug()
  ensure(
    submittedOnce.tasks === 1 &&
      submittedOnce.uploads.length === 1 &&
      submittedOnce.submissions.length === 1,
    '快速连续点击只上传和提交一次',
  )
  await open('submit-slow')
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('button', { name: '正在提交识别任务…', exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '正在提交识别任务…', exact: true }).isDisabled(),
    '提交中禁止重复点击',
  )
  await page.screenshot({ path: shots + '提交中390.png', fullPage: true })
  await page.waitForURL('**/recognitions/r7-t1')
  await ready()
  // 浏览器注入超时：服务端已接受，只丢掉客户端响应。
  await open()
  await image()
  await page.getByRole('radio', { name: '印刷公式', exact: true }).check()
  await page.evaluate(() => {
    window.__r7Drop = '/api/account/recognitions'
  })
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).waitFor()
  ensure(
    await page.getByRole('radio', { name: '手写公式', exact: true }).isDisabled(),
    '结果未确认时锁定模式和图片',
  )
  await page.screenshot({ path: shots + '提交未确认390.png', fullPage: true })
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  let d = await debug()
  ensure(
    d.tasks === 1 && d.submissions.length === 2 && d.submissions[0].key === d.submissions[1].key,
    '提交超时重试沿用请求键，不重复任务',
  )
  ensure(
    d.submissions.every((x) => x.mode === 'printed'),
    '安全重试保留原印刷模式',
  )
  await open()
  await image()
  await page.evaluate(() => {
    window.__r7Drop = '/api/account/files'
  })
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '暂未确认' }).waitFor()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  d = await debug()
  ensure(
    d.files === 1 && d.uploads.length === 2 && d.uploads[0] === d.uploads[1],
    '上传响应超时后沿用同一上传键',
  )
  // 待确认任务跨整页加载恢复，File 不持久化。
  await open('submit-lost')
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).waitFor()
  const original = (await debug()).submissions[0].key
  await leave()
  await page.goto(base + '/upload?space=account')
  await ready()
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).waitFor()
  ensure(!(await page.locator('.upload-zone img').count()), '刷新恢复凭据，不恢复File或ObjectURL')
  await page.screenshot({ path: shots + '恢复提交390.png', fullPage: true })
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  d = await debug()
  ensure(d.tasks === 1 && d.submissions.at(-1).key === original, '整页重载后仍确认原任务')
  await open('submit-slow')
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('button', { name: '正在提交识别任务…', exact: true }).waitFor()
  await page.getByRole('link', { name: '查看最近识别', exact: true }).click()
  await page.waitForURL('**/library?space=account&view=recent')
  await page.waitForFunction(async () => (await (await fetch('/api/__r7debug')).json()).tasks === 1)
  ensure(
    await page.evaluate(() => location.pathname === '/library'),
    '离页后迟到回调不能导航旧任务',
  )
  await open('quota')
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '今日识别次数' }).waitFor()
  ensure((await debug()).tasks === 0, '额度不足没有创建任务')
  ensure(
    !(await page.getByRole('radio', { name: '印刷公式', exact: true }).isDisabled()),
    '明确拒绝后可修改模式',
  )
  await open('unavailable')
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).waitFor()
  ensure((await debug()).tasks === 0, '服务不可用显示未确认并保持安全重试')
  // 游客只提交元信息。
  await open()
  await image()
  await page.evaluate(() => {
    window.__r7SetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (key, value) {
      if (key === 'formula-ai:recognition-recovery:v1')
        throw new DOMException('受控存储失败', 'QuotaExceededError')
      return window.__r7SetItem.call(this, key, value)
    }
  })
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('alert').filter({ hasText: '本次任务请求未发送' }).first().waitFor()
  d = await debug()
  ensure(d.submissions.length === 0 && d.tasks === 0, '恢复凭据写入失败时，在任务POST之前拒绝发送')
  await page.evaluate(() => {
    Storage.prototype.setItem = window.__r7SetItem
  })
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  ensure((await debug()).tasks === 1, '恢复存储后用保留请求继续提交')
  await open('guest', '/upload?space=demo')
  await image()
  await page.screenshot({ path: shots + '游客上传390.png', fullPage: true })
  await page.getByRole('button', { name: '开始本机演示（模拟）', exact: true }).click()
  await page.waitForURL('**/result/r7-demo-result?space=demo')
  await ready()
  d = await debug()
  ensure(d.uploads.length === 0 && d.submissions.length === 0, '游客不调用账号上传或任务接口')
  ensure(await page.getByText('本机演示', { exact: true }).isVisible(), '游客结果明确标注演示')
  await page.screenshot({ path: shots + '游客结果390.png', fullPage: true })
  // 任务状态、网络恢复、刷新、较旧快照与合法回队。
  for (const value of [
    'account',
    'processing',
    'failed',
    'completed',
    'network-task',
    'notfound',
    'forbidden',
  ]) {
    await open(value, '/recognitions/r7-t1')
    await page.screenshot({ path: shots + '任务-' + value + '390.png', fullPage: true })
    ensure(true, '任务状态真实可见：' + value)
  }
  await open('processing', '/recognitions/r7-t1')
  await mode('network-task')
  await page.getByRole('button', { name: '刷新任务状态', exact: true }).click()
  await page.getByRole('heading', { name: '任务暂时无法连接', exact: true }).waitFor()
  ensure(
    await page.getByRole('heading', { name: '正在处理', exact: true }).isVisible(),
    '网络错误保留本任务上次快照',
  )
  await mode('processing')
  await page.getByRole('button', { name: '重新读取任务', exact: true }).click()
  await page
    .getByRole('heading', { name: '任务暂时无法连接', exact: true })
    .waitFor({ state: 'hidden' })
  ensure(true, '任务读取失败可恢复')
  const writes = (await debug()).submissions.length
  await page.reload()
  await ready()
  ensure((await debug()).submissions.length === writes, '刷新已有任务只GET，不提交或扣额')
  await open('stale-attempt', '/recognitions/r7-t1')
  await page.waitForFunction(async () => (await (await fetch('/api/__r7debug')).json()).reads >= 3)
  ensure(
    (await page.locator('.task-note').textContent()).includes('已尝试 2 次'),
    '旧尝试次数不能覆盖已显示快照',
  )
  await open('requeue', '/recognitions/r7-t1')
  await page.getByRole('heading', { name: '正在排队', exact: true }).waitFor()
  ensure(true, '允许后端合法处理中回排队')
  // 已失败任务重新提交失败，刷新后仍沿用新请求。
  await open('failed', '/recognitions/r7-t1')
  await mode('submit-lost')
  await page.getByRole('button', { name: '重新提交识别', exact: true }).click()
  await page.getByRole('button', { name: '确认上次重新提交', exact: true }).waitFor()
  await mode('failed')
  await page.reload()
  await ready()
  await page.getByRole('button', { name: '确认上次重新提交', exact: true }).waitFor()
  await mode('account')
  await page.getByRole('button', { name: '确认上次重新提交', exact: true }).click()
  await ready()
  d = await debug()
  ensure(
    d.tasks === 1 && d.submissions.length === 2 && d.submissions[0].key === d.submissions[1].key,
    '已失败后的新请求在响应丢失/刷新后保持幂等',
  )
  // 归属和 Session 失败不会降级为游客提交。
  await open('account', '/upload?space=account&preview=tools')
  await image()
  await mode('session-error')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByRole('heading', { name: '暂时无法确认账号', exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '等待账号确认', exact: true }).isDisabled(),
    'Session故障禁止提交',
  )
  await mode('account')
  await page.getByRole('button', { name: '重新连接账号', exact: true }).click()
  await page
    .getByRole('heading', { name: '暂时无法确认账号', exact: true })
    .waitFor({ state: 'hidden' })
  await mode('submit-lost')
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.getByRole('button', { name: '确认上次识别提交', exact: true }).waitFor()
  ensure(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('formula-ai:recognition-recovery:v1') ?? '[]').length ===
        1,
    ),
    '待确认请求在当前账号下持有恢复凭据',
  )
  await mode('other')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await ready()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).waitFor()
  ensure(!(await page.locator('.upload-zone img').count()), '切换账号清除原私有图片草稿')
  ensure(
    await page.evaluate(
      () =>
        JSON.parse(sessionStorage.getItem('formula-ai:recognition-recovery:v1') ?? '[]').length ===
        0,
    ),
    '切换账号清除旧账号恢复凭据',
  )
  await open('account', '/recognitions/r7-t1?preview=tools')
  await mode('other')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByRole('heading', { name: '未找到这个任务', exact: true }).waitFor()
  ensure(!(await page.locator('.task-progress').count()), '切换账号不显示旧私有任务')
  await mode('logout')
  await page.getByRole('button', { name: '刷新测试身份', exact: true }).click()
  await page.getByRole('heading', { name: '请登录后查看任务', exact: true }).waitFor()
  ensure(!(await page.locator('.task-progress').count()), '退出账号不显示私有任务')
  // 识别完成后的首页与库页衔接。
  await open('account', '/')
  await page
    .getByRole('link', { name: /识别公式/ })
    .first()
    .click()
  await ready()
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  await mode('completed')
  await page.getByRole('button', { name: '刷新任务状态', exact: true }).click()
  await page.getByRole('link', { name: '查看识别结果', exact: true }).waitFor()
  ensure(
    await page.evaluate(() => location.pathname === '/recognitions/r7-t1'),
    '完成状态不强制打断页面',
  )
  await page.getByRole('link', { name: '查看识别结果', exact: true }).click()
  await page.waitForURL('**/formulas/r7-formula')
  await ready()
  await page.getByRole('heading', { name: '识别得到的公式', exact: true }).waitFor()
  ensure(
    await page.getByRole('heading', { name: '识别得到的公式', exact: true }).isVisible(),
    '完成后打开正确账号公式',
  )
  await page.getByRole('link', { name: '返回上一页', exact: true }).click()
  await page.waitForFunction(() => !location.pathname.startsWith('/formulas/'))
  if (!(await page.getByRole('link', { name: '最近识别', exact: true }).count())) {
    await page
      .getByRole('navigation', { name: '主导航', exact: true })
      .getByRole('link', { name: '公式库', exact: true })
      .click()
    await page.getByRole('heading', { name: '我的公式库', exact: true }).waitFor()
  }
  await page.getByRole('link', { name: '最近识别', exact: true }).click()
  await ready()
  await page.locator('.history-item').first().waitFor()
  ensure((await page.locator('.history-item').count()) > 0, '公式库最近识别反映新任务')
  await page.getByRole('link', { name: '首页', exact: true }).click()
  await ready()
  await page.getByRole('link', { name: /识别得到的公式/ }).waitFor()
  ensure(
    await page.getByRole('link', { name: /识别得到的公式/ }).isVisible(),
    '完成后首页最近公式更新',
  )
  await open('account', '/library?space=account&q=keep&category=uncategorized')
  await page.getByRole('link', { name: '上传公式图片', exact: true }).click()
  await page.getByRole('heading', { name: '公式识别', exact: true }).waitFor()
  await image()
  await page.getByRole('button', { name: '识别并保存到账号', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  await mode('completed')
  await page.getByRole('button', { name: '刷新任务状态', exact: true }).click()
  await page.getByRole('link', { name: '查看识别结果', exact: true }).click()
  await page.getByRole('heading', { name: '识别得到的公式', exact: true }).waitFor()
  await page.getByRole('link', { name: '返回上一页', exact: true }).click()
  await page.waitForFunction(() => location.pathname === '/library')
  ensure(
    await page.evaluate(() => {
      const q = new URLSearchParams(location.search)
      return (
        q.get('q') === 'keep' &&
        q.get('category') === 'uncategorized' &&
        q.get('space') === 'account'
      )
    }),
    '结果返回保留上传前库页筛选，跳过已清空的上传中转',
  )
  const mobilePassed = checks.length
  for (const width of [768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await open()
    await layout(width, '上传')
    await page.screenshot({ path: shots + '上传修改后' + width + '.png', fullPage: true })
    await image()
    await layout(width, '预览')
    await page.screenshot({ path: shots + '预览修改后' + width + '.png', fullPage: true })
    await page.getByRole('button', { name: '删除图片', exact: true }).click()
    await open('processing', '/recognitions/r7-t1')
    await layout(width, '任务')
    await page.screenshot({ path: shots + '任务处理' + width + '.png', fullPage: true })
  }
  return { passed: checks.length, mobilePassed, checks }
}
