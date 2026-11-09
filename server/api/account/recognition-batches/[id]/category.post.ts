import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { categorizeBatchResults } from '../../../../database/recognition-batches'
import { recognitionBatchCategorySchema } from '../../../../../shared/schemas/recognition-batch'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = recognitionBatchCategorySchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({ statusCode: 400, message: '请选择批次内的公式与分类。' })
    return categorizeBatchResults(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      input.data.ids,
      input.data.categoryId,
    )
  }),
)
