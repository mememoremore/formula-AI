import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { recognitionBatchRetrySchema } from '../../../../../shared/schemas/recognition-batch'
import {
  resumeRecognitionBatch,
  readRecognitionBatch,
} from '../../../../database/recognition-batches'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event),
      id = getRouterParam(event, 'id') ?? ''
    const input = recognitionBatchRetrySchema.safeParse(await readWorkspaceJson(event))
    if (!input.success) throw createError({ statusCode: 400, message: '请重新读取批次后重试。' })
    await resumeRecognitionBatch(getDatabase(), user.id, id, input.data.failed)
    return readRecognitionBatch(getDatabase(), user.id, id)
  }),
)
