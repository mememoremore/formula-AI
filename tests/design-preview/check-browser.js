async function checkDesignSample(page) {
  const checks = []
  const ensure = (condition, name) => {
    if (!condition) throw new Error(name)
    checks.push(name)
  }
  const unexpected = []
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.mouse.move(0, 0)
  for (const [width, height, layout] of [
    [390, 844, 'centered'],
    [320, 740, 'centered'],
    [1440, 1500, 'centered'],
    [1440, 1500, 'wide'],
  ]) {
    await page.setViewportSize({ width, height })
    await page.goto('http://127.0.0.1:3200/__preview' + (layout === 'wide' ? '?layout=wide' : ''))
    await page.locator('.sample-card').first().waitFor()
    await page.waitForLoadState('networkidle')
    await page.evaluate(async () => {
      window.scrollTo(0, 0)
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    })
    unexpected.push(
      ...(await page.evaluate(() =>
        performance
          .getEntriesByType('resource')
          .map((entry) => entry.name)
          .filter((url) => !url.startsWith(location.origin) || url.includes('/api/')),
      )),
    )
    const metrics = await page.evaluate(() => ({
      width: innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      frame: document.querySelector('.sample-frame').getBoundingClientRect().width,
      images: [...document.images].every((img) => img.complete && img.naturalWidth > 0),
      formulaScrollable: [...document.querySelectorAll('.math-formula')].some(
        (el) => el.scrollWidth > el.clientWidth,
      ),
      tokens: ['--app-width', '--radius-card', '--radius-control'].map((key) =>
        getComputedStyle(document.documentElement).getPropertyValue(key).trim(),
      ),
    }))
    ensure(metrics.scrollWidth <= width, `${width}/${layout}: 无整页横向溢出`)
    ensure(metrics.images, `${width}/${layout}: 图片实际加载`)
    ensure(metrics.frame <= (layout === 'wide' ? 1080 : 480), `${width}/${layout}: 容器范围正确`)
    ensure(metrics.tokens.join(',') === '480px,22px,15px', `${width}/${layout}: 兼容 Token 生效`)
    if (width <= 390) ensure(metrics.formulaScrollable, `${width}: 长公式内部横向滚动`)
    const path =
      width === 390
        ? '移动端完整样板'
        : width === 1440
          ? layout === 'wide'
            ? '桌面自适应完整样板'
            : '桌面480居中样板'
          : null
    if (path) await page.screenshot({ path: `docs/设计稿/R2设计系统/${path}.png`, fullPage: true })
  }
  await page.getByRole('button', { name: '查看解释' }).click()
  await page.getByRole('dialog').waitFor({ state: 'visible' })
  ensure(
    (await page.getByRole('dialog').getAttribute('aria-labelledby')) !== null,
    '弹窗有可访问名称',
  )
  await page.screenshot({ path: 'docs/设计稿/R2设计系统/弹窗样板.png' })
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('dialog').open)
  ensure(
    await page
      .getByRole('button', { name: '查看解释' })
      .evaluate((el) => el === document.activeElement),
    'Esc 关闭且焦点返回触发控件',
  )
  ensure(await page.getByRole('button', { name: '尚未选择' }).isDisabled(), '禁用按钮不可交互')
  ensure(await page.getByRole('button', { name: '正在保存' }).isDisabled(), '加载按钮禁止重复提交')
  await page.getByLabel('笔记名称').focus()
  await page.keyboard.press('Tab')
  const focus = await page.locator('#error-example').evaluate((el) => ({
    active: el === document.activeElement,
    outline: getComputedStyle(el).outlineWidth,
  }))
  ensure(focus.active && parseFloat(focus.outline) >= 3, '键盘输入焦点清晰可见')
  await page.locator('#error-example').fill('我的公式')
  ensure(
    (await page.locator('#error-example').getAttribute('aria-invalid')) === 'false',
    '修正输入后错误状态清除',
  )
  await page.getByRole('button', { name: '保存笔记' }).click()
  await page.locator('.toast').waitFor({ state: 'visible' })
  ensure((await page.locator('.toast').textContent()).includes('已保存'), '保存操作产生状态反馈')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  ensure(
    await page
      .locator('.busy-indicator')
      .evaluate((el) => getComputedStyle(el).animationName === 'none'),
    '减少动画偏好生效',
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  ensure(unexpected.length === 0, '样板没有业务 API 或外部网络请求')
  const visualMetrics = await page.evaluate(async () => {
    const rgb = (value) =>
      value
        .match(/[\d.]+/g)
        .slice(0, 3)
        .map(Number)
    const luminance = (values) =>
      values
        .map((value) => {
          const v = value / 255
          return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
        })
        .reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0)
    const contrast = (a, b) => {
      const x = luminance(a),
        y = luminance(b)
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
    }
    const pairs = [
      ...document.querySelectorAll('.badge-success,.badge-warning,.badge-danger,.badge-info'),
    ].map((el) => {
      const s = getComputedStyle(el)
      return contrast(rgb(s.color), rgb(s.backgroundColor))
    })
    pairs.push(
      contrast(
        rgb(getComputedStyle(document.querySelector('.sample-copy')).color),
        [255, 255, 255],
      ),
    )
    const primary = getComputedStyle(document.querySelector('.button-primary'))
    for (const match of primary.backgroundImage.matchAll(/rgb\(([^)]+)\)/g))
      pairs.push(contrast(rgb(primary.color), rgb('rgb(' + match[1] + ')')))
    const probe = document.createElement('div')
    probe.className = 'app-shell'
    probe.style.cssText = 'position:fixed;left:-9999px;width:300px;visibility:hidden'
    probe.innerHTML =
      '<div class="page-content"><div class="section"></div><div class="stack"></div><div class="section-heading"></div></div>'
    document.body.append(probe)
    const compatibility = [
      getComputedStyle(probe.querySelector('.page-content')).paddingTop,
      getComputedStyle(probe.querySelector('.section')).marginTop,
      getComputedStyle(probe.querySelector('.stack')).gap,
      getComputedStyle(probe.querySelector('.section-heading')).marginBottom,
    ]
    probe.remove()
    const images = await Promise.all(
      ['/images/home-paper.svg', '/images/library-paper.svg', '/images/default-avatar.svg'].map(
        (src) =>
          new Promise((resolve) => {
            const image = new Image()
            image.onload = () => resolve(image.naturalWidth > 0)
            image.onerror = () => resolve(false)
            image.src = src
          }),
      ),
    )
    return { minimumTextContrast: Math.min(...pairs), compatibility, images }
  })
  ensure(
    visualMetrics.minimumTextContrast >= 4.5,
    '样板正文、状态文字与主按钮渐变端点对比度至少 4.5:1',
  )
  ensure(
    visualMetrics.compatibility.join(',') === '28px,30px,16px,16px',
    '合并覆盖后原页面关键间距计算值保留',
  )
  ensure(visualMetrics.images.every(Boolean), '三张原创 SVG 均经浏览器实际解码')
  return { passed: checks.length, checks, unexpected, visualMetrics }
}
