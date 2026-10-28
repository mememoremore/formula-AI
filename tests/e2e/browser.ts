import type { Page, TestInfo } from '@playwright/test'

export async function captureFailure(page: Page, info: TestInfo) {
  if (info.status !== info.expectedStatus)
    await page
      .screenshot({
        path: info.outputPath('failure-masked.png'),
        mask: [page.locator('input,textarea'), page.getByText(/@formula\.test/)],
      })
      .catch(() => {})
}

export async function visit(page: Page, path: string) {
  await page.goto(path)
  // SSR buttons are visible before Vue owns them. Wait for Nuxt's real hydration state,
  // rather than delaying or clicking repeatedly and accidentally submitting twice.
  await page.waitForFunction(() => {
    const root = document.querySelector('#__nuxt') as Element & {
      __vue_app__?: { config: { globalProperties: { $nuxt?: { isHydrating: boolean } } } }
    }
    return root?.__vue_app__?.config.globalProperties.$nuxt?.isHydrating === false
  })
}
