import test from 'node:test'
import assert from 'node:assert/strict'
import { resourcePolicy } from '../server/resources/policy'
import { cleanupAgeEligible } from '../server/resources/cleanup'
test('R12默认资源策略有界且单位明确，非法配置拒绝执行', () => {
  const p = resourcePolicy({})
  assert.equal(p.ownerBytes, 128 * 1024 * 1024)
  assert.equal(p.globalBytes, 8 * 1024 ** 3)
  assert.equal(p.ownerUploads, 1)
  assert.equal(p.globalUploads, 2)
  assert.equal(p.ownerRecognitions, 2)
  assert.equal(p.globalRecognitions, 16)
  for (const value of ['0', '-1', 'NaN', '1.1', 'Infinity'])
    assert.throws(() => resourcePolicy({ FORMULA_RESOURCE_OWNER_BYTES: value }))
})
test('PENDING不凭年龄删除；普通对象24h、批量头像7天宽限', () => {
  assert.equal(
    cleanupAgeEligible({ kind: 'IMAGE', status: 'PENDING', updatedAt: new Date(0) }),
    false,
  )
  assert.equal(
    cleanupAgeEligible(
      { kind: 'IMAGE', status: 'READY', updatedAt: new Date(0) },
      24 * 3600000 - 1,
    ),
    false,
  )
  assert.equal(
    cleanupAgeEligible({ kind: 'IMAGE', status: 'READY', updatedAt: new Date(0) }, 24 * 3600000),
    true,
  )
  assert.equal(
    cleanupAgeEligible({ kind: 'AVATAR', status: 'READY', updatedAt: new Date(0) }, 24 * 3600000),
    false,
  )
})

test('有界正文读取真实终止超时流，并拒绝分块超额/空内容', async () => {
  const { Readable } = await import('node:stream')
  const { readBoundedStream } = await import('../server/resources/body')
  const stalled = new Readable({ read() {} })
  // 测试保持事件循环存活；生产 HTTP socket 本身维持存活。
  const keepAlive = setInterval(() => {}, 1000)
  try {
    await assert.rejects(readBoundedStream(stalled, 10, 20), /TIMEOUT/)
    assert.equal(stalled.destroyed, true)
  } finally {
    clearInterval(keepAlive)
  }
  await assert.rejects(
    readBoundedStream(Readable.from([Buffer.alloc(6), Buffer.alloc(5)]), 10, 1000),
    /TOO_LARGE/,
  )
  await assert.rejects(readBoundedStream(Readable.from([]), 10, 1000), /EMPTY/)
  assert.equal(
    (await readBoundedStream(Readable.from([Buffer.from('abc')]), 3, 1000)).toString(),
    'abc',
  )
})
