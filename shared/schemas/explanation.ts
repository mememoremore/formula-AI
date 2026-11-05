import { z } from 'zod'
import { formulaSyntaxFeedback } from '../formula-validation'

const text = (max: number) =>
  z
    .string()
    .refine(
      (value) =>
        !!value.trim() &&
        value.length <= max &&
        !/[\u0000-\u0008\u000b\u000c\u000e-\u001f]|<[^>]*>/.test(value),
    )
// Check count before traversing untrusted rows; SSE/DB callers may already hold parsed objects.
const rows = <Row extends z.ZodType>(row: Row, max: number) =>
  z.custom<unknown[]>((value) => Array.isArray(value) && value.length <= max).pipe(z.array(row))
export const formulaExplanationSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    summary: text(1200),
    symbols: rows(z.strictObject({ latex: text(500), meaning: text(300) }), 12),
    conditions: rows(text(500), 8),
    steps: rows(
      z.strictObject({ title: text(100), text: text(800), latex: text(500).optional() }),
      6,
    ),
    examples: rows(text(800), 2),
    warnings: rows(text(500), 8),
  })
  .transform((value, context) => {
    // All structural/length checks precede the more expensive specialized math validation.
    const math = [
      ...value.symbols.map((row) => row.latex),
      ...value.steps.flatMap((row) => (row.latex === undefined ? [] : [row.latex])),
    ]
    if (
      math.some((latex) => !!formulaSyntaxFeedback(latex)) ||
      JSON.stringify(value).length > 16000
    ) {
      context.addIssue({ code: 'custom', message: '解释结构不完整或包含无法安全展示的内容。' })
      return z.NEVER
    }
    return value
  })
export type FormulaExplanation = z.output<typeof formulaExplanationSchema>
