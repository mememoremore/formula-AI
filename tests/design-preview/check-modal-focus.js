async function checkModalFocus(page) {
  await page.waitForFunction(
    () =>
      document.querySelector('#__nuxt')?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating ===
      false,
  )
  await page.getByRole('button', { name: /编辑公式/ }).click()
  await page.getByRole('dialog').waitFor()
  const opened = await page.evaluate(() => ({
    inside: !!document.activeElement?.closest('dialog'),
    locked: getComputedStyle(document.documentElement).overflow,
  }))
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'hidden' })
  return {
    opened,
    closed: await page.evaluate(() => ({
      focus: document.activeElement?.outerHTML.slice(0, 300),
      locked: getComputedStyle(document.documentElement).overflow,
    })),
  }
}
