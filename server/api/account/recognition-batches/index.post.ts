import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { recognitionBatchInputSchema } from '../../../../shared/schemas/recognition-batch'
import { createRecognitionBatch, readRecognitionBatch } from '../../../database/recognition-batches'
import { getUsageLimits } from '../../../utils/queue'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = recognitionBatchInputSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({
        statusCode: 400,
        message: input.error.issues[0]?.message ?? '批次内容无效。',
      })
    const id = await createRecognitionBatch(
      getDatabase(),
      user.id,
      input.data,
      getUsageLimits().RECOGNITION,
    )
    setResponseStatus(event, 201)
    return readRecognitionBatch(getDatabase(), user.id, id)
  }),
)
