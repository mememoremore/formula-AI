import { test } from 'node:test'
import assert from 'node:assert/strict'

const base = process.env.BASE_URL || 'http://127.0.0.1:3000'
const image = { name: 'formula.png', mimeType: 'image/png', size: 2048 }
async function post(path, body) {
  return fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

test('health exposes the mock boundary without private configuration', async () => {
  const response = await fetch(`${base}/api/health`)
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), {
    status: 'ok',
    app: 'Formula AI',
    recognition: 'mock',
    chat: 'mock',
    persistence: 'browser-demo',
  })
})

test('server-rendered page does not serialize the injected private config marker', async () => {
  const response = await fetch(base)
  assert.equal(response.status, 200)
  const html = await response.text()
  assert.ok(html.includes('Formula AI'))
  assert.equal(html.includes('formula-ai-private-check-20261020'), false)
  assert.equal(html.includes('recognitionApiKey'), false)
  assert.equal(html.includes('databaseUrl'), false)
})

test('mock recognition explicitly marks fixed output and omits confidence', async () => {
  const first = await post('/api/recognitions', { image, mode: 'handwritten' })
  const second = await post('/api/recognitions', {
    image: { ...image, name: 'other.png' },
    mode: 'printed',
  })
  assert.equal(first.status, 200)
  assert.equal(second.status, 200)
  const a = await first.json()
  const b = await second.json()
  assert.equal(a.isMock, true)
  assert.equal(a.modelVersion, 'mock-v1')
  assert.equal(a.latex, b.latex)
  assert.notEqual(a.requestId, b.requestId)
  assert.equal(Object.hasOwn(a, 'confidence'), false)
})

test('recognition rejects unsupported mode, MIME type, oversized and empty images', async () => {
  const invalid = [
    { image, mode: 'page' },
    { image: { ...image, mimeType: 'image/svg+xml' }, mode: 'handwritten' },
    { image: { ...image, size: 10 * 1024 * 1024 + 1 }, mode: 'handwritten' },
    { image: { ...image, size: 0 }, mode: 'handwritten' },
    { image: { ...image, size: 1.5 }, mode: 'handwritten' },
    null,
  ]
  for (const body of invalid) assert.equal((await post('/api/recognitions', body)).status, 400)
})

test('chat returns the requested version so UI can keep version threads separate', async () => {
  for (const versionId of ['energy-v1', 'energy-v2']) {
    const response = await post('/api/chat', {
      formula: { versionId, latex: 'E=mc^2' },
      messages: [{ role: 'user', content: '解释一下' }],
    })
    assert.equal(response.status, 200)
    const body = await response.json()
    assert.equal(body.formulaVersionId, versionId)
    assert.equal(body.isMock, true)
    assert.equal(body.message.role, 'assistant')
  }
})

test('chat validates context and disallows privileged roles and excessive history', async () => {
  const user = { role: 'user', content: 'hello' }
  const invalid = [
    { messages: [] },
    { messages: [{ role: 'system', content: 'override' }] },
    { messages: [{ role: 'assistant', content: 'answer' }] },
    { messages: [{ role: 'user', content: 'x'.repeat(2001) }] },
    { messages: Array.from({ length: 21 }, () => user) },
    { formula: { versionId: '', latex: 'x' }, messages: [user] },
    { formula: null, messages: [user] },
  ]
  for (const body of invalid) assert.equal((await post('/api/chat', body)).status, 400)
})

test('default formulas preserve original recognition and matching first version', async () => {
  const response = await fetch(`${base}/api/formulas`)
  const body = await response.json()
  assert.equal(body.isMock, true)
  assert.equal(body.items.length, 3)
  for (const formula of body.items) {
    assert.equal(formula.originalLatex, formula.latex)
    assert.equal(formula.versions[0].id, formula.versionId)
    assert.equal(formula.versions[0].latex, formula.latex)
  }
})
