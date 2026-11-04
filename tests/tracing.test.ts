import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseTraceparent, traceparent } from '../shared/trace-context'
import { traced, currentTraceparent, currentTrace } from '../server/diagnostics/tracing'
import { diagnostic } from '../server/diagnostics/operations'
import { browserTelemetry } from '../server/diagnostics/browser-telemetry'

test('W3C上下文拒绝零值、超长和无效输入', () => {
  for (const value of [
    undefined,
    '',
    'x'.repeat(500),
    '00-' + '0'.repeat(32) + '-' + '1'.repeat(16) + '-01',
    '00-' + 'a'.repeat(32) + '-' + '0'.repeat(16) + '-01',
  ])
    assert.equal(parseTraceparent(value), undefined)
  const value = { traceId: 'a'.repeat(32), spanId: 'b'.repeat(16), traceFlags: 1 }
  assert.deepEqual(parseTraceparent(traceparent(value)), value)
})
test('异步上下文隔离、队列恢复和每次attempt使用新span', async () => {
  const parents = await Promise.all(
    [1, 2].map(() =>
      traced(
        'request',
        async () => {
          await new Promise((r) => setTimeout(r, 5))
          const header = currentTraceparent()!
          const id = currentTrace()!.traceId
          await traced('child', async () => assert.equal(currentTrace()!.traceId, id))
          return header
        },
        { root: true },
      ),
    ),
  )
  assert.notEqual(parseTraceparent(parents[0])!.traceId, parseTraceparent(parents[1])!.traceId)
  const ids: string[] = []
  for (const attempt of [1, 2])
    await traced(
      'worker',
      async () => {
        assert.equal(currentTrace()!.traceId, parseTraceparent(parents[0])!.traceId)
        ids.push(currentTrace()!.spanId)
      },
      { parent: parents[0], root: true },
    )
  assert.notEqual(ids[0], ids[1])
  assert.equal(currentTrace(), undefined)
})
test('日志关联且基础设施错误不继承旧trace；失败不泄漏原始异常', async () => {
  const original = console.info,
    lines: string[] = []
  console.info = (value) => {
    lines.push(String(value))
  }
  try {
    await assert.rejects(
      traced('failure', async () => {
        diagnostic('http.operation')
        diagnostic('queue.connection', {}, { inheritContext: false })
        throw new Error('private secret')
      }),
    )
  } finally {
    console.info = original
  }
  assert.match(JSON.parse(lines[0]!).traceId, /^[a-f0-9]{32}$/)
  assert.equal(JSON.parse(lines[1]!).traceId, undefined)
  assert.ok(!lines.join('').includes('secret'))
})
test('浏览器遥测白名单删除资源冒充、正文和异常，限制数量时间', () => {
  const span = {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    name: 'POST /api/account/recognitions',
    startTimeUnixNano: String(BigInt(Date.now()) * 1000000n),
    endTimeUnixNano: String(BigInt(Date.now()) * 1000000n),
    attributes: [{ key: 'password', value: { stringValue: 'secret' } }],
    events: [{ name: 'secret' }],
    status: { code: 2, message: 'secret' },
  }
  const raw = {
    resourceSpans: [
      {
        resource: { attributes: [{ key: 'service.name', value: { stringValue: 'impostor' } }] },
        scopeSpans: [{ spans: [span] }],
      },
    ],
  }
  const safe = JSON.stringify(browserTelemetry(raw))
  assert.ok(safe.includes('formula-browser'))
  assert.ok(!safe.includes('secret') && !safe.includes('impostor'))
  assert.throws(() =>
    browserTelemetry({ resourceSpans: [{ scopeSpans: [{ spans: Array(33).fill(span) }] }] }),
  )
  assert.throws(() =>
    browserTelemetry({
      resourceSpans: [{ scopeSpans: [{ spans: [{ ...span, name: 'user secret' }] }] }],
    }),
  )
})

test('路由诊断只保留静态片段，未知ID、查询参数和客户端伪装名称不泄漏', async () => {
  const { safeRoute } = await import('../shared/trace-context')
  assert.equal(
    safeRoute('/api/account/formulas/private-email@example.com/explanations?token=private'),
    '/api/account/formulas/:id/explanations',
  )
  const span = {
    traceId: 'a'.repeat(32),
    spanId: 'b'.repeat(16),
    name: 'POST /api/account/private-secret',
    startTimeUnixNano: String(BigInt(Date.now()) * 1000000n),
    endTimeUnixNano: String(BigInt(Date.now()) * 1000000n),
  }
  assert.ok(
    !JSON.stringify(
      browserTelemetry({ resourceSpans: [{ scopeSpans: [{ spans: [span] }] }] }),
    ).includes('private-secret'),
  )
})
