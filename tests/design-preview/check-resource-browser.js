async function checkResourceFeedback(page) {
  const base = 'http://127.0.0.1:3200',
    checks = []
  const ensure = (condition, name) => {
    if (!condition) throw new Error(name)
    checks.push(name)
  }
  const cases = [
    [429, '存储容量不足，请稍后重试或联系管理员。', '存储容量不足'],
    [413, '上传内容过大，请缩小后重试。', '上传内容过大'],
    [503, '图片保存结果待核对，请保留请求编号后稍后重试。', '连接结果暂未确认'],
    [409, '该请求仍在处理中或等待核对，请勿重复提交。', '等待核对'],
  ]
  page.on('dialog', (dialog) => dialog.accept())
  let status = 429,
    message = '',
    keys = [],
    taskWrites = 0
  await page.route('**/api/account/files', async (route) => {
    keys.push(route.request().headers()['x-upload-key'])
    await route.fulfill({
      status,
      contentType: 'application/json',
      body: JSON.stringify({ statusCode: status, message }),
    })
  })
  await page.route('**/api/account/recognitions', async (route) => {
    if (route.request().method() === 'POST') taskWrites++
    await route.continue()
  })
  try {
    for (const width of [390, 1440]) {
      await page.setViewportSize({ width, height: 900 })
      if (width === 390) {
        await page.context().addCookies([
          { name: 'r7-recognition', value: 'account', url: base },
          { name: 'r7-run', value: 'r7-r12-' + width + '-' + Date.now(), url: base },
        ])
        await page.goto(base + '/upload?space=account')
        await page.waitForFunction(
          () =>
            document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
              ?.isHydrating === false,
        )
        await page
          .getByLabel('选择公式图片', { exact: true })
          .setInputFiles('tmp/r7-images/横图.png')
        await page.locator('.upload-zone img').waitFor()
      }
      const button = page.locator('.recognize-button')
      await button.waitFor({ state: 'visible' })
      keys = []
      for (const value of cases) {
        status = value[0]
        message = value[1]
        await button.click()
        await page.waitForFunction(
          (text) => document.querySelector('.upload-error')?.textContent?.includes(text),
          value[2],
        )
        ensure(await button.isEnabled(), width + ':' + status + '失败后允许安全重试')
      }
      ensure(
        keys.length === 4 && keys[0] && keys.every((key) => key === keys[0]),
        width + ':重试保留原上传请求键',
      )
      ensure(
        await page.evaluate(() => document.documentElement.scrollWidth === innerWidth),
        width + ':无横向溢出',
      )
    }
    ensure(taskWrites === 0, '上传拒绝或结果未确认时不提交识别任务')
    return { mode: 'controlled HTTP Mock', passed: checks.length, cases: cases.length * 2, checks }
  } catch (error) {
    await page
      .screenshot({ path: 'tmp/r12-browser-failure.png', fullPage: true, timeout: 5000 })
      .catch(() => {})
    throw error
  }
}
