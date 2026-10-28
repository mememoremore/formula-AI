import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readVersionContext } from '../../../database/conversations'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    return readVersionContext(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
