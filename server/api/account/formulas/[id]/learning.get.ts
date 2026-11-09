import { requireAccountReader } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readLearning } from '../../../../database/formula-learning'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountReader(event)
    return readLearning(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
