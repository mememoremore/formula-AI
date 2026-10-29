import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getQueue } from '../../../utils/queue'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readRecognitionTask, reconcileTask } from '../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    await reconcileTask(getDatabase(), await getQueue(), 'recognition', user.id, id)
    return readRecognitionTask(getDatabase(), user.id, id)
  }),
)
