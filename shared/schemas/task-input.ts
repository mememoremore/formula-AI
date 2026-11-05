import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'
import { normalizeOptionalFormulaTitle, optionalFormulaTitleFeedback } from '../formula-title'

const id = z.string().regex(resourceIdPattern)
export const recognitionTaskInputSchema = z.object({
  fileId: id,
  requestKey: id,
  mode: z.enum(['handwritten', 'printed']),
  requestedTitle: z
    .string()
    .nullish()
    .transform(normalizeOptionalFormulaTitle)
    .refine((value) => !optionalFormulaTitleFeedback(value ?? '')),
})
export const conversationInputSchema = z.object({ formulaVersionId: id.nullable(), requestKey: id })
export const chatTurnInputSchema = z.object({
  question: z.string().refine((value) => !!value.trim() && value.length <= 2000),
  requestKey: id,
})
export const explanationInputSchema = z.object({ versionId: id, requestKey: id })
export const exportInputSchema = z.object({ formulaVersionId: id, requestKey: id })
// History cursors deliberately remain strings here; ownership/404 checks belong to database queries.
export const recognitionHistoryInputSchema = z
  .object({
    cursor: z.string().optional(),
    q: z
      .string()
      .refine((value) => value.length <= 200 && !value.includes('\0'))
      .optional(),
  })
  .transform(({ cursor, q }) => ({ cursor, q: q?.trim() ?? '' }))
export const conversationListInputSchema = z
  .object({
    q: z
      .string({ error: '搜索关键词不能超过100字。' })
      .refine((value) => value.length <= 100, { error: '搜索关键词不能超过100字。' })
      .optional(),
    cursor: z.string({ error: '分页参数无效。' }).optional(),
  })
  .transform(({ q, cursor }) => ({ q: q?.trim(), cursor }))
