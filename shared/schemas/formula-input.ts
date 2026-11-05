import { z } from 'zod'
import { resourceIdPattern } from '../resource-id'

const editMessage = '请填写有效的名称、LaTeX 和编辑版本。'
const expectedTitleMessage = '保存需要编辑时的原标题（expectedTitle），请刷新页面后重新编辑。'
// Preserve raw UTF-16 length and raw expectedTitle. Trimming it would change conflict detection.
const editText = (max: number, error: string) =>
  z.string({ error }).refine((value) => value.trim().length > 0 && value.length <= max, { error })
export const formulaEditInputSchema = z.object(
  {
    expectedTitle: editText(100, expectedTitleMessage),
    latex: editText(5000, editMessage),
    title: editText(100, editMessage),
    expectedVersionId: z.string().regex(resourceIdPattern),
  },
  { error: editMessage },
)
export const formulaFavoriteInputSchema = z.object({ favorite: z.boolean() })
export type FormulaEditPayload = z.output<typeof formulaEditInputSchema>
export type FormulaFavoritePayload = z.output<typeof formulaFavoriteInputSchema>
