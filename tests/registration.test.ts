import { testEnvironment } from './support/integration'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { createDatabaseClient } from '../server/database/client'
import { createAuthentication } from '../server/auth/config'

test('注册验证阻止伪造身份、错误验证码、重发旧码和重用，并兼容旧账号', async () => {
  const config = testEnvironment
  const db = createDatabaseClient(config.databaseUrl)
  const created: string[] = []
  try {
    const sent = new Map<string, string>()
    const auth = createAuthentication(db, {
      secret: config.authSecret,
      baseURL: 'http://localhost:3100',
      isDevelopment: true,
      sendRegistrationCode: async (email, otp) => {
        sent.set(email, otp)
      },
    })
    const address = `new-${randomUUID()}@example.test`
    const legacy = `old-${randomUUID()}@example.test`
    created.push(address, legacy)
    const password = 'testing-password-123'
    async function post(path: string, body: Record<string, unknown>) {
      return auth.handler(
        new Request('http://localhost:3100/api/auth' + path, {
          method: 'POST',
          headers: { origin: 'http://localhost:3100', 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }),
      )
    }
    const signUp = await post('/sign-up/email', {
      email: address,
      name: 'Test user',
      password,
      emailVerified: true,
    })
    assert.equal(signUp.status, 200, 'signup')
    assert.ok(sent.get(address), 'OTP sent')
    assert.equal(
      (await db.user.findUniqueOrThrow({ where: { email: address } })).emailVerified,
      false,
      'client cannot claim verification',
    )
    assert.equal(
      signUp.headers.getSetCookie().some((cookie) => cookie.includes('session_token=')),
      false,
      'signup does not create a session',
    )
    assert.equal(
      (await post('/sign-in/email', { email: address, password })).status,
      403,
      'new unverified account blocked',
    )
    assert.equal(
      (await post('/sign-in/email', { email: address, password: 'wrong-password' })).status,
      401,
      'wrong password does not reveal verification state',
    )
    assert.notEqual(
      (await post('/email-otp/verify-email', { email: address, otp: 'abcdef' })).status,
      200,
      'wrong OTP rejected',
    )
    const firstOtp = sent.get(address)
    assert.equal(
      (
        await post('/email-otp/send-verification-otp', {
          email: address,
          type: 'email-verification',
        })
      ).status,
      200,
      'resend',
    )
    assert.notEqual(
      (await post('/email-otp/verify-email', { email: address, otp: firstOtp })).status,
      200,
      'old OTP invalid after resend',
    )
    assert.equal(
      (await post('/email-otp/verify-email', { email: address, otp: sent.get(address) })).status,
      200,
      'correct OTP accepted',
    )
    assert.equal(
      (await post('/sign-in/email', { email: address, password })).status,
      200,
      'verified account can login',
    )
    assert.notEqual(
      (await post('/email-otp/verify-email', { email: address, otp: sent.get(address) })).status,
      200,
      'OTP cannot be reused',
    )
    assert.equal(
      (await post('/sign-up/email', { email: legacy, name: 'Legacy user', password })).status,
      200,
    )
    const old = await db.user.findUniqueOrThrow({ where: { email: legacy } })
    await db.authVerification.deleteMany({
      where: { identifier: 'formula:registration-verification:' + old.id },
    })
    assert.equal(
      (await post('/sign-in/email', { email: legacy, password })).status,
      200,
      'existing unverified account remains usable',
    )
  } finally {
    await db.user.deleteMany({ where: { email: { in: created } } })
    await db.$disconnect()
  }
})
