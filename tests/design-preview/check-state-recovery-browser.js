async function checkStateRecovery(page) {
  const base = 'http://127.0.0.1:3200',
    checks = [],
    suffix = Date.now().toString(36)
  const key = 'formula-ai:recognition-recovery:v1'
  const ensure = (ok, name) => {
    if (!ok) throw Error(name)
    checks.push(name)
  }
  await page.addInitScript(() => {
    const nativeIdle = window.requestIdleCallback.bind(window)
    const nativeGet = Storage.prototype.getItem
    window.__r11Get = nativeGet
    window.__r11Idles = []
    window.__r11Blocked = sessionStorage.getItem('r11-case') === 'idle'
    window.requestIdleCallback = (callback) => {
      if (!window.__r11Blocked) return nativeIdle(callback)
      window.__r11Idles.push(callback)
      return window.__r11Idles.length
    }
    if (sessionStorage.getItem('r11-case') === 'read-error')
      Storage.prototype.getItem = function (key) {
        if (key === 'formula-ai:recognition-recovery:v1')
          throw Error('controlled storage read failure')
        return nativeGet.call(this, key)
      }
  })
  async function hydrate() {
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt
          ?.isHydrating === false,
    )
  }
  async function ready() {
    await page.waitForFunction(
      () =>
        document.querySelector('#__nuxt').__vue_app__.config.globalProperties.$nuxt.$uploadDraft
          .recoveryReady.value,
    )
  }
  async function mode(value) {
    await page.context().addCookies([{ name: 'r7-recognition', value, url: base }])
  }
  async function debug() {
    return page.evaluate(async () => (await fetch('/api/__r7debug')).json())
  }
  async function uncertain(name) {
    await page.goto(base + '/about')
    await page.evaluate(() => {
      sessionStorage.removeItem('r11-case')
      sessionStorage.removeItem('formula-ai:recognition-recovery:v1')
    })
    await page.context().clearCookies()
    await page.context().addCookies([
      { name: 'r7-recognition', value: 'failed', url: base },
      { name: 'r7-run', value: 'r7-r11-' + name + '-' + suffix, url: base },
    ])
    await page.goto(base + '/recognitions/r7-t99')
    await hydrate()
    await ready()
    await mode('submit-lost')
    await page.getByRole('button', { name: '重新提交识别', exact: true }).click()
    await page.getByRole('button', { name: '确认上次重新提交', exact: true }).waitFor()
    ensure((await debug()).tasks === 1, name + '未知提交已有一个任务')
    await mode('failed')
  }
  await uncertain('idle')
  const stored = await page.evaluate((key) => sessionStorage.getItem(key), key)
  await page.evaluate(() => sessionStorage.setItem('r11-case', 'idle'))
  await page.reload()
  await hydrate()
  ensure(
    await page.getByRole('button', { name: '重新提交识别', exact: true }).isDisabled(),
    '恢复初始化前禁止重试',
  )
  ensure(
    await page.evaluate(() => {
      try {
        document
          .querySelector('#__nuxt')
          .__vue_app__.config.globalProperties.$nuxt.$uploadDraft.putReceipt({
            ownerId: 'r7-owner',
            fileId: 'other',
            mode: 'printed',
            requestKey: 'new',
          })
        return false
      } catch {
        return true
      }
    }),
    '非UI调用也不能绕过恢复守卫',
  )
  ensure(
    (await page.evaluate((key) => sessionStorage.getItem(key), key)) === stored,
    '未就绪不覆写有效回执',
  )
  ensure((await debug()).submissions.length === 1, 'idle屏障前无新增POST')
  await page.evaluate(() => {
    window.__r11Blocked = false
    for (const callback of window.__r11Idles.splice(0))
      callback({ didTimeout: false, timeRemaining: () => 50 })
  })
  await ready()
  await mode('account')
  await page.getByRole('button', { name: '确认上次重新提交', exact: true }).click()
  await page.waitForURL('**/recognitions/r7-t1')
  let value = await debug()
  ensure(
    value.tasks === 1 &&
      value.submissions.length === 2 &&
      value.submissions[0].key === value.submissions[1].key,
    '初始化后沿用有效原键，不增加任务',
  )
  for (const failure of ['corrupt', 'read-error']) {
    await uncertain(failure)
    const original = await page.evaluate((key) => sessionStorage.getItem(key), key)
    await page.evaluate(
      ({ key, failure }) => {
        if (failure === 'corrupt') sessionStorage.setItem(key, 'broken')
        sessionStorage.setItem('r11-case', failure)
      },
      { key, failure },
    )
    await page.reload()
    await hydrate()
    await page.getByText('识别恢复记录无法安全读取', { exact: false }).waitFor()
    ensure(
      await page.getByRole('button', { name: '重新提交识别', exact: true }).isDisabled(),
      failure + '禁止再次提交',
    )
    ensure(
      await page.evaluate(() => {
        try {
          document
            .querySelector('#__nuxt')
            .__vue_app__.config.globalProperties.$nuxt.$uploadDraft.requireRecovery()
          return false
        } catch {
          return true
        }
      }),
      failure + '业务层拒绝执行',
    )
    ensure((await debug()).submissions.length === 1, failure + '没有新增POST')
    ensure(
      (await page.evaluate((key) => window.__r11Get.call(sessionStorage, key), key)) ===
        (failure === 'corrupt' ? 'broken' : original),
      failure + '不覆盖未知原记录',
    )
    if (failure === 'read-error') {
      await page.evaluate(() => sessionStorage.removeItem('r11-case'))
      await page.reload()
      await hydrate()
      await ready()
      await mode('account')
      await page.getByRole('button', { name: '确认上次重新提交', exact: true }).click()
      await page.waitForURL('**/recognitions/r7-t1')
      value = await debug()
      ensure(
        value.tasks === 1 && value.submissions[0].key === value.submissions[1].key,
        '读取权限恢复后仍沿用原键',
      )
    }
  }
  return {
    passed: checks.length,
    checks,
    mode: 'controlled HTTP and idle/storage barriers; no real model',
  }
}
