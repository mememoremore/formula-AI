async function checkAccount(page) {
  const base = 'http://127.0.0.1:3200',
    shots = 'docs/设计稿/R9账号资料/',
    checks = [],
    suffix = Date.now().toString(36)
  const ensure = (value, name) => {
    if (!value) throw Error(name)
    checks.push(name)
  }
  await page.addInitScript(() => {
    if (window.__r9Installed) return
    window.__r9Installed = true
    window.__r9Errors = []
    window.__r9Confirm = 0
    window.__r9Allow = true
    window.__r9Bitmaps = 0
    window.__r9Closed = 0
    window.confirm = () => {
      window.__r9Confirm++
      return window.__r9Allow
    }
    window.addEventListener('error', (e) => window.__r9Errors.push(e.message))
    window.addEventListener('unhandledrejection', (e) => window.__r9Errors.push(String(e.reason)))
    for (const level of ['warn', 'error']) {
      const original = console[level]
      console[level] = (...args) => {
        if (/Hydration|Vue warn|Unhandled/i.test(String(args[0])))
          window.__r9Errors.push(String(args[0]))
        original.apply(console, args)
      }
    }
    const create = window.createImageBitmap.bind(window)
    window.createImageBitmap = async (...args) => {
      const bitmap = await create(...args),
        close = bitmap.close.bind(bitmap)
      window.__r9Bitmaps++
      bitmap.close = () => {
        window.__r9Closed++
        close()
      }
      return bitmap
    }
  })
  async function cookies(mode, run) {
    await page.context().addCookies([
      { name: 'r9-account', value: mode, url: base },
      { name: 'r9-run', value: 'r9-' + run + '-' + suffix, url: base },
    ])
  }
  async function mode(value) {
    await page.context().addCookies([{ name: 'r9-account', value, url: base }])
  }
  async function hydrate() {
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
  }
  async function open(path) {
    // 通过正式 SPA 返回守卫明确放弃上个场景的草稿，再开始独立文档场景。
    // 不让 CLI 的原生 beforeunload 模态交接截断本次运行结果。
    if (await page.locator('.profile-editor').count()) {
      await page.getByRole('link', { name: '返回上一页' }).click()
      await page.waitForFunction(() => !document.querySelector('.profile-editor'))
    }
    await page.goto(base + path, { waitUntil: 'domcontentloaded' })
    await hydrate()
  }
  async function debug(action) {
    return page.evaluate(
      async (action) =>
        await (
          await fetch(
            '/api/__r9debug',
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
  async function shape(name) {
    const value = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      small: [...document.querySelectorAll('button,input:not([type=file]),a.button,summary')]
        .filter((e) => {
          const r = e.getBoundingClientRect()
          return r.height > 0 && r.width > 0 && !e.disabled && r.height < 43
        })
        .map((e) => e.textContent),
    }))
    ensure(!value.overflow, name + '无整页横溢')
    ensure(!value.small.length, name + '触控至少44px')
    ensure(!(await page.evaluate(() => window.__r9Errors)).length, name + '无脚本水合异常')
  }
  async function loginFields(email = 'a@example.test') {
    await page.getByLabel('邮箱', { exact: true }).fill(email)
    await page.getByLabel('密码', { exact: true }).fill('R9-testing-password')
  }
  let mobilePassed = 0
  async function layouts(widths) {
    for (const width of widths) {
      await page.setViewportSize({ width, height: 850 })
      for (const [name, path, scenario] of [
        ['登录', '/login', 'guest'],
        ['个人中心', '/profile', 'account'],
        ['编辑', '/profile/edit', 'account'],
        ['设置', '/settings', 'account'],
      ]) {
        await cookies(scenario, 'layout-' + width + '-' + name.length + '-' + scenario)
        await open(path)
        await shape(name + width)
        await page.screenshot({ path: shots + name + '修改后' + width + '.png', fullPage: true })
        if (width === 390 && name === '个人中心') {
          await page.screenshot({ path: shots + '个人中心首屏390.png' })
          await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight))
          await page.waitForTimeout(80)
          ensure(
            await page
              .getByRole('link', { name: '关于项目', exact: true })
              .evaluate(
                (el) =>
                  el.getBoundingClientRect().bottom <=
                  document.querySelector('.bottom-nav').getBoundingClientRect().top,
              ),
            '个人中心底部菜单不被固定导航遮挡',
          )
          await page.screenshot({ path: shots + '个人中心底部390.png' })
        }
      }
    }
  }
  await layouts([320, 390, 430])
  await page.setViewportSize({ width: 390, height: 850 })
  await cookies('session-error', 'session')
  await open('/login')
  await page.getByRole('button', { name: '重新确认账号' }).waitFor()
  ensure(
    await page.getByRole('button', { name: '登录', exact: true }).isDisabled(),
    'Session错误阻止盲目登录并提供重试',
  )
  await page.screenshot({ path: shots + '会话失败390.png', fullPage: true })
  await mode('account')
  await page.getByRole('button', { name: '重新确认账号' }).click()
  await page.getByRole('link', { name: '继续刚才的操作' }).waitFor()
  ensure(true, 'Session重试识别已登录账号')
  await cookies('login-error', 'login-error')
  await open('/login')
  await loginFields()
  await page.getByRole('button', { name: '显示密码' }).click()
  ensure(
    (await page.getByLabel('密码', { exact: true }).getAttribute('type')) === 'text',
    '密码可见性切换',
  )
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.getByText('邮箱或密码不正确，请重新输入。', { exact: true }).waitFor()
  ensure((await debug()).auth.length === 1, '登录失败只发一次')
  await mode('guest')
  await page.getByRole('button', { name: '登录', exact: true }).evaluate((el) => {
    el.click()
    el.click()
  })
  await page.waitForURL('**/profile')
  ensure((await debug()).auth.length === 2, '快速双击登录仅追加一次请求')
  await cookies('register-error', 'register')
  await open('/login')
  await page.getByRole('button', { name: '还没有账号？创建一个' }).click()
  await page.getByLabel('昵称', { exact: true }).fill('注册探索者')
  await loginFields('new@example.test')
  ensure(
    (await page.getByLabel('密码', { exact: true }).getAttribute('minlength')) === '10',
    '注册密码策略不降低',
  )
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.getByText('这个邮箱已注册，可以直接登录。', { exact: true }).waitFor()
  ensure(true, '注册错误明确反馈')
  await mode('guest')
  await page.getByRole('button', { name: '创建账号', exact: true }).click()
  await page.waitForURL('**/profile')
  await page.getByRole('heading', { name: '注册探索者', exact: true }).waitFor()
  ensure(true, '注册成功并同步昵称')
  await cookies('postauth-error', 'postauth')
  await open('/login?redirect=/profile/edit')
  await loginFields()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page
    .getByText('认证请求已成功，但账号状态暂时无法读取。请重新确认账号，不要重复注册。', {
      exact: true,
    })
    .waitFor()
  ensure((await debug()).auth.length === 1, '认证成功但Session失败不重新认证')
  await mode('account')
  await page.getByRole('button', { name: '重新确认账号' }).click()
  await page.waitForURL('**/profile/edit')
  await page.getByLabel('昵称', { exact: true }).waitFor()
  ensure((await debug()).auth.length === 1, 'Session恢复后返回原深链接')
  await cookies('auth-lost', 'auth-lost')
  await open('/login')
  await loginFields()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/profile')
  ensure((await debug()).auth.length === 1, '认证响应未知先查询Session而非重发')
  await cookies('guest', 'guest-profile')
  await open('/profile')
  await page.getByRole('heading', { name: '保持好奇，探索公式' }).waitFor()
  ensure((await page.locator('.profile-shortcuts').count()) === 0, '游客不显示账号数据导航')
  await page.screenshot({ path: shots + '游客个人中心390.png', fullPage: true })
  await cookies('account', 'editor')
  await open('/profile/edit')
  ensure(
    await page.getByRole('button', { name: '保存资料', exact: true }).isDisabled(),
    '未修改不能保存',
  )
  await page.getByRole('button', { name: '更换头像' }).click()
  await page.getByRole('button', { name: '恢复默认头像', exact: true }).click()
  ensure(
    await page.getByRole('button', { name: '保存资料', exact: true }).isDisabled(),
    '默认头像恢复不产生虚假修改',
  )
  await page.getByLabel('昵称', { exact: true }).fill('未保存的昵称')
  await page.evaluate(() => (window.__r9Allow = false))
  await page.getByRole('link', { name: '返回上一页' }).click()
  ensure((await page.evaluate(() => location.pathname)) === '/profile/edit', '未保存草稿拒绝离开')
  ensure(
    await page.evaluate(() => {
      const e = new Event('beforeunload', { cancelable: true })
      dispatchEvent(e)
      return e.defaultPrevented
    }),
    '整页刷新有草稿保护',
  )
  await page.evaluate(() => (window.__r9Allow = true))
  await page.getByRole('button', { name: '更换头像' }).click()
  await page.getByLabel('选择头像图片').setInputFiles('tmp/r7-images/损坏.png')
  await page.getByText('图片无法读取，请重新选择完整的 JPG 或 PNG。', { exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '使用此头像' }).isDisabled(),
    '损坏图片不能提交裁剪',
  )
  await page.screenshot({ path: shots + '裁剪失败390.png', fullPage: true })
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.getByRole('button', { name: '更换头像' }).click()
  await page.getByLabel('选择头像图片').setInputFiles('tmp/r7-images/普通.png')
  await page.getByRole('button', { name: '使用此头像' }).waitFor()
  await page.waitForFunction(
    () => !document.querySelector('.app-fullscreen .button-primary')?.disabled,
  )
  await page.getByLabel('缩放', { exact: true }).focus()
  await page.getByLabel('缩放', { exact: true }).press('ArrowRight')
  ensure(Number(await page.getByLabel('缩放', { exact: true }).inputValue()) > 1, '裁剪可键盘缩放')
  await page.getByRole('button', { name: '右移 →' }).click()
  await shape('裁剪390')
  await page.screenshot({ path: shots + '头像裁剪390.png', fullPage: true })
  await page.getByRole('button', { name: '使用此头像' }).click()
  ensure(await page.evaluate(() => window.__r9Bitmaps === window.__r9Closed), '裁剪完成释放Bitmap')
  ensure((await debug()).saves === 0, '裁剪预览不提前写入资料')
  await mode('save-error')
  await page.getByRole('button', { name: '保存资料', exact: true }).click()
  await page
    .getByText('保存结果暂时未能确认，草稿已保留；请先核对最新资料，再决定是否重试。', {
      exact: true,
    })
    .waitFor()
  ensure(
    (await page.getByLabel('昵称', { exact: true }).inputValue()) === '未保存的昵称',
    '保存失败保留昵称',
  )
  ensure(
    (await page.locator('.avatar-button img').getAttribute('src')).startsWith('data:image/'),
    '保存失败保留头像草稿',
  )
  await page.screenshot({ path: shots + '保存失败390.png', fullPage: true })
  await mode('account')
  await page.getByRole('button', { name: '保存资料', exact: true }).click()
  await page.getByText('资料已保存并同步。', { exact: true }).waitFor()
  ensure(
    await page.getByRole('button', { name: '保存资料', exact: true }).isDisabled(),
    '保存确认后清除脏状态',
  )
  await page.getByRole('link', { name: '返回上一页' }).click()
  await page.getByRole('heading', { name: '未保存的昵称', exact: true }).waitFor()
  ensure(
    (await page.locator('.profile-hero .user-avatar img').getAttribute('src')).startsWith(
      '/api/account/avatar?v=',
    ),
    '个人中心同步头像昵称',
  )
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByText('未保存的昵称', { exact: true }).waitFor()
  ensure(
    (await page.locator('.account-row img').getAttribute('src')).startsWith(
      '/api/account/avatar?v=',
    ),
    '设置同步新头像',
  )
  await open('/')
  await page.locator('.app-brand .user-avatar img').waitFor()
  ensure(
    (await page.locator('.app-brand .user-avatar img').getAttribute('src')).startsWith(
      '/api/account/avatar?v=',
    ),
    '首页导航同步新头像',
  )
  await open('/profile?preview=account-tools')
  await debug('b')
  await page.getByRole('button', { name: '重新读取测试身份' }).click()
  await page.getByRole('heading', { name: '公式探索者乙', exact: true }).waitFor()
  ensure(
    (await page.locator('.profile-hero .user-avatar img').getAttribute('src')) ===
      '/images/default-avatar.svg',
    '切换账号不复用甲头像',
  )
  await cookies('usage-error', 'usage')
  await open('/settings')
  await page.getByText('账号使用额度', { exact: true }).click()
  await page.getByText('暂时无法读取额度。', { exact: true }).waitFor()
  await mode('account')
  await page.getByRole('button', { name: '重新读取', exact: true }).click()
  await page.locator('.usage-grid').waitFor()
  ensure(true, '额度失败可重试')
  await mode('service-error')
  await page.getByText('服务连接与配置', { exact: true }).click()
  await page.getByText('暂时无法检查服务状态。', { exact: true }).waitFor()
  await mode('account')
  await page.getByRole('button', { name: '重新检查', exact: true }).click()
  await page.getByText('已配置', { exact: true }).waitFor()
  ensure(
    (await page.getByText('已配置，不代表实时请求可用', { exact: true }).count()) === 1,
    '服务配置与实时可用分开',
  )
  await page.screenshot({ path: shots + '额度服务390.png', fullPage: true })
  await page.getByRole('button', { name: '恢复默认示例', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  await page.waitForFunction(() => !!localStorage.getItem('formula-ai:demo:v1'))
  await page.evaluate(() => {
    const key = 'formula-ai:demo:v1',
      data = JSON.parse(localStorage.getItem(key))
    data.formulas[0].title = 'R9独立演示保留标记'
    localStorage.setItem(key, JSON.stringify(data))
  })
  await open('/settings')
  const demoBefore = await page.evaluate(() => localStorage.getItem('formula-ai:demo:v1'))
  ensure(demoBefore.includes('R9独立演示保留标记'), '创建独立演示保留验证标记')
  await mode('logout-error')
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.getByText('退出暂时未能确认，账号仍然有效，请重试。', { exact: true }).waitFor()
  ensure(
    (await page.getByText('公式探索者甲', { exact: true }).count()) === 1,
    '退出失败不伪装游客',
  )
  await mode('logout-lost')
  await page.getByRole('button', { name: '退出登录', exact: true }).evaluate((el) => {
    el.click()
    el.click()
  })
  await page.waitForURL('**/profile')
  await page.getByRole('heading', { name: '保持好奇，探索公式' }).waitFor()
  ensure(
    (await debug()).auth.filter((p) => p.endsWith('sign-out')).length === 2,
    '退出超时先核对Session且不重复提交',
  )
  ensure(
    (await page.evaluate(() => localStorage.getItem('formula-ai:demo:v1'))) === demoBefore,
    '退出保留独立演示数据',
  )
  ensure(
    await page.evaluate(() => {
      const data =
        document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.payload.data
      return Object.entries(data)
        .filter(
          ([k]) =>
            k !== 'account-session' &&
            (k.startsWith('account-') ||
              k.startsWith('saved-formula-') ||
              k.startsWith('draft-') ||
              k === 'home-recent'),
        )
        .every(([, v]) => v == null)
    }),
    '退出清理私有payload缓存',
  )
  await page.getByRole('link', { name: '登录，开启公式空间' }).click()
  await loginFields('b@example.test')
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await page.waitForURL('**/profile')
  await page.getByRole('heading', { name: '公式探索者乙', exact: true }).waitFor()
  ensure(
    (await page.getByText('公式探索者甲', { exact: true }).count()) === 0,
    'A退出后B登录没有旧资料',
  )
  await page.screenshot({ path: shots + '账号切换390.png', fullPage: true })
  await page.getByRole('link', { name: '设置', exact: true }).click()
  const calls = (await debug()).saves
  await page.getByRole('button', { name: '恢复默认示例', exact: true }).click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  ensure((await debug()).saves === calls, '取消恢复不写账号')
  await page.getByRole('button', { name: '恢复默认示例', exact: true }).click()
  await page.getByRole('button', { name: '确认恢复', exact: true }).click()
  ensure((await debug()).saves === calls, '确认恢复也不写账号服务')
  await cookies('guest', 'ime')
  await open('/login')
  await loginFields()
  await page.locator('form').dispatchEvent('compositionstart')
  await page.getByLabel('密码', { exact: true }).press('Enter')
  ensure((await debug()).auth.length === 0, 'IME组合输入不触发认证')
  await page.locator('form').dispatchEvent('compositionend')
  await cookies('account', 'draft-session')
  await open('/profile/edit?preview=account-tools')
  await page.getByLabel('昵称', { exact: true }).fill('等待原账号恢复的草稿')
  await mode('session-error')
  await page.getByRole('button', { name: '重新读取测试身份' }).click()
  await page
    .getByText('私有表单已隐藏，重新确认原账号后可继续本页草稿。', { exact: true })
    .waitFor()
  ensure(!(await page.locator('.profile-editor').isVisible()), '身份错误隐藏私有编辑器')
  await mode('account')
  await page.getByRole('button', { name: '重新确认账号', exact: true }).click()
  await page.getByLabel('昵称', { exact: true }).waitFor()
  ensure(
    (await page.getByLabel('昵称', { exact: true }).inputValue()) === '等待原账号恢复的草稿',
    '同账号恢复保留未保存草稿',
  )
  await cookies('account', 'crop-errors')
  await open('/profile/edit')
  for (const [file, message] of [
    ['类型.txt', '请选择不超过 10MB 的 JPG 或 PNG。'],
    ['空.png', '请选择不超过 10MB 的 JPG 或 PNG。'],
    ['超大小.png', '请选择不超过 10MB 的 JPG 或 PNG。'],
    ['超像素.png', '图片不能超过 2000 万像素。'],
  ]) {
    await page.getByRole('button', { name: '更换头像' }).click()
    await page.getByLabel('选择头像图片').setInputFiles('tmp/r7-images/' + file)
    await page.getByText(message, { exact: true }).waitFor()
    ensure(
      await page.getByRole('button', { name: '使用此头像' }).isDisabled(),
      '拒绝头像文件 ' + file,
    )
    await page.getByRole('button', { name: '取消', exact: true }).click()
  }
  await page.getByRole('button', { name: '更换头像' }).click()
  await page.getByLabel('选择头像图片').setInputFiles('tmp/r7-images/普通.png')
  await page.waitForFunction(
    () => !document.querySelector('.app-fullscreen .button-primary')?.disabled,
  )
  await page.evaluate(() => {
    window.__r9DataURL = HTMLCanvasElement.prototype.toDataURL
    HTMLCanvasElement.prototype.toDataURL = function (...args) {
      if (this.width === 512) throw new DOMException('受控编码失败')
      return window.__r9DataURL.apply(this, args)
    }
  })
  await page.getByRole('button', { name: '使用此头像' }).click()
  await page.getByText('裁剪结果无法生成，请取消后重新选择图片。', { exact: true }).waitFor()
  ensure((await debug()).saves === 0, '裁剪编码失败不写入资料')
  await page.evaluate(() => (HTMLCanvasElement.prototype.toDataURL = window.__r9DataURL))
  await page.getByRole('button', { name: '取消', exact: true }).click()
  ensure(
    await page.evaluate(() => window.__r9Bitmaps === window.__r9Closed),
    '异常头像解码和关闭均释放Bitmap',
  )
  await cookies('account', 'late-profile')
  await open('/profile/edit?preview=account-tools')
  let releaseProfile, markProfile
  const profileGate = new Promise((r) => (releaseProfile = r)),
    profileCaptured = new Promise((r) => (markProfile = r))
  await page.route(base + '/api/account/profile', async (route) => {
    const response = await route.fetch()
    markProfile()
    await profileGate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByLabel('昵称', { exact: true }).fill('甲窗口的迟到保存')
  await page.getByRole('button', { name: '保存资料', exact: true }).click()
  await profileCaptured
  await debug('b')
  await page.getByRole('button', { name: '重新读取测试身份' }).click()
  await page.waitForFunction(
    () => document.querySelector('input[autocomplete=nickname]')?.value === '公式探索者乙',
  )
  releaseProfile()
  await page.waitForTimeout(300)
  ensure(
    (await page.getByLabel('昵称', { exact: true }).inputValue()) === '公式探索者乙',
    '迟到甲保存响应不覆盖乙资料',
  )
  ensure((await debug()).saves === 1, '切换账号不自动再次保存')
  await page.unroute(base + '/api/account/profile')
  await cookies('account', 'late-library')
  await open('/profile?preview=account-tools')
  let releaseLibrary,
    markLibrary,
    held = false
  const libraryGate = new Promise((r) => (releaseLibrary = r)),
    libraryCaptured = new Promise((r) => (markLibrary = r))
  await page.route('**/api/account/library**', async (route) => {
    if (held) {
      await route.continue()
      return
    }
    held = true
    const response = await route.fetch()
    markLibrary()
    await libraryGate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByRole('link', { name: '我的公式 整理和回顾' }).click()
  await libraryCaptured
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$router.replace(
        '/library?space=account&preview=account-tools',
      ),
  )
  await debug('b')
  await page.getByRole('button', { name: '重新读取测试身份' }).click()
  await page.getByRole('heading', { name: '公式探索者乙的公式', exact: true }).waitFor()
  releaseLibrary()
  await page.waitForTimeout(350)
  ensure(
    (await page.getByRole('heading', { name: '公式探索者甲的公式', exact: true }).count()) === 0,
    '迟到甲列表不会进入乙界面',
  )
  await page.unroute('**/api/account/library**')
  await cookies('account', 'sse-expired')
  await open('/ai/r9-chat?preview=account-tools')
  await page.getByText('只有公式探索者甲可见的片段', { exact: true }).waitFor()
  await debug('logout')
  await page.getByText('对话不存在或当前账号无法访问，请返回会话列表。', { exact: true }).waitFor()
  ensure((await page.locator('.chat-message').count()) === 0, 'Session失效后SSE清空私有消息')
  await page.getByRole('button', { name: '重新读取测试身份' }).click()
  await page.getByRole('link', { name: '登录查看对话' }).waitFor()
  ensure((await debug()).closed > 0, '失效SSE连接已关闭')
  await open('/profile/edit')
  ensure(
    (await page.evaluate(() => location.pathname)) === '/login',
    '退出后私有深链接重新验证权限',
  )
  await cookies('account', 'upload-logout')
  await open('/upload')
  await page.getByLabel('选择公式图片', { exact: true }).setInputFiles('tmp/r7-images/普通.png')
  await page.getByAltText('已选择的公式图片预览').waitFor()
  const oldUploadURL = await page.getByAltText('已选择的公式图片预览').getAttribute('src')
  ensure(
    await page.evaluate(
      () =>
        !!document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$uploadDraft
          .file.value,
    ),
    '上传草稿已实际存在',
  )
  await page.getByRole('link', { name: '返回上一页' }).click()
  await page.waitForURL('**/')
  await page.getByRole('link', { name: '我的', exact: true }).click()
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.waitForURL('**/profile')
  ensure(
    await page.evaluate(
      () =>
        !document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$uploadDraft
          .file.value,
    ),
    '退出清除上传File草稿',
  )
  ensure(
    await page.evaluate(async (url) => {
      try {
        await fetch(url)
        return false
      } catch {
        return true
      }
    }, oldUploadURL),
    '退出释放原ObjectURL',
  )
  await page.evaluate(() =>
    document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$router.push('/upload'),
  )
  await page.getByText('选择一张公式图片', { exact: true }).waitFor()
  ensure(
    (await page.getByAltText('已选择的公式图片预览').count()) === 0,
    '退出后上传不显示原私有预览',
  )
  await cookies('account', 'late-usage')
  await open('/profile')
  let releaseUsage, markUsage
  const usageGate = new Promise((r) => (releaseUsage = r)),
    usageCaptured = new Promise((r) => (markUsage = r))
  await page.route(base + '/api/account/usage', async (route) => {
    const response = await route.fetch()
    markUsage()
    await usageGate
    await route.fulfill({ response }).catch(() => {})
  })
  await page.getByRole('link', { name: '设置', exact: true }).click()
  await usageCaptured
  await page.getByRole('button', { name: '退出登录', exact: true }).click()
  await page.waitForURL('**/profile')
  releaseUsage()
  await page.waitForTimeout(350)
  ensure((await page.locator('.usage-grid').count()) === 0, '退出后迟到额度响应不再显示')
  await page.unroute(base + '/api/account/usage')
  await cookies('guest', 'late-login')
  await open('/login?redirect=/profile/edit')
  let releaseAuth, markAuth
  const authGate = new Promise((r) => (releaseAuth = r)),
    authCaptured = new Promise((r) => (markAuth = r))
  await page.route(base + '/api/auth/sign-in/email', async (route) => {
    const response = await route.fetch()
    markAuth()
    await authGate
    await route.fulfill({ response }).catch(() => {})
  })
  await loginFields()
  await page.getByRole('button', { name: '登录', exact: true }).click()
  await authCaptured
  await page.getByRole('link', { name: '先体验演示版' }).click()
  await page.waitForURL('**/')
  releaseAuth()
  await page.waitForTimeout(350)
  ensure((await page.evaluate(() => location.pathname)) === '/', '离开登录页后旧回调不导航')
  await page.unroute(base + '/api/auth/sign-in/email')

  mobilePassed = checks.length
  await layouts([768, 1024, 1440])
  return { passed: checks.length, mobilePassed, checks }
}
