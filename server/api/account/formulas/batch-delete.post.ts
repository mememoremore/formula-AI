import { formulaBatchDeleteSchema } from '../../../../shared/schemas/formula-input'
import { deleteFormulaBatch } from '../../../database/formula-batch-mutations'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = formulaBatchDeleteSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({ statusCode: 400, message: '请选择1～100条有效的公式。' })
    return deleteFormulaBatch(getDatabase(), user.id, input.data.ids)
  }),
)
