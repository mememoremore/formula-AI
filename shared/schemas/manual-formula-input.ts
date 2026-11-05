import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'
import { manualFormulaFeedback } from '../formula-validation'

/** Unknown fields are stripped, as the existing parsers only return named fields. No coercion. */
export const manualFormulaRawInputSchema = z
  .object(
    {
      title: z.string(),
      latex: z.string(),
      requestKey: z.string().regex(resourceIdPattern),
    },
    { error: '请求内容无效。' },
  )
  // Transform only runs after every structural check succeeds, including the request ID.
  .transform((input, context) => {
    const message = manualFormulaFeedback(input.title, input.latex)
    if (message) {
      context.addIssue({ code: 'custom', message })
      return z.NEVER
    }
    return input
  })

/** New submissions normalize; recovery receipts validate without rewriting the original request. */
export const manualFormulaInputSchema = manualFormulaRawInputSchema.transform((input) => ({
  requestKey: input.requestKey.toLowerCase(),
  title: input.title.trim(),
  latex: input.latex.trim(),
}))
