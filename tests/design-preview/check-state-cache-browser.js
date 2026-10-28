async function checkStateCache(page) {
  const base = 'http://127.0.0.1:3200',
    checks = [],
    suffix = Date.now().toString(36)
  const ensure = (ok, name) => {
    if (!ok) throw Error(name)
    checks.push(name)
  }
  const formulaViews = [
    'account-library-library-r6-user',
    'account-library-favorites-r6-user',
    'account-history-r6-user',
    'account-categories',
    'home-recent',
  ]
  async function hydrate() {
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
  }
  async function open(cookie, mode, run, path) {
    await page.goto('about:blank')
    await page.context().clearCookies()
    await page.context().addCookies([
      { name: cookie, value: mode, url: base },
      { name: cookie.split('-')[0] + '-run', value: run + '-' + suffix, url: base },
    ])
    await page.goto(base + path)
    await hydrate()
  }
  async function seed(keys) {
    await page.evaluate((keys) => {
      const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
      for (const key of keys) app.payload.data[key] = { marker: 'r11-warm-cache' }
    }, keys)
  }
  async function cleared(keys) {
    return page.evaluate((keys) => {
      const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
      return keys.every((key) => app.payload.data[key] === undefined)
    }, keys)
  }
  await open('r6-detail', 'account', 'r6-r11-cache', '/formulas/r6-formula')
  await seed([...formulaViews, 'draft-context-r6-user-r6-v1'])
  await page.getByRole('button', { name: '收藏这条公式', exact: true }).click()
  await page.getByRole('button', { name: '取消收藏这条公式', exact: true }).waitFor()
  ensure(await cleared(formulaViews), '收藏结果失效已有公式视图')
  ensure(
    await page.evaluate(() => {
      const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
      const data = app.payload.data
      return (
        app._asyncData['saved-formula-r6-formula-r6-user'].data.value.formula.favorite &&
        !Object.hasOwn(data, 'saved-formula-r6-formula')
      )
    }),
    '收藏更新真正的账号详情，不创建旧幽灵键',
  )
  await page.getByRole('button', { name: '代数', exact: true }).click()
  await page
    .getByRole('combobox', { name: '公式分类', exact: true })
    .selectOption('22222222-2222-4222-8222-222222222222')
  await page.getByRole('button', { name: '保存分类', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ensure(
    await page.getByRole('button', { name: '微积分', exact: true }).isVisible(),
    '分类结果仍由详情saved事件更新',
  )
  await seed(formulaViews)
  await page.getByRole('button', { name: /编辑公式/ }).click()
  await page.getByLabel('公式名称', { exact: true }).fill('R11已保存标题')
  await page.getByRole('button', { name: '确认并保存', exact: true }).click()
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  ensure(await cleared(formulaViews), '编辑结果统一失效公式视图')
  ensure(
    await page.getByRole('heading', { name: 'R11已保存标题', exact: true }).isVisible(),
    '标题保存不清空当前详情',
  )
  ensure(!(await cleared(['draft-context-r6-user-r6-v1'])), '固定历史版本上下文不失效')
  const usageKeys = ['account-usage', 'account-usage-r6-user']
  await seed([...usageKeys, 'account-service-status-r6-user'])
  await page.evaluate(() => {
    const app = document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt
    window.__r11RemoveGuard = app.$router.beforeEach((to) =>
      to.path.startsWith('/exports/') ? false : undefined,
    )
  })
  await page.getByRole('button', { name: '导出 Word', exact: true }).click()
  await page.getByRole('button', { name: '生成 Word 文档', exact: true }).click()
  await page.waitForFunction(
    () => !document.querySelector('dialog[open] .button-primary')?.disabled,
  )
  ensure(await cleared(usageKeys), '首次导出同时失效旧额度键和账号额度键')
  ensure(!(await cleared(['account-service-status-r6-user'])), '额度事件不影响服务探测')
  await page.evaluate(() => window.__r11RemoveGuard())
  await page.getByRole('button', { name: '关闭弹窗', exact: true }).click()
  await open('r8-chat', 'account', 'r8-r11-cache', '/ai/new?space=account')
  const chatKeys = ['account-conversations-r8-owner', 'account-usage-r8-owner', 'home-recent']
  await seed([...chatKeys, 'draft-context-r8-owner-fixed'])
  await page.locator('.chat-composer textarea').fill('R11首次发送')
  await page.getByRole('button', { name: '发送提问', exact: true }).click()
  await page.waitForFunction(
    () => /^\/ai\/[a-zA-Z0-9-]+$/.test(location.pathname) && location.pathname !== '/ai/new',
  )
  ensure(await cleared(chatKeys), '新建会话发送统一失效列表和额度')
  await page.waitForFunction(() => document.querySelector('.account-chat textarea'))
  await page.evaluate(async () => {
    await fetch('/api/__r8debug', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'complete' }),
    })
  })
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor({ state: 'hidden' })
  await seed(chatKeys)
  await page.locator('.chat-composer textarea').fill('R11继续追问')
  await page.getByRole('button', { name: '发送提问', exact: true }).click()
  await page.getByRole('button', { name: '停止生成', exact: true }).waitFor()
  ensure(await cleared(chatKeys), '续聊与首次发送使用相同失效规则')
  ensure(!(await cleared(['draft-context-r8-owner-fixed'])), '续聊不清理固定上下文')
  return {
    passed: checks.length,
    checks,
    mode: 'controlled HTTP; preseeded Nuxt cache slots; no backend contract changes',
  }
}
