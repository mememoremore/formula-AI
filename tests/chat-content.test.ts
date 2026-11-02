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

test('截图里的裸 LaTeX 例子兼容显示，长公式独立成行', () => {
  const first = String.raw`取 x=0：f(0)=\sin^{2}0+\cos^{2}0=0+1=1`
  const second = String.raw`取 x=\frac{\pi}{4}：f\left(\frac{\pi}{4}\right)=\left(\frac{\sqrt{2}}{2}\right)^2+\left(\frac{\sqrt{2}}{2}\right)^2=1`
  assert.equal(chatSegments(first).filter((p) => p.kind === 'math').length, 1)
  const parts = chatSegments(second)
  assert.deepEqual(
    parts.filter((p) => p.kind === 'math').map((p) => p.content),
    [String.raw`x=\frac{\pi}{4}`, second.split('：')[1]],
  )
  assert.equal(parts.at(-1)?.display, true)
  assert.equal(parts.map((p) => p.content).join(''), second)
})

test('裸公式兼容不猜测代码、英文、路径、货币或半截流式公式', () => {
  for (const value of [
    String.raw`使用命令 \frac`,
    String.raw`C:\sqrt\image.png`,
    String.raw`the formula is \sin x`,
    String.raw`\frac{1}{`,
    String.raw`\left(\frac{1}{2}`,
    String.raw`$\frac{1}{2}`,
    String.raw`\(\sin x`,
    String.raw`价格 \$5 和 10 元`,
    '`' + String.raw`\frac{1}{2}` + '`',
    '```latex\n' + String.raw`\frac{1}{2}` + '\n```',
    String.raw`无效 \unknown{a}`,
  ])
    assert.equal(
      chatSegments(value).some((p) => p.kind === 'math'),
      false,
      value,
    )
  const value = String.raw`中文 $\frac{1}{2}$ 与 \(\sin x\) 和 $$x=1$$`
  assert.equal(chatSegments(value).filter((p) => p.kind === 'math').length, 3)
})
