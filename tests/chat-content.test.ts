import assert from 'node:assert/strict'
import { test } from 'node:test'
import { chatSegments } from '../app/utils/chat-content'
test('代码里的美元符号不解释为公式，代码与HTML保持文本', () => {
  const parts = chatSegments(
    '说明 $x^2$\n```ts\nconst s = "$not math$"; <script>bad()</script>\n```\n$$x=2$$',
  )
  assert.deepEqual(
    parts.map((p) => p.kind),
    ['text', 'math', 'text', 'code', 'text', 'math'],
  )
  assert.ok(parts[3]!.content.includes('<script>'))
})
test('未闭合流式代码保留全部内容，下一快照补全后仍是代码', () => {
  assert.equal(chatSegments('```python\nprint(1)')[0]!.content, 'print(1)')
  assert.equal(chatSegments('```python\nprint(1)\n```')[0]!.kind, 'code')
})
