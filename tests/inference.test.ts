import assert from 'node:assert/strict'
import { test, before, after } from 'node:test'
import { createServer } from 'node:http'
import { setTimeout as delay } from 'node:timers/promises'
import { once } from 'node:events'
import { createDeepSeekAdapter } from '../server/chat/deepseek-adapter'
import { createChatAdapter } from '../server/chat/factory'
import { readChatSettings } from '../server/chat/settings'
import { buildChatMessages } from '../server/chat/prompt'
import { withInferenceDeadline } from '../server/inference/deadline'
import { InferenceFailure, inferenceFailure } from '../server/inference/failure'
import type { ChatRequest } from '../shared/types/api'

const input: ChatRequest = {
  formula: { versionId: 'fixed-v2', latex: '\\frac{1}{2}' },
  messages: [{ role: 'user', content: '解释这个公式' }],
}
let status = 200
let stall = false
let requests = 0
let requestBody: Record<string, unknown> = {}
const server = createServer(async (request, response) => {
  requests++
  let data = ''
  for await (const chunk of request) data += String(chunk)
  requestBody = JSON.parse(data)
  if (status !== 200) {
    response.writeHead(status, { 'content-type': 'application/json' })
    response.end(JSON.stringify({ error: { message: 'secret-upstream-credential' } }))
    return
  }
  response.writeHead(200, { 'content-type': 'text/event-stream' })
  response.flushHeaders()
  if (stall) return
  for (const delta of [
    { reasoning_content: 'private-reasoning' },
    { content: '这是分式：' },
    { content: '$\\frac{1}{2}$。' },
  ]) {
    response.write(
      `data: ${JSON.stringify({ id: 'fixture', object: 'chat.completion.chunk', model: 'fixture-model', choices: [{ index: 0, delta, finish_reason: null }] })}\n\n`,
    )
    await delay(15)
  }
  response.end(
    `data: ${JSON.stringify({ id: 'fixture', choices: [{ index: 0, delta: {}, finish_reason: 'stop' }] })}\n\ndata: [DONE]\n\n`,
  )
})
let baseURL = ''
before(async () => {
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  baseURL = `http://127.0.0.1:${address.port}`
})
after(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})
function adapter() {
  return createDeepSeekAdapter({
    provider: 'deepseek',
    model: 'fixture-model',
    apiKey: 'fixture-key',
    baseURL,
  })
}
async function collect(signal = new AbortController().signal) {
  let content = ''
  let finish = ''
  for await (const chunk of adapter().stream(input, signal)) {
    content += chunk.text
    finish = chunk.finishReason ?? finish
  }
  return { content, finish }
}
test('LangChain实际HTTP分块只收正文，不暴露思考内容；发送固定版本和系统规则', async () => {
  const result = await collect()
  assert.deepEqual(result, { content: '这是分式：$\\frac{1}{2}$。', finish: 'stop' })
  assert.equal(requestBody.stream, true)
  assert.deepEqual(requestBody.thinking, { type: 'disabled' })
  assert.equal(requestBody.max_tokens, 2048)
  const messages = requestBody.messages as { role: string; content: string }[]
  assert.equal(messages[0]?.role, 'system')
  assert.ok(messages[0]?.content.includes('fixed-v2'))
  assert.ok(messages[0]?.content.includes('\\frac{1}{2}'))
})
test('401不可重试，供应商错误和密钥不进入安全错误', async () => {
  status = 401
  const before = requests
  await assert.rejects(
    collect(),
    (error) =>
      error instanceof InferenceFailure && !error.retryable && !error.message.includes('secret'),
  )
  assert.equal(requests - before, 1)
  status = 200
})
test('429可由队列重试，LangChain和HTTP不额外重试', async () => {
  status = 429
  const before = requests
  await assert.rejects(
    collect(),
    (error) => error instanceof InferenceFailure && error.code === 'RATE_LIMIT' && error.retryable,
  )
  assert.equal(requests - before, 1)
  status = 200
})
test('503只尝试一次，交由持久化队列控制总重试次数', async () => {
  status = 503
  const before = requests
  await assert.rejects(collect(), (error) => error instanceof InferenceFailure && error.retryable)
  assert.equal(requests - before, 1)
  status = 200
})
test('真实流传输可被超时信号取消', async () => {
  stall = true
  await assert.rejects(
    withInferenceDeadline(collect, undefined, 120),
    (error) => error instanceof InferenceFailure && error.code === 'TIMEOUT',
  )
  stall = false
})
test('外部取消保持原因，不误当成可重试供应商故障', async () => {
  stall = true
  const controller = new AbortController()
  const reason = new Error('fixture-cancelled')
  const pending = withInferenceDeadline(collect, controller.signal)
  await delay(40)
  controller.abort(reason)
  await assert.rejects(pending, (error) => error === reason)
  stall = false
})
test('调用前已取消时不启动供应商请求', async () => {
  const controller = new AbortController()
  controller.abort(new Error('cancel-before-start'))
  let called = false
  await assert.rejects(
    withInferenceDeadline(async () => {
      called = true
    }, controller.signal),
  )
  assert.equal(called, false)
})
test('显式DeepSeek模式缺少密钥会失败，不回退模拟', async () => {
  const selected = createChatAdapter({
    NUXT_AI_PROVIDER: 'deepseek',
    NUXT_AI_MODEL: 'deepseek-flash',
  })
  assert.equal(selected.isMock, false)
  await assert.rejects(
    async () => {
      for await (const _ of selected.stream(input, new AbortController().signal)) {
        /* drain */
      }
    },
    (error) => error instanceof InferenceFailure && !error.retryable,
  )
})
test('模拟模式明确标记，不需要模型密钥', () => {
  assert.equal(createChatAdapter({}).isMock, true)
})
test('不接受无效服务类型、模型名称和不安全服务地址', () => {
  for (const settings of [
    { provider: 'unknown' },
    { model: 'bad\nmodel' },
    { baseURL: 'http://remote.invalid' },
    { baseURL: 'https://user:password@api.deepseek.com' },
  ])
    assert.throws(() => readChatSettings(settings), InferenceFailure)
})
test('历史上下文有字符预算，不截断成孤立助手消息', () => {
  const messages = buildChatMessages({
    messages: [
      { role: 'user', content: '旧问题' },
      { role: 'assistant', content: 'x'.repeat(21000) },
      { role: 'user', content: '最新问题' },
    ],
  })
  assert.deepEqual(
    messages.map((message) => message.role),
    ['system', 'user'],
  )
  assert.equal(messages.at(-1)?.content, '最新问题')
})
test('输入、账户与服务错误映射为稳定分类', () => {
  assert.equal(inferenceFailure({ status: 422 }).code, 'INVALID_INPUT')
  assert.equal(inferenceFailure({ status: 402 }).retryable, false)
  assert.equal(inferenceFailure(new Error('raw-secret')).message.includes('raw-secret'), false)
})
