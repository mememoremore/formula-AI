import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getQueue } from '../../../utils/queue'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readExportTask, reconcileTask } from '../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    await reconcileTask(getDatabase(), await getQueue(), 'export', user.id, id)
    return readExportTask(getDatabase(), user.id, id)
  }),
)
