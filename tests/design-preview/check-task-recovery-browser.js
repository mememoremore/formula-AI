async function checkTaskRecovery(page) {
  const base = 'http://127.0.0.1:3100',
    checks = []
  const ensure = (ok, name) => {
    if (!ok) throw new Error(name)
    checks.push(name)
  }
  const response = await page.request.get(base + '/api/account/conversations')
  ensure(response.status() === 200, '真实隔离账号会话列表可读')
  const { items } = await response.json()
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const failed of [true, false]) {
      const item = items.find(
        (row) => row.title === (failed ? 'R13浏览器·恢复失败' : 'R13浏览器·正常完成'),
      )
      ensure(!!item, '存在已由后台确认的终态会话')
      await page.goto(base + '/ai/' + item.id)
      await page.waitForFunction(
        () =>
          document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
            ?.isHydrating === false,
      )
      await page
        .getByText(
          failed ? '任务处理已中断，请重新提交。' : 'R13后台验证回答：公式可以继续学习。',
          { exact: false },
        )
        .first()
        .waitFor()
      ensure(await page.locator('textarea').isEditable(), width + ':终态后允许输入下一轮')
      ensure(
        (await page.getByRole('button', { name: '停止生成', exact: true }).count()) === 0,
        width + ':终态不显示运行中停止操作',
      )
      ensure(
        await page.evaluate(() => document.documentElement.scrollWidth === innerWidth),
        width + ':无横向溢出',
      )
    }
  }
  return { mode: 'real isolated API/PostgreSQL; mock model', passed: checks.length, checks }
}
