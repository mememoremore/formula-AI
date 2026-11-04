import { test } from 'vitest'
import assert from 'node:assert/strict'
import { authenticationClientIP } from '../server/auth/client-ip'
import { createObjectStore } from '../server/storage/object-store'

test('auth only accepts a single valid proxy IP when explicitly trusted', () => {
  assert.equal(authenticationClientIP('10.0.0.2', '1.2.3.4', false), '10.0.0.2')
  assert.equal(authenticationClientIP('10.0.0.2', '1.2.3.4', true), '1.2.3.4')
  for (const value of ['1.2.3.4, 5.6.7.8', 'spoofed', '', undefined])
    assert.equal(authenticationClientIP('10.0.0.2', value, true), '10.0.0.2')
  assert.equal(authenticationClientIP('10.0.0.2', '2001:db8::1', true), '2001:db8::1')
})

test('S3 HTTP permission is opt-in and restricted to the isolated storage origin', () => {
  const previous = process.env.FORMULA_STORAGE_INTERNAL_HTTP
  const config = {
    region: 'us-east-1',
    bucket: 'test',
    accessKeyId: 'test',
    secretAccessKey: 'test',
  }
  try {
    delete process.env.FORMULA_STORAGE_INTERNAL_HTTP
    assert.throws(() => createObjectStore({ ...config, endpoint: 'http://storage:8333' }))
    process.env.FORMULA_STORAGE_INTERNAL_HTTP = 'true'
    assert.doesNotThrow(() => createObjectStore({ ...config, endpoint: 'http://storage:8333' }))
    for (const endpoint of [
      'http://example.com:8333',
      'http://storage:8334',
      'http://storage.evil:8333',
      'ftp://storage:8333',
    ])
      assert.throws(() => createObjectStore({ ...config, endpoint }))
    assert.doesNotThrow(() => createObjectStore({ ...config, endpoint: 'https://s3.example.com' }))
  } finally {
    if (previous === undefined) delete process.env.FORMULA_STORAGE_INTERNAL_HTTP
    else process.env.FORMULA_STORAGE_INTERNAL_HTTP = previous
  }
})
