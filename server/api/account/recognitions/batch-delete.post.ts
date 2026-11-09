import { recognitionHistoryDeleteSchema } from '../../../../shared/schemas/recognition-history'
import { deleteRecognitionHistory } from '../../../database/recognition-history-mutations'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = recognitionHistoryDeleteSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({ statusCode: 400, message: '请选择1～100条有效的识别记录。' })
    return deleteRecognitionHistory(getDatabase(), user.id, input.data.ids)
  }),
)
