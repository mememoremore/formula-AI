import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { removeCategory } from '../../../database/library-mutations'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    return removeCategory(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
