import { z } from 'zod'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getUsageLimits } from '../../../utils/queue'
import { readLimitedBody } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { resourceIdPattern } from '../../../../shared/resource-id'
import { convertFormulaCollection } from '../../../documents/collection-document'
import { reserveUsage } from '../../../database/usage'
const schema = z.object({
  versionIds: z.array(z.string().regex(resourceIdPattern)).min(1).max(20),
  format: z.enum(['editable', 'image']),
  existingDocx: z
    .string()
    .max(7 * 1024 * 1024)
    .optional(),
})
const state = globalThis as typeof globalThis & { moxiDocumentOwners?: Set<string> }
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    if (getHeader(event, 'content-type')?.split(';')[0] !== 'application/json')
      throw createError({ statusCode: 415, message: '请求格式无效。' })
    const raw = await readLimitedBody(event, 8 * 1024 * 1024)
    let input: z.infer<typeof schema>
    try {
      input = schema.parse(JSON.parse(raw.toString('utf8')))
    } catch {
      throw createError({ statusCode: 400, message: '请选择有效的公式和导出格式。' })
    }
    const db = getDatabase()
    const versions = await db.formulaVersion.findMany({
      where: { id: { in: input.versionIds }, ownerId: user.id, formula: { deletedAt: null } },
      select: { id: true, latex: true },
    })
    const ordered = input.versionIds.map((id) => versions.find((v) => v.id === id))
    if (ordered.some((v) => !v))
      throw createError({ statusCode: 404, message: '公式不存在或当前账号无法访问。' })
    const owners = (state.moxiDocumentOwners ??= new Set())
    if (owners.has(user.id) || owners.size >= 2)
      throw createError({ statusCode: 429, message: '正在生成文档，请稍后重试。' })
    const existing = input.existingDocx ? Buffer.from(input.existingDocx, 'base64') : undefined
    if (existing && (!existing.length || existing.length > 5 * 1024 * 1024))
      throw createError({ statusCode: 413, message: '追加的 Word 文档不能超过5MB。' })
    owners.add(user.id)
    try {
      let document: Buffer
      try {
        document = await convertFormulaCollection(
          ordered.map((v) => v!.latex),
          input.format,
          existing,
        )
      } catch {
        throw createError({
          statusCode: 422,
          message: '文档或公式无法转换，请检查公式语法；追加时请选择有效的 DOCX 文档。',
        })
      }
      await db.$transaction((tx) => reserveUsage(tx, user.id, 'EXPORT', getUsageLimits().EXPORT))
      setResponseHeader(event, 'Cache-Control', 'private, no-store')
      setResponseHeader(
        event,
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )
      setResponseHeader(
        event,
        'Content-Disposition',
        'attachment; filename="moxi-formulas.docx"; filename*=UTF-8\'\'' +
          encodeURIComponent('墨析公式.docx'),
      )
      return document
    } finally {
      owners.delete(user.id)
    }
  }),
)
