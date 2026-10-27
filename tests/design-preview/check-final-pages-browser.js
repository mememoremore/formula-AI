async function checkFinalPages(page) {
  const base = 'http://127.0.0.1:3200',
    shots = 'docs/设计稿/R10全站收尾/',
    checks = [],
    stamp = Date.now().toString(36)
  const ensure = (ok, name) => {
    if (!ok) throw Error(name)
    checks.push(name)
  }
  await page.addInitScript(() => {
    window.confirm = () => true
  })
  async function hydrate() {
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
    await page.evaluate(() => document.fonts.ready)
  }
  let sequence = 0
  async function open(mode, path, run = mode) {
    // 独立夹具场景使用同一示例账号/任务ID，显式清空测试回执；同场景刷新不经过这里。
    if (page.url().startsWith(base))
      await page.evaluate(() => sessionStorage.removeItem('formula-ai:export-retry:v1'))
    // 独立文档先卸载旧页面，再切换夹具身份，避免旧页面启动请求串入新场景。
    await page.goto('about:blank')
    await page.context().clearCookies()
    await page.context().addCookies([
      { name: 'r10-final', value: mode, url: base },
      {
        name: 'r10-run',
        value: 'r10-' + run.replace(/[^a-z0-9-]/g, '') + '-' + stamp + '-' + ++sequence,
        url: base,
      },
    ])
    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    await hydrate()
  }
  async function mode(value) {
    await page.context().addCookies([{ name: 'r10-final', value, url: base }])
  }
  async function debug(action) {
    return page.evaluate(
      async (action) =>
        (
          await fetch(
            '/api/__r10debug',
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
  async function shape(label) {
    const metrics = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      tiny: [...document.querySelectorAll('button,a.button,summary')]
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.width > 0 && r.height > 0 && r.height < 43 && !e.closest('details:not([open])')
        })
        .map((e) => e.textContent.trim()),
    }))
    ensure(!metrics.overflow, label + '无横向溢出')
    ensure(!metrics.tiny.length, label + '主要触控目标至少44px：' + metrics.tiny.join(','))
    if (await page.locator('.inline-art').count())
      ensure(
        await page
          .locator('.inline-art')
          .evaluate(
            (e) =>
              e.firstElementChild.getBoundingClientRect().right <=
              e.querySelector('.intro-art').getBoundingClientRect().left,
          ),
        label + '标题与插图不重叠',
      )
  }
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [name, path] of [
      ['导出', '/exports/r10-export'],
      ['帮助', '/help'],
      ['反馈', '/feedback'],
      ['关于', '/about'],
    ]) {
      await open('completed', path, name + width)
      await shape(name + width)
      await page.screenshot({ path: shots + `修改后-${name}-${width}.png`, fullPage: true })
      if (name === '关于')
        ensure((await debug()).sessions === 0, '关于SSR和客户端不请求Session' + width)
      if (name === '帮助') {
        const summary = page.locator('summary').nth(1)
        await summary.focus()
        await page.keyboard.press('Enter')
        ensure(await summary.evaluate((e) => e.parentElement.open), 'FAQ键盘展开' + width)
        await page.keyboard.press('Space')
        ensure(!(await summary.evaluate((e) => e.parentElement.open)), 'FAQ键盘收起' + width)
      }
    }
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await open('completed', '/exports/r10-export', 'download')
  const downloaded = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Word', exact: true }).click()
  const file = await downloaded
  ensure(file.suggestedFilename() === '一元二次方程-v1.docx', '浏览器收到固定版本下载文件名')
  await page.getByRole('status').filter({ hasText: '已请求浏览器下载' }).waitFor()
  ensure((await debug()).downloads === 1, '下载只请求一次且不新建任务')
  ensure((await debug()).keys.length === 0, '下载不触发POST')
  await open('download-error', '/exports/r10-export')
  await page.getByRole('button', { name: '下载 Word', exact: true }).click()
  await page.getByText('下载暂时失败', { exact: false }).waitFor()
  await mode('completed')
  const retriedDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: '下载 Word', exact: true }).click()
  await retriedDownload
  ensure((await debug()).downloads === 2, '下载失败可重试同一成品')
  await open('retry-lost', '/exports/r10-export')
  await page.getByRole('button', { name: '重新提交导出', exact: true }).click()
  await page.getByRole('button', { name: '确认上次重新提交', exact: true }).waitFor()
  await page.reload({ waitUntil: 'domcontentloaded' })
  await hydrate()
  await page.getByRole('button', { name: '确认上次重新提交', exact: true }).click()
  await page.waitForURL('**/exports/r10-retried')
  const replay = await debug()
  ensure(replay.keys.length === 2 && replay.keys[0] === replay.keys[1], '刷新后仍使用同一幂等标识')
  await open('failed', '/exports/r10-export', 'double')
  await page.getByRole('button', { name: '重新提交导出', exact: true }).evaluate((e) => {
    e.click()
    e.click()
  })
  await page.waitForURL('**/exports/r10-retried')
  ensure((await debug()).keys.length === 1, '连续点击仅创建一次请求')
  await open('failed', '/exports/r10-export', 'corrupt')
  await page.evaluate(() => sessionStorage.setItem('formula-ai:export-retry:v1', 'broken'))
  await page.getByRole('button', { name: '重新提交导出', exact: true }).click()
  await page.getByText('本次未发送新请求', { exact: false }).waitFor()
  ensure((await debug()).keys.length === 0, '损坏恢复记录在POST前拒绝执行')
  await page.evaluate(() => sessionStorage.removeItem('formula-ai:export-retry:v1'))
  await open('failed', '/exports/r10-export', 'leave')
  await page.getByRole('button', { name: '重新提交导出', exact: true }).click()
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$nuxt.$router.push('/help'),
  )
  await page.waitForFunction(() => location.pathname === '/help')
  await page.waitForTimeout(500)
  ensure(
    await page.evaluate(() => location.pathname === '/help'),
    '离开页面后旧提交回调不导航到旧任务',
  )
  for (const [value, text] of [
    ['queued', '正在排队'],
    ['processing', '正在处理'],
    ['failed', '重新提交导出'],
    ['missing-file', '文件暂时不可下载'],
    ['notfound', '未找到这个导出任务'],
    ['network', '任务暂时无法连接'],
    ['session-error', '服务暂时不可用'],
  ]) {
    await open(value, '/exports/r10-export')
    await page.getByText(text, { exact: false }).first().waitFor()
    ensure(
      !(await page.getByRole('button', { name: '下载 Word', exact: true }).count()),
      value + '无错误下载入口',
    )
    await page.screenshot({ path: shots + '导出状态-' + value + '-390.png', fullPage: true })
    if (value === 'network') {
      await mode('completed')
      await page.getByRole('button', { name: '重新读取任务', exact: true }).click()
      await page.getByRole('button', { name: '下载 Word', exact: true }).waitFor()
      ensure((await debug()).keys.length === 0, '读取失败重试不新建任务')
    }
  }
  await open('queued', '/exports/r10-export', 'progress')
  await debug('complete')
  await page.getByRole('button', { name: '下载 Word', exact: true }).waitFor()
  ensure((await debug()).keys.length === 0, '轮询完成不重新提交')
  await page.reload({ waitUntil: 'domcontentloaded' })
  await hydrate()
  await page.getByRole('button', { name: '下载 Word', exact: true }).waitFor()
  ensure(true, '刷新恢复同一已完成任务')
  await open('completed', '/feedback', 'clipboard')
  await page.evaluate(() => {
    navigator.clipboard.writeText = async (text) => {
      window.__r10Copied = text
    }
  })
  await page.getByLabel('反馈内容').fill('只复制，不自动发送。')
  await page.getByRole('button', { name: '复制反馈内容', exact: true }).click()
  await page.getByRole('heading', { name: '已复制，尚未发送' }).waitFor()
  ensure(
    (await page.evaluate(() => window.__r10Copied)).includes('只复制，不自动发送。'),
    '复制真实整理内容',
  )
  await page.getByLabel('反馈内容').fill('复制失败时手动恢复。')
  await page.evaluate(() => {
    navigator.clipboard.writeText = async () => {
      throw Error('denied')
    }
  })
  await page.getByRole('button', { name: '复制反馈内容', exact: true }).click()
  await page.getByLabel('待复制的完整反馈').waitFor()
  await page.getByRole('button', { name: '选择全部反馈' }).click()
  ensure(
    await page
      .getByLabel('待复制的完整反馈')
      .evaluate((e) => e.selectionStart === 0 && e.selectionEnd === e.value.length),
    '复制失败可键盘或长按手动复制',
  )
  await page.screenshot({ path: shots + '反馈复制失败-390.png', fullPage: true })
  await page.getByLabel('反馈内容').fill('   ')
  ensure(
    await page.getByRole('button', { name: '复制反馈内容', exact: true }).isDisabled(),
    '空白反馈禁止复制',
  )
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await open('guest', '/r10-missing', 'error' + width)
    await page.getByRole('heading', { name: '这一页暂时不在这里' }).waitFor()
    await shape('404' + width)
    await page.screenshot({ path: shots + `修改后-404-${width}.png`, fullPage: true })
    ensure((await debug()).sessions === 0, '错误页不请求Session' + width)
    await page.getByRole('button', { name: '返回首页', exact: true }).click()
    await page.waitForFunction(() => location.pathname === '/')
    ensure(true, '404返回首页' + width)
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await open('guest', '/about', 'recovery')
  await page.locator('a[href="/help"]').click()
  await page.waitForFunction(() => location.pathname === '/help')
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$nuxt.$router.push('/__r10-error?code=503&once=1'),
  )
  await page.getByRole('heading', { name: '服务暂时不可用' }).waitFor()
  ensure(
    !(await page.locator('body').innerText()).includes('R10_PRIVATE_SQL'),
    '错误正文不展示原始SQL密钥路径哨兵',
  )
  await page.screenshot({ path: shots + '错误503-390.png', fullPage: true })
  await page.getByRole('button', { name: '重试当前页面', exact: true }).click()
  await page.getByRole('heading', { name: '页面已恢复' }).waitFor()
  ensure(true, '503显式重试恢复且不循环')
  return {
    checks: checks.length,
    names: checks,
    environment:
      '3200 isolated HTTP fixtures; clipboard controlled; browser download fixture bytes, real DOCX covered by integration',
  }
}
