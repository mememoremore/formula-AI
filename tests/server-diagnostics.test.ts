import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import {
  diagnostic,
  withDiagnostics,
  identifyDiagnosticAccount,
  safeDiagnosticCode,
  type DiagnosticFields,
} from '../server/diagnostics/operations'

test('诊断只输出安全白名单，不输出owner原文、错误、URL和额外字段', () => {
  const lines: string[] = []
  const original = console.info
  console.info = (value) => {
    lines.push(String(value))
  }
  const ownerId = randomUUID(),
    requestId = randomUUID()
  try {
    withDiagnostics({ requestId, operation: 'upload' }, () => {
      identifyDiagnosticAccount(ownerId)
      diagnostic('resource.lease', {
        leaseId: randomUUID(),
        code: 'secret-error-message',
        fileId: 'https://private.example/secret',
        prompt: 'secret-prompt',
        apiKey: 'secret-key',
      } as unknown as DiagnosticFields)
    })
  } finally {
    console.info = original
  }
  const row = JSON.parse(lines[0]!)
  assert.equal(row.requestId, requestId)
  assert.match(row.ownerRef, /^[a-f0-9]{16}$/)
  assert.equal(row.ownerId, undefined)
  assert.equal(row.code, undefined)
  assert.equal(row.fileId, undefined)
  assert.ok(!lines.join('').includes('secret'))
  assert.ok(!lines.join('').includes(ownerId))
})
test('并发HTTP/Worker异步上下文互不串号', async () => {
  const lines: string[] = []
  const original = console.info
  console.info = (value) => {
    lines.push(String(value))
  }
  const a = randomUUID(),
    b = randomUUID()
  let release!: () => void
  const gate = new Promise<void>((r) => (release = r))
  try {
    await Promise.all([
      withDiagnostics({ requestId: a, taskId: randomUUID() }, async () => {
        await gate
        diagnostic('worker.attempt', { outcome: 'returned' })
      }),
      withDiagnostics({ requestId: b }, async () => {
        diagnostic('http.operation', { outcome: 'returned' })
        release()
      }),
    ])
  } finally {
    console.info = original
  }
  const rows = lines.map((v) => JSON.parse(v))
  assert.equal(rows.find((r) => r.event === 'http.operation').requestId, b)
  assert.equal(rows.find((r) => r.event === 'worker.attempt').requestId, a)
  assert.equal(rows.find((r) => r.event === 'http.operation').taskId, undefined)
})
test('错误只分类可信码，日志输出故障不改变业务返回', () => {
  assert.equal(safeDiagnosticCode({ code: 'P2034', message: 'private' }), 'P2034')
  assert.equal(safeDiagnosticCode({ code: 'private-secret' }), 'UNCLASSIFIED')
  assert.equal(safeDiagnosticCode({ statusCode: 401 }), 'REQUEST_REJECTED')
  const original = console.info
  console.info = () => {
    throw new Error('broken sink')
  }
  try {
    assert.doesNotThrow(() => diagnostic('queue.connection', { code: 'QUEUE_UNAVAILABLE' }))
  } finally {
    console.info = original
  }
})
test('连接池基础设施错误脱离旧请求上下文，不能误归属旧账号', () => {
  const lines: string[] = []
  const original = console.info
  console.info = (v) => {
    lines.push(String(v))
  }
  try {
    withDiagnostics({ requestId: randomUUID(), ownerId: randomUUID() }, () =>
      diagnostic('queue.connection', { code: 'QUEUE_UNAVAILABLE' }, { inheritContext: false }),
    )
  } finally {
    console.info = original
  }
  const row = JSON.parse(lines[0]!)
  assert.equal(row.requestId, undefined)
  assert.equal(row.ownerRef, undefined)
})
test('新HTTP/任务入口可显式清空父作用域，继承只发生在明确的子步骤', () => {
  const original = console.info,
    lines: string[] = []
  console.info = (v) => {
    lines.push(String(v))
  }
  try {
    withDiagnostics({ ownerId: randomUUID(), requestId: randomUUID() }, () =>
      withDiagnostics({ taskId: randomUUID() }, () => diagnostic('worker.attempt'), {
        inheritContext: false,
      }),
    )
  } finally {
    console.info = original
  }
  const row = JSON.parse(lines[0]!)
  assert.equal(row.ownerRef, undefined)
  assert.equal(row.requestId, undefined)
  assert.ok(row.taskId)
})
