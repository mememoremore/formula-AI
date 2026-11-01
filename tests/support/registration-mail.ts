import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { loadTestManifest } from './test-runtime'

function mailbox(email: string) {
  loadTestManifest({ FORMULA_TEST_MANIFEST: process.env.FORMULA_TEST_MANIFEST })
  const directory = join(dirname(process.env.FORMULA_TEST_MANIFEST!), 'mailbox')
  mkdirSync(directory, { recursive: true, mode: 0o700 })
  return join(
    directory,
    createHash('sha256').update(email.trim().toLowerCase()).digest('hex') + '.json',
  )
}
export function registrationMailConfigured() {
  return true
}
export async function sendRegistrationCode(email: string, otp: string) {
  writeFileSync(mailbox(email), JSON.stringify({ otp }), { mode: 0o600 })
}
export function readTestOtp(email: string): string {
  const value: unknown = JSON.parse(readFileSync(mailbox(email), 'utf8'))
  if (!value || typeof value !== 'object' || !('otp' in value) || typeof value.otp !== 'string')
    throw new Error('测试收件箱没有验证码')
  return value.otp
}
