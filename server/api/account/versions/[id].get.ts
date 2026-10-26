import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readVersionContext } from '../../../database/conversations'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    return readVersionContext(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
