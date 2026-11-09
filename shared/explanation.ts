import { normalizeMathText } from '#shared/math-content'
import { formulaExplanationSchema, type FormulaExplanation } from './schemas/explanation'
export type { FormulaExplanation } from './schemas/explanation'
export const EXPLANATION_PROMPT_VERSION = 'formula-explanation-v1'
export const EXPLANATION_QUESTION = '请结构化解释这个固定版本公式。'
export function explanationQuestion(domain?: string) {
  return domain
    ? EXPLANATION_QUESTION +
        '\n用户指定的公式所属领域：' +
        domain +
        '\n请结合该领域解释符号、适用条件、推导和应用；如公式与领域不符，请明确说明，不要强行套用。'
    : EXPLANATION_QUESTION
}
/** The same bounded schema validates model output, stored history and SSE content. */
export function parseExplanation(value: unknown): FormulaExplanation {
  const result = formulaExplanationSchema.safeParse(value)
  if (!result.success) throw new Error('解释结构不完整或包含无法安全展示的内容。')
  return result.data
}
export function decodeExplanation(raw: string) {
  if (raw.length > 16000) throw new Error('解释超过长度限制。')
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    throw new Error('解释不是完整JSON，请重新生成。')
  }
  const parsed = parseExplanation(value)
  return parseExplanation({
    ...parsed,
    summary: normalizeMathText(parsed.summary),
    symbols: parsed.symbols.map((item) => ({ ...item, meaning: normalizeMathText(item.meaning) })),
    conditions: parsed.conditions.map(normalizeMathText),
    steps: parsed.steps.map((item) => ({
      ...item,
      title: normalizeMathText(item.title),
      text: normalizeMathText(item.text),
    })),
    examples: parsed.examples.map(normalizeMathText),
    warnings: parsed.warnings.map(normalizeMathText),
  })
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
