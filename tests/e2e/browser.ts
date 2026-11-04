import { expect } from '@playwright/test'
import { readTestOtp } from '../support/registration-mail'
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

/** Complete the real OTP UI using only the isolated test mailbox. */
export async function verifyRegistration(page: Page, email: string) {
  const input = page.getByPlaceholder('请输入 6 位验证码')
  await expect(input).toBeVisible()
  await input.fill(readTestOtp(email))
  const signedIn = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === '/api/auth/sign-in/email' &&
      response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: '验证并登录', exact: true }).click()
  expect((await signedIn).status()).toBe(200)
  await expect(page).not.toHaveURL((url) => url.pathname === '/login')
}
