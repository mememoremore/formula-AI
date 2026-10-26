import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { getUsageLimits } from '../../utils/queue'
import { readUsage } from '../../database/usage'
import { workspaceOperation } from '../../utils/workspace-operation'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    return readUsage(getDatabase(), user.id, getUsageLimits())
  }),
)
