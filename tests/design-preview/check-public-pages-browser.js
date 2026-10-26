async function inspectPublicPages(page) {
  const observations = []
  const paths = [
    '/',
    '/library?space=demo',
    '/ai?space=demo',
    '/profile?space=demo',
    '/upload?space=demo',
    '/ai/new?space=demo',
    '/login',
    '/settings',
    '/help',
    '/feedback',
    '/about',
  ]
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 844 })
    for (const path of paths) {
      await page.goto('http://127.0.0.1:3200' + path)
      await page.locator('.app-shell').waitFor()
      await page.waitForLoadState('networkidle')
      const metrics = await page.evaluate(() => ({
        path: location.pathname,
        shell: document.querySelector('.app-shell').getBoundingClientRect().width,
        scrollWidth: document.documentElement.scrollWidth,
        images: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
        nav: !!document.querySelector('.bottom-nav'),
      }))
      observations.push({ width, requested: path, ...metrics })
      if (path === '/' && width === 390) {
        await page.evaluate(() => document.fonts.ready)
        await page.screenshot({ path: 'docs/设计稿/R3布局导航/真实首页390.png' })
      }
    }
  }
  return {
    inspected: observations.length,
    overflow: observations.filter((item) => item.scrollWidth > item.width),
    unexpectedWidth: observations.filter((item) => item.shell !== Math.min(item.width, 480)),
    missingImages: observations.filter((item) => !item.images),
    observations,
  }
}
