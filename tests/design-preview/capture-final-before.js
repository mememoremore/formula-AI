async function captureFinalBefore(page) {
  const results = []
  await page.context().addCookies([
    { name: 'r10-final', value: 'completed', url: 'http://127.0.0.1:3200' },
    { name: 'r10-run', value: 'r10-before', url: 'http://127.0.0.1:3200' },
  ])
  for (const width of [320, 390, 430, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 })
    for (const [name, route] of [
      ['导出', '/exports/r10-export'],
      ['帮助', '/help'],
      ['反馈', '/feedback'],
      ['关于', '/about'],
      ['404', '/r10-missing'],
    ]) {
      await page.goto('http://127.0.0.1:3200' + route, { waitUntil: 'domcontentloaded' })
      await page.waitForTimeout(350)
      await page.screenshot({
        path: `docs/设计稿/R10全站收尾/修改前-${name}-${width}.png`,
        fullPage: true,
      })
      results.push({
        name,
        width,
        overflow: await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      })
    }
  }
  console.log(JSON.stringify(results))
}
