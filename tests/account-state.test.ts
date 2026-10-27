import assert from 'node:assert/strict'
import { test } from 'node:test'
import { authProfileViolation } from '../server/auth/profile-policy'
import { privateAccountKey } from '../app/utils/account-state'
test('默认资料入口保留昵称，头像和账号保护字段明确拒绝', () => {
  assert.equal(authProfileViolation('/update-user', { name: '同学' }), null)
  for (const name of [null, 42, {}, [], ' '])
    assert.ok(authProfileViolation('/update-user', { name }))
  for (const patch of [
    { image: 'https://evil.test/avatar.png' },
    { image: null },
    { avatar: 'avatars/other/x.webp' },
    { emailVerified: true },
    { id: 'other' },
    { email: 'other@test.invalid' },
  ])
    assert.ok(authProfileViolation('/update-user', patch))
  assert.ok(
    authProfileViolation('/sign-up/email', {
      email: 'a@test.invalid',
      image: 'https://evil.test/a.png',
    }),
  )
  assert.equal(
    authProfileViolation('/sign-up/email', {
      email: 'a@test.invalid',
      name: '同学',
      password: 'test-only',
    }),
    null,
  )
  assert.equal(authProfileViolation('/sign-in/email', { email: 'a@test.invalid' }), null)
})
test('私有缓存清理保留 Session、公开数据和独立本机演示', () => {
  for (const key of [
    'account-library-library-a',
    'saved-formula-id-a',
    'draft-context-a',
    'chat-formula-picker-a',
    'home-recent',
  ])
    assert.equal(privateAccountKey(key), true, key)
  for (const key of ['account-session', 'demo-store', 'public-formulas', 'page-origins'])
    assert.equal(privateAccountKey(key), false, key)
})
