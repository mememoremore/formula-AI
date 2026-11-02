import test from 'node:test'
import assert from 'node:assert/strict'
import { browserErrorSummary, browserErrorGate } from '../app/utils/browser-errors'
import { parseBrowserErrors } from '../server/diagnostics/browser-errors'
const parent = '00-' + 'a'.repeat(32) + '-' + 'b'.repeat(16) + '-01'
test('前端异常摘要排除message/stack/URL查询，保留静态代码位置', () => {
  const error = new TypeError('private-password-and-email')
  error.stack =
    'TypeError: private-password-and-email\n at fn (http://localhost:3000/_nuxt/app-abc123.js?token=private:12:34)'
  const value = browserErrorSummary(
    'window',
    error,
    'http://localhost:3000/ai/private-user-id?secret=private',
  )
  assert.equal(value.errorName, 'TypeError')
  assert.equal(value.asset, 'app-abc123.js')
  assert.equal(value.line, 12)
  assert.equal(value.column, 34)
  assert.equal(value.route, '/ai/:id')
  assert.ok(!JSON.stringify(value).includes('private'))
  const foreign = browserErrorSummary('window', error, 'http://localhost:3000/', {
    filename: 'https://private.example/secret.js',
    line: 1,
    column: 2,
  })
  assert.equal(foreign.asset, undefined)
  assert.equal(foreign.line, undefined)
})
test('相同错误一分钟去重并限制每分钟最多20个，时间窗口恢复', () => {
  const admit = browserErrorGate()
  assert.equal(admit('same', 1000), true)
  assert.equal(admit('same', 1001), false)
  for (let n = 0; n < 19; n++) assert.equal(admit('key' + n, 1002), true)
  assert.equal(admit('overflow', 1003), false)
  assert.equal(admit('same', 62000), true)
})
test('服务端只接收有界异常摘要，不接受失效事件或伪造类别', () => {
  const event = {
    ...browserErrorSummary('promise', new Error('private'), 'http://localhost:3000/upload'),
    traceparent: parent,
    message: 'private',
    stack: 'private',
  }
  const parsed = parseBrowserErrors({ events: [event] })[0]!
  assert.ok(!JSON.stringify(parsed).includes('private'))
  assert.match(parsed.fingerprint, /^[a-f0-9]{64}$/)
  for (const input of [
    { events: [] },
    { events: Array(11).fill(event) },
    { events: [{ ...event, kind: 'private' }] },
    { events: [{ ...event, time: '2000-01-01' }] },
    { events: [{ ...event, traceparent: 'private' }] },
  ])
    assert.throws(() => parseBrowserErrors(input))
})
