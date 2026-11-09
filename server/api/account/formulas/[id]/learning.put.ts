import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { saveLearning } from '../../../../database/formula-learning'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    return saveLearning(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      await readWorkspaceJson(event, 256 * 1024),
    )
  }),
)
