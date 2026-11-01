import assert from 'node:assert/strict'
import { createAuthentication } from '../../server/auth/config'
import { sendRegistrationCode, readTestOtp } from './registration-mail'

type Auth = ReturnType<typeof createAuthentication>
type Configuration = Parameters<typeof createAuthentication>[1]
type Database = Parameters<typeof createAuthentication>[0]
interface Options {
  body: { name: string; email: string; password: string }
  returnHeaders?: boolean
  asResponse?: boolean
}
interface Account {
  token: string
  user: { id: string; name: string; email: string; emailVerified: boolean }
}
export function createTestAuthentication(db: Database, config: Configuration) {
  return createAuthentication(db, { ...config, sendRegistrationCode })
}
export function registerVerifiedTestAccount(
  auth: Auth,
  input: Options & { asResponse: true },
): Promise<Response>
export function registerVerifiedTestAccount(
  auth: Auth,
  input: Options & { returnHeaders: true },
): Promise<{ response: Account; headers: Headers }>
export async function registerVerifiedTestAccount(auth: Auth, input: Options) {
  const registered = await auth.api.signUpEmail({ body: input.body, asResponse: true })
  assert.equal(registered.status, 200, '测试账号注册')
  assert.equal(
    registered.headers.getSetCookie().some((v) => v.includes('session_token=')),
    false,
    '验证前不得建立会话',
  )
  const { email, password } = input.body
  const verified = await auth.api.verifyEmailOTP({
    asResponse: true,
    body: { email, otp: readTestOtp(email) },
  })
  assert.equal(verified.status, 200, '测试账号邮箱验证')
  const signedIn = await auth.api.signInEmail({ body: { email, password }, asResponse: true })
  assert.equal(signedIn.status, 200, '测试账号登录')
  if (input.asResponse) return signedIn
  return { response: (await signedIn.json()) as Account, headers: signedIn.headers }
}
