import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { test, before, after } from 'node:test'
import { setTimeout as delay } from 'node:timers/promises'
import { createRecognitionAdapter } from '../server/recognition/factory'
import { readRecognitionSettings } from '../server/recognition/settings'
import { InferenceFailure } from '../server/inference/failure'
import { withInferenceDeadline } from '../server/inference/deadline'

const input = {
  image: Buffer.from('fixture-image-bytes'),
  mimeType: 'image/png',
  mode: 'printed' as const,
  requestId: 'fixture-task',
}
let status = 200
let malformed = ''
let stall = false
let calls = 0
let received: { image: string; mode: string; authorization: string; requestId: string } | undefined
let override: Record<string, unknown> = {}
const server = createServer(async (request, response) => {
  calls++
  const chunks: Buffer[] = []
  for await (const chunk of request) chunks.push(Buffer.from(chunk))
  const parsed = await new Response(Buffer.concat(chunks), {
    headers: { 'content-type': request.headers['content-type']! },
  }).formData()
  const image = parsed.get('image') as File
  received = {
    image: await image.text(),
    mode: String(parsed.get('mode')),
    authorization: String(request.headers.authorization),
    requestId: String(request.headers['x-request-id']),
  }
  response.writeHead(status, { 'content-type': 'application/json' })
  response.flushHeaders()
  if (stall) return
  response.end(
    status === 200
      ? malformed ||
          JSON.stringify({
            requestId: request.headers['x-request-id'],
            latex: '\\frac{1}{2}',
            modelVersion: 'fixture@sha256',
            ...override,
          })
      : JSON.stringify({ detail: 'raw-private-model-error' }),
  )
})
let serviceUrl = ''
before(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  serviceUrl = `http://127.0.0.1:${address.port}`
})
after(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
function adapter() {
  return createRecognitionAdapter({
    NUXT_RECOGNITION_PROVIDER: 'python',
    NUXT_RECOGNITION_SERVICE_URL: serviceUrl,
    NUXT_RECOGNITION_API_KEY: 'fixture-private-key-for-testing',
  })
}
test('真实HTTP发送图片、模式、鉴权及稳定任务编号，结果标记为非模拟', async () => {
  const result = await adapter().recognize(input)
  assert.deepEqual(result, {
    requestId: input.requestId,
    latex: '\\frac{1}{2}',
    modelVersion: 'fixture@sha256',
    isMock: false,
  })
  assert.deepEqual(received, {
    image: 'fixture-image-bytes',
    mode: 'printed',
    authorization: 'Bearer fixture-private-key-for-testing',
    requestId: input.requestId,
  })
})
test('mock模式保持可用，python缺配置时不回退模拟', async () => {
  assert.equal((await createRecognitionAdapter({}).recognize(input)).isMock, true)
  assert.throws(
    () => createRecognitionAdapter({ NUXT_RECOGNITION_PROVIDER: 'python' }),
    InferenceFailure,
  )
})
test('无效服务类型、URL凭据、查询参数及空白密钥在启动时拒绝', () => {
  const valid = {
    NUXT_RECOGNITION_PROVIDER: 'python',
    NUXT_RECOGNITION_API_KEY: 'fixture-private-key-for-testing',
    NUXT_RECOGNITION_SERVICE_URL: serviceUrl,
  }
  for (const invalid of [
    { NUXT_RECOGNITION_PROVIDER: 'unknown' },
    { NUXT_RECOGNITION_SERVICE_URL: 'file:///model' },
    { NUXT_RECOGNITION_SERVICE_URL: 'http://user:secret@localhost' },
    { NUXT_RECOGNITION_SERVICE_URL: `${serviceUrl}?key=private` },
    { NUXT_RECOGNITION_API_KEY: 'short' },
  ])
    assert.throws(() => readRecognitionSettings({ ...valid, ...invalid }), InferenceFailure)
})
test('永久失败和临时故障分别分类，每次只调用一次，不暴露原始错误', async () => {
  for (const [code, expected, retryable] of [
    [401, 'CONFIGURATION', false],
    [422, 'INVALID_INPUT', false],
    [429, 'RATE_LIMIT', true],
    [503, 'UPSTREAM', true],
  ] as const) {
    status = code
    const count = calls
    await assert.rejects(
      adapter().recognize(input),
      (error) =>
        error instanceof InferenceFailure &&
        error.code === expected &&
        error.retryable === retryable &&
        !error.message.includes('private'),
    )
    assert.equal(calls - count, 1)
  }
  status = 200
})
test('错误任务编号、空公式、超长、文档和缺失模型版本不得保存为成功', async () => {
  for (const invalid of [
    { requestId: 'other-task' },
    { latex: '' },
    { latex: 'x'.repeat(5001) },
    { latex: '\\documentclass{article}' },
    { modelVersion: '' },
  ]) {
    override = invalid
    await assert.rejects(
      adapter().recognize(input),
      (error) => error instanceof InferenceFailure && !error.retryable,
    )
  }
  override = {}
})
test('JSON损坏和响应超过32KiB时明确失败', async () => {
  for (const body of ['invalid-json', 'x'.repeat(40 * 1024)]) {
    malformed = body
    await assert.rejects(
      adapter().recognize(input),
      (error) => error instanceof InferenceFailure && !error.retryable,
    )
  }
  malformed = ''
})
test('统一期限可取消正在读取的Python响应', async () => {
  stall = true
  await assert.rejects(
    withInferenceDeadline((signal) => adapter().recognize(input, signal), undefined, 100),
    (error) => error instanceof InferenceFailure && error.code === 'TIMEOUT',
  )
  stall = false
})
test('外部取消保持原因，预先取消不发送请求', async () => {
  const controller = new AbortController()
  const reason = new Error('fixture-cancel')
  stall = true
  const pending = adapter().recognize(input, controller.signal)
  await delay(40)
  controller.abort(reason)
  await assert.rejects(pending, (error) => error === reason)
  stall = false
  const count = calls
  await assert.rejects(adapter().recognize(input, controller.signal), (error) => error === reason)
  assert.equal(calls, count)
})
