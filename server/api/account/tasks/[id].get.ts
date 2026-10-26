import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getQueue } from '../../../utils/queue'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readRecognitionTask, reconcileTask } from '../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    await reconcileTask(getDatabase(), await getQueue(), 'recognition', user.id, id)
    return readRecognitionTask(getDatabase(), user.id, id)
  }),
)
