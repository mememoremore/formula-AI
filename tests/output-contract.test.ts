import { test, expect, vi } from 'vitest'
import * as formulaValidation from '../shared/formula-validation'
import { parseExplanation, decodeExplanation } from '../shared/explanation'
import { explanationFixture as value } from './fixtures/explanation'
import { parseProfileUpdate } from '../server/services/profile-input'

test('explanation preserves legacy text and optional undefined while rejecting nested unknown fields', () => {
  const original = {
    ...value,
    summary: ' 原文\n',
    steps: [{ title: 'A', text: 'B', latex: undefined }],
  }
  expect(parseExplanation(original)).toEqual(original)
  for (const invalid of [
    { ...value, symbols: [{ latex: 'x', meaning: 'x', extra: 1 }] },
    { ...value, steps: [{ title: 'A', text: 'B', extra: 1 }] },
    { ...value, steps: [{ title: 'A', text: 'B', latex: null }] },
    { ...value, summary: '<b>x</b>' },
    { ...value, summary: 'x\0' },
    { ...value, summary: '😀'.repeat(601) },
  ])
    expect(() => parseExplanation(invalid)).toThrow('解释结构不完整或包含无法安全展示的内容。')
})
test('explanation keeps raw JSON failure categories and total serialized size bound', () => {
  expect(() => decodeExplanation('x'.repeat(16001))).toThrow('解释超过长度限制。')
  expect(() => decodeExplanation('{')).toThrow('解释不是完整JSON，请重新生成。')
  expect(() => decodeExplanation('null')).toThrow('解释结构不完整或包含无法安全展示的内容。')
  const oversized = {
    ...value,
    summary: 'x'.repeat(1200),
    symbols: [],
    conditions: Array(8).fill('x'.repeat(500)),
    warnings: Array(8).fill('x'.repeat(500)),
    examples: Array(2).fill('x'.repeat(800)),
    steps: Array(6).fill({ title: 'x'.repeat(100), text: 'x'.repeat(800) }),
  }
  expect(() => parseExplanation(oversized)).toThrow('解释结构不完整或包含无法安全展示的内容。')
})
test('profile keeps omission/null distinct and normalizes only nickname', () => {
  expect(parseProfileUpdate({ name: ' 😀 ', avatar: undefined, extra: 1 })).toEqual({ name: '😀' })
  expect(parseProfileUpdate({ name: ' x ', avatar: null })).toEqual({ name: 'x', avatar: null })
  expect(parseProfileUpdate({ name: 'x\n', avatar: 'data:image/png;base64,AA==' })).toEqual({
    name: 'x',
    avatar: 'data:image/png;base64,AA==',
  })
  for (const input of [null, [], 'x'])
    expect(() => parseProfileUpdate(input)).toThrow('资料格式无效。')
  expect(() => parseProfileUpdate({ name: 1, avatar: false })).toThrow(
    '昵称需要包含 1～100 个字符。',
  )
  expect(() => parseProfileUpdate({ name: '😀'.repeat(51) })).toThrow(
    '昵称需要包含 1～100 个字符。',
  )
  expect(() =>
    parseProfileUpdate({ name: 'x', avatar: 'https://private-fixture.test/image' }),
  ).toThrow('头像格式无效，请重新选择 JPEG 或 PNG 图片。')
})

test('invalid explanation structure never invokes specialized formula rendering', () => {
  const validate = vi.spyOn(formulaValidation, 'formulaSyntaxFeedback').mockImplementation(() => {
    throw new Error('must not render')
  })
  try {
    expect(() => parseExplanation({ ...value, conditions: Array(9).fill('x') })).toThrow(
      '解释结构不完整或包含无法安全展示的内容。',
    )
    expect(validate).not.toHaveBeenCalled()
  } finally {
    validate.mockRestore()
  }
})
