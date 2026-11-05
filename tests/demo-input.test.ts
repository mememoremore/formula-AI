import { test, expect } from 'vitest'
import { demoRecognitionInputSchema, demoChatInputSchema } from '../shared/schemas/demo-input'

const image = { name: ' 公式.png ', mimeType: 'image/png', size: 2048 }
const user = { role: 'user', content: ' 原始问题 \n' }
const firstError = (
  schema: typeof demoRecognitionInputSchema | typeof demoChatInputSchema,
  input: unknown,
) => {
  const result = schema.safeParse(input)
  expect(result.success).toBe(false)
  return result.success ? '' : result.error.issues[0]?.message
}

test('demo recognition preserves raw text and numeric metadata while stripping unused fields', () => {
  expect(
    demoRecognitionInputSchema.parse({
      image: { ...image, extra: 'ignored' },
      mode: 'printed',
      extra: 1,
    }),
  ).toEqual({ image, mode: 'printed' })
  expect(
    demoRecognitionInputSchema.safeParse({
      image: { ...image, size: 10 * 1024 * 1024 },
      mode: 'printed',
    }).success,
  ).toBe(true)
})

test('demo recognition keeps root/image, mode, name, MIME and size error priority', () => {
  const cases: [unknown, string][] = [
    [null, '请提供图片信息。'],
    [{ image: [], mode: 'bad' }, '请提供图片信息。'],
    [{ image: {}, mode: 'bad' }, '识别模式无效。'],
    [{ image: {}, mode: 'printed' }, '图片名称无效。'],
    [{ image: { name: 'x' }, mode: 'printed' }, '仅支持 JPEG 和 PNG。'],
    [{ image: { ...image, size: '1' }, mode: 'printed' }, '图片大小必须在 0～10MB 之间。'],
    [{ image: { ...image, name: '😀'.repeat(128) }, mode: 'printed' }, '图片名称无效。'],
  ]
  for (const [input, message] of cases)
    expect(firstError(demoRecognitionInputSchema, input)).toBe(message)
  for (const size of [0, -1, 1.5, Infinity, NaN, 10 * 1024 * 1024 + 1])
    expect(
      firstError(demoRecognitionInputSchema, { image: { ...image, size }, mode: 'printed' }),
    ).toBe('图片大小必须在 0～10MB 之间。')
})

test('demo chat accepts legacy non-UUID context, preserves raw strings and drops unknown input', () => {
  const formula = { versionId: ' energy-v1 ', latex: ' E=mc^2 ' }
  expect(
    demoChatInputSchema.parse({
      messages: [{ ...user, extra: 1 }],
      formula: { ...formula, extra: 1 },
      responseKind: 'untrusted',
    }),
  ).toEqual({ messages: [user], formula })
  expect(demoChatInputSchema.parse({ messages: Array(20).fill(user) }).messages).toHaveLength(20)
})

test('demo chat prioritizes history count, members, final role and only then formula context', () => {
  const cases: [unknown, string][] = [
    [null, '对话需要包含 1～20 条消息。'],
    [{ messages: [], formula: null }, '对话需要包含 1～20 条消息。'],
    [{ messages: Array(21).fill(user), formula: null }, '对话需要包含 1～20 条消息。'],
    [
      { messages: [{ role: 'system', content: 'x' }], formula: null },
      '消息格式无效或超过 2000 字。',
    ],
    [
      { messages: [{ role: 'assistant', content: 'x' }], formula: null },
      '最后一条消息必须是你的提问。',
    ],
    [{ messages: [user], formula: null }, '公式版本信息无效。'],
    [{ messages: [{ ...user, content: '😀'.repeat(1001) }] }, '消息格式无效或超过 2000 字。'],
  ]
  for (const [input, message] of cases) expect(firstError(demoChatInputSchema, input)).toBe(message)
})
