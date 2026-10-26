import { testEnvironment } from './support/integration.ts'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { environmentFingerprint } from './support/test-environment.ts'

test('测试身份接口没有正确令牌时不可读取', async () => {
  for (const token of ['', 'invalid-test-token']) {
    const response = await fetch(testEnvironment.apiUrl + '/api/__test/identity', {
      headers: { 'x-formula-test-token': token },
    })
    assert.equal(response.status, 404)
  }
})
test('实际 API 身份匹配且不包含连接字符串或凭据', async () => {
  const response = await fetch(testEnvironment.apiUrl + '/api/__test/identity', {
    headers: { 'x-formula-test-token': testEnvironment.token },
  })
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'no-store')
  assert.deepEqual(await response.json(), {
    runId: testEnvironment.runId,
    fingerprint: environmentFingerprint(testEnvironment),
    providers: { chat: 'mock', recognition: 'mock' },
  })
})
test('Vite 不能通过文件系统地址提供测试清单及 Compose 凭据', async () => {
  for (const file of [
    process.env.FORMULA_TEST_MANIFEST!,
    process.env.FORMULA_TEST_MANIFEST!.replace('environment.json', 'compose.env'),
  ]) {
    const response = await fetch(testEnvironment.apiUrl + '/@fs/' + file.replaceAll('\\', '/'))
    assert.ok([403, 404].includes(response.status), '敏感测试文件必须被拒绝')
    const body = await response.text()
    assert.equal(body.includes(testEnvironment.token), false)
    assert.equal(body.includes(testEnvironment.storage.secretAccessKey), false)
  }
})
