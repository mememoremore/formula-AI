import { recognitionHistoryDeleteSchema } from '../../../../shared/schemas/recognition-history'
import { deleteBatchHistory } from '../../../database/batch-history-mutations'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = recognitionHistoryDeleteSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({ statusCode: 400, message: '请选择1～100条有效的批次记录。' })
    return deleteBatchHistory(getDatabase(), user.id, input.data.ids)
  }),
)
