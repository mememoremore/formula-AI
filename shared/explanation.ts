import { formulaSyntaxFeedback } from '#shared/formula-validation'
export const EXPLANATION_PROMPT_VERSION = 'formula-explanation-v1'
export const EXPLANATION_QUESTION = '请结构化解释这个固定版本公式。'
export interface FormulaExplanation {
  schemaVersion: 1
  summary: string
  symbols: { latex: string; meaning: string }[]
  conditions: string[]
  steps: { title: string; text: string; latex?: string }[]
  examples: string[]
  warnings: string[]
}
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v)
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' &&
  v.trim().length > 0 &&
  v.length <= max &&
  !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<[^>]*>/.test(v)
const keys = (v: Record<string, unknown>, allowed: string[]) =>
  Object.keys(v).every((k) => allowed.includes(k))
/** 对模型和SSE都进行相同的有界运行时校验；不执行HTML，也不修复半份JSON。 */
export function parseExplanation(value: unknown): FormulaExplanation {
  const fail = () => {
    throw new Error('解释结构不完整或包含无法安全展示的内容。')
  }
  if (
    !record(value) ||
    !keys(value, [
      'schemaVersion',
      'summary',
      'symbols',
      'conditions',
      'steps',
      'examples',
      'warnings',
    ]) ||
    value.schemaVersion !== 1 ||
    !text(value.summary, 1200)
  )
    return fail()
  for (const [field, maxCount, maxLength] of [
    ['conditions', 8, 500],
    ['examples', 2, 800],
    ['warnings', 8, 500],
  ] as const) {
    const rows = value[field]
    if (!Array.isArray(rows) || rows.length > maxCount || !rows.every((v) => text(v, maxLength)))
      return fail()
  }
  const math = (v: unknown): v is string => text(v, 500) && !formulaSyntaxFeedback(v)
  if (
    !Array.isArray(value.symbols) ||
    value.symbols.length > 12 ||
    !value.symbols.every(
      (v) => record(v) && keys(v, ['latex', 'meaning']) && math(v.latex) && text(v.meaning, 300),
    )
  )
    return fail()
  if (
    !Array.isArray(value.steps) ||
    value.steps.length > 6 ||
    !value.steps.every(
      (v) =>
        record(v) &&
        keys(v, ['title', 'text', 'latex']) &&
        text(v.title, 100) &&
        text(v.text, 800) &&
        (v.latex === undefined || math(v.latex)),
    )
  )
    return fail()
  if (JSON.stringify(value).length > 16000) return fail()
  return value as unknown as FormulaExplanation
}
export function decodeExplanation(raw: string) {
  if (raw.length > 16000) throw new Error('解释超过长度限制。')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('解释不是完整JSON，请重新生成。')
  }
  return parseExplanation(value)
}
/** 唯一兼容文本派生规则，同时用于旧客户端和后续Prompt，不另存第二份可变答案。 */
export function explanationText(value: FormulaExplanation) {
  return [
    value.summary,
    ...value.symbols.map((v) => '$' + v.latex + '$：' + v.meaning),
    ...value.conditions.map((v) => '适用条件：' + v),
    ...value.steps.map((v) => v.title + '：' + v.text + (v.latex ? '\n$$' + v.latex + '$$' : '')),
    ...value.examples.map((v) => '例子：' + v),
    ...value.warnings.map((v) => '注意：' + v),
  ].join('\n\n')
}
