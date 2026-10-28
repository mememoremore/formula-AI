/** 使用事先准备的R1临时账号；没有Worker消费，不发起模型调用。 */
async function checkChatProtocol(page) {
  const base = 'http://127.0.0.1:3100'
  const checks = []
  const ensure = (ok, label) => {
    if (!ok) throw new Error(label)
    checks.push(label)
  }
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    const key = () => page.evaluate(() => crypto.randomUUID())
    const response = await page.request.post(base + '/api/account/conversations', {
      headers: { origin: base },
      data: { formulaVersionId: null, requestKey: await key() },
    })
    ensure(response.status() === 200, width + ':实际发送前创建受控测试会话')
    const c = await response.json()
    const submitted = await page.request.post(
      base + `/api/account/conversations/${c.id}/messages`,
      {
        headers: { origin: base },
        data: { question: 'R14浏览器排队与停止验收', requestKey: await key() },
      },
    )
    ensure(submitted.status() === 202, width + ':保留202任务契约')
    const connected = page.waitForRequest((r) =>
      r.url().includes(`/conversations/${c.id}/events?protocol=2`),
    )
    await page.goto(base + '/ai/' + c.id)
    await connected
    checks.push(width + ':浏览器实际建立v2 EventSource')
    const stop = page.getByRole('button', { name: '停止生成', exact: true })
    await stop.waitFor()
    const stopped = page.waitForResponse(
      (r) => r.url().includes('/cancel') && r.request().method() === 'POST',
    )
    await stop.click()
    const terminal = await (await stopped).json()
    ensure(
      terminal.protocolVersion === 2 && BigInt(terminal.revision) > 1n,
      width + ':停止响应带权威修订号',
    )
    await page.getByText('已停止生成。', { exact: false }).first().waitFor()
    ensure(await page.locator('textarea').isEditable(), width + ':停止后可继续输入')
    ensure((await stop.count()) === 0, width + ':停止后不回退为处理中')
    await page.reload()
    await page.getByText('已停止生成。', { exact: false }).first().waitFor()
    // SSR已展示终态时，草稿插件仍可能在客户端初始化；等待可交互状态而非固定延时。
    await page.waitForFunction(() => document.querySelector('textarea')?.disabled === false)
    ensure(await page.locator('textarea').isEditable(), width + ':刷新恢复终态')
    ensure(
      await page.evaluate(() => document.documentElement.scrollWidth === innerWidth),
      width + ':无横向溢出',
    )
  }
  return {
    mode: 'real R1 API/PostgreSQL, queued tasks only, no model calls',
    passed: checks.length,
    checks,
  }
}
