import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { removeCategory } from '../../../database/library-mutations'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    return removeCategory(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
