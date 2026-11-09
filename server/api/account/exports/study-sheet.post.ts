import { z } from 'zod'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getObjectStore } from '../../../utils/storage'
import { getUsageLimits } from '../../../utils/queue'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { reserveUsage } from '../../../database/usage'
import { resourceIdPattern } from '../../../../shared/resource-id'
import { studySheetDocument, type StudyFormula } from '../../../documents/study-sheet'
import { docxMimeType } from '../../../documents/formula-document'
import { explanationText, parseExplanation } from '../../../../shared/explanation'
import { readLearning } from '../../../database/formula-learning'
const schema = z.object({
  ids: z.array(z.string().regex(resourceIdPattern)).min(1).max(20),
  title: z.string().trim().min(1).max(100),
  includeNotes: z.boolean(),
  includeConditions: z.boolean(),
  includeImage: z.boolean(),
  includeExplanation: z.boolean(),
  includeQuestions: z.boolean().optional().default(true),
})
const state = globalThis as typeof globalThis & { moxiDocumentOwners?: Set<string> }
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event),
      input = schema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({ statusCode: 400, message: '请选择1～20条公式并填写学习清单标题。' })
    const db = getDatabase(),
      ids = [...new Set(input.data.ids)]
    const rows = await db.formula.findMany({
      where: { ownerId: user.id, id: { in: ids }, deletedAt: null },
      include: {
        learning: true,
        versions: { orderBy: { number: 'desc' }, take: 1 },
        recognitionTask: { include: { inputFile: true } },
      },
    })
    if (rows.length !== ids.length)
      throw createError({ statusCode: 404, message: '部分公式不可用或不属于当前账号。' })
    const owners = (state.moxiDocumentOwners ??= new Set())
    if (owners.has(user.id) || owners.size >= 2)
      throw createError({ statusCode: 429, message: '正在生成文档，请稍后重试。' })
    owners.add(user.id)
    try {
      const formulas: StudyFormula[] = []
      for (const id of ids) {
        const row = rows.find((f) => f.id === id)!,
          version = row.versions[0]
        if (!version) throw createError({ statusCode: 422, message: '公式缺少可用版本。' })
        const learning = await readLearning(db, user.id, row.id)
        const value: StudyFormula = { title: row.title, latex: version.latex }
        value.mastery = learning.mastery === 'MASTERED' ? '已掌握' : '不熟悉'
        if (learning.mastery === 'UNFAMILIAR') value.masteryNotes = learning.masteryNotes
        if (input.data.includeQuestions) value.questions = learning.questions
        if (input.data.includeNotes) {
          value.notes = learning?.notes
        }
        if (input.data.includeConditions) value.conditions = learning?.conditions
        const image = row.recognitionTask?.inputFile
        if (input.data.includeImage && image) {
          if (image.status !== 'READY')
            throw createError({
              statusCode: 409,
              message: '部分原图暂时不可用，请取消原图选项后重试。',
            })
          value.image = await getObjectStore().get(image.objectKey)
        }
        if (input.data.includeExplanation) {
          const conversation = await db.conversation.findFirst({
            where: { ownerId: user.id, purpose: 'EXPLANATION', formulaVersionId: version.id },
            orderBy: { createdAt: 'desc' },
            include: {
              messages: {
                where: { role: 'ASSISTANT', status: 'COMPLETED' },
                orderBy: { position: 'desc' },
                take: 1,
              },
            },
          })
          const message = conversation?.messages[0]
          if (message) {
            try {
              value.explanation = explanationText(parseExplanation(message.structuredContent))
            } catch {
              value.explanation = message.content.slice(0, 16000)
            }
          }
        }
        formulas.push(value)
      }
      let output: Buffer
      try {
        output = await studySheetDocument(input.data.title, formulas)
      } catch {
        throw createError({
          statusCode: 422,
          message: '学习清单暂时无法生成，请检查公式或减少原图后重试。',
        })
      }
      await db.$transaction((tx) => reserveUsage(tx, user.id, 'EXPORT', getUsageLimits().EXPORT))
      setResponseHeader(event, 'Content-Type', docxMimeType)
      setResponseHeader(event, 'Cache-Control', 'private, no-store')
      setResponseHeader(
        event,
        'Content-Disposition',
        "attachment; filename=study-sheet.docx; filename*=UTF-8''" +
          encodeURIComponent(input.data.title + '.docx'),
      )
      return output
    } finally {
      owners.delete(user.id)
    }
  }),
)
