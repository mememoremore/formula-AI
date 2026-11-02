import { test } from 'node:test'
import assert from 'node:assert/strict'
import { testEnvironment } from './support/integration'
test('指标入口可采集、错误状态准确且不泄漏请求标识或动态路由', async () => {
  const rejected = await fetch(
    testEnvironment.apiUrl + '/api/account/formulas/private-probe?secret=private-query',
  )
  assert.equal(rejected.status, 401)
  const requestId = rejected.headers.get('x-request-id')!
  await rejected.body?.cancel()
  const response = await fetch(testEnvironment.apiUrl + '/api/metrics')
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type') ?? '', /text\/plain/)
  const text = await response.text()
  assert.match(text, /formula_http_requests_total\{[^\n]*status="401"/)
  assert.ok(text.includes('/api/account/formulas/:id'))
  for (const value of [requestId, 'private-probe', 'private-query', 'traceId', 'ownerId'])
    assert.ok(!text.includes(value))
})
