import { z } from 'zod'
import { requireAccountWriter } from '../../../utils/auth'
import { readWorkspaceJson } from '../../../utils/request-body'
import { formulaClipboardImage } from '../../../documents/formula-clipboard-image'

export default defineEventHandler(async (event) => {
  await requireAccountWriter(event)
  const input = z
    .object({ formulas: z.array(z.string().trim().min(1).max(5000)).min(1).max(20) })
    .safeParse(await readWorkspaceJson(event))
  if (!input.success)
    throw createError({ statusCode: 400, message: '请选择1～20条公式，每条不能超过5000字符。' })
  try {
    const png = await formulaClipboardImage(input.data.formulas)
    setResponseHeader(event, 'Content-Type', 'image/png')
    setResponseHeader(event, 'Cache-Control', 'private, no-store')
    return png
  } catch {
    throw createError({
      statusCode: 422,
      message: '公式暂时无法生成图片，请检查公式或减少选择后重试。',
    })
  }
})
