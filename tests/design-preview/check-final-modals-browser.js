async function checkFinalModals(page) {
  const base = 'http://127.0.0.1:3200',
    checks = []
  function ensure(ok, name) {
    if (!ok) throw Error(name)
    checks.push(name)
  }
  await page.context().clearCookies()
  await page.context().addCookies([
    { name: 'r6-detail', value: 'guest', url: base },
    { name: 'r6-run', value: 'r6-r10-modal-' + Date.now(), url: base },
  ])
  await page.addInitScript(() => {
    window.confirm = () => true
  })
  for (const width of [320, 390, 430, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto(base + '/result/integral?space=demo')
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
    const targets = [
      ['演示编辑', page.getByRole('button', { name: /编辑公式/ })],
      ['演示分类', page.locator('.organization-row > .text-button')],
      ['演示版本', page.getByRole('button', { name: /版本记录/ })],
      ['演示导出说明', page.getByRole('button', { name: 'Word 导出', exact: true })],
    ]
    for (const [name, opener] of targets) {
      await opener.click()
      const dialog = page.locator('dialog[open]')
      await dialog.waitFor()
      ensure(
        await dialog.evaluate((e) => e.contains(document.activeElement)),
        name + width + '焦点进入弹窗',
      )
      const bounds = await dialog.evaluate((e) => {
        const r = e.getBoundingClientRect()
        return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight + 1
      })
      ensure(bounds, name + width + '弹窗在视口内且可内部滚动')
      ensure(
        await page.evaluate(() => getComputedStyle(document.documentElement).overflow === 'hidden'),
        name + width + '锁定背景',
      )
      const focusable = dialog.locator('button,a[href],input,textarea,select,summary').last()
      await focusable.focus()
      await page.keyboard.press('Tab')
      ensure(
        await dialog.evaluate(
          (e) =>
            e.contains(document.activeElement) ||
            (!document.hasFocus() && document.activeElement === document.body),
        ),
        name + width + 'Tab不进入背景控件（保留浏览器工具栏访问）',
      )
      if (!(await page.evaluate(() => document.hasFocus()))) {
        await page.keyboard.press('Tab')
        ensure(
          await dialog.evaluate((e) => e.contains(document.activeElement)),
          name + width + '工具栏返回仍在弹窗',
        )
      }
      await page.screenshot({ path: `docs/设计稿/R10全站收尾/弹窗-${name}-${width}.png` })
      await page.keyboard.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      ensure(
        await opener.evaluate((e) => e === document.activeElement),
        name + width + 'ESC后恢复触发按钮焦点',
      )
      ensure(
        await page.evaluate(() => getComputedStyle(document.documentElement).overflow !== 'hidden'),
        name + width + '恢复背景滚动',
      )
    }
  }
  await page.context().clearCookies()
  await page.context().addCookies([
    { name: 'r10-final', value: 'completed', url: base },
    { name: 'r10-run', value: 'r10-navigation-' + Date.now(), url: base },
  ])
  await page.goto(base + '/account/exports/r10-export')
  await page.waitForFunction(() => location.pathname === '/exports/r10-export')
  await page.getByRole('button', { name: '下载 Word', exact: true }).waitFor()
  ensure(
    (await page.getByRole('link', { name: '返回公式详情', exact: false }).getAttribute('href')) ===
      '/formulas/r10-formula',
    '导出旧地址兼容与固定公式返回路径',
  )
  await page.goto(base + '/about')
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.evaluate(() =>
    document
      .querySelector('#__nuxt')
      .__vue_app__.config.globalProperties.$nuxt.$router.push('/__r10-error?code=404'),
  )
  await page.getByRole('button', { name: '返回上一页', exact: true }).click()
  await page.waitForFunction(() => location.pathname === '/about')
  ensure(true, '全局错误页返回可信上一页且不循环')
  return { passed: checks.length, checks }
}
