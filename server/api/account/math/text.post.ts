import { requireAccountWriter } from '../../../utils/auth'
import { readWorkspaceJson } from '../../../utils/request-body'
import { formulaToText } from '../../../documents/formula-text'
import { z } from 'zod'
export default defineEventHandler(async (event) => {
  await requireAccountWriter(event)
  const body = z
    .object({ formulas: z.array(z.string().min(1).max(5000)).min(1).max(20) })
    .parse(await readWorkspaceJson(event))
  try {
    return { text: body.formulas.map(formulaToText).join('\n') }
  } catch {
    throw createError({ statusCode: 422, message: '公式语法无法转换，请编辑后重试。' })
  }
})
