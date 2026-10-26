import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getQueue } from '../../../utils/queue'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readConversation } from '../../../database/conversations'
import { reconcileTask } from '../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    const conversation = await readConversation(getDatabase(), user.id, id)
    if (
      conversation.currentTurn &&
      ['QUEUED', 'PROCESSING'].includes(conversation.currentTurn.status)
    ) {
      await reconcileTask(
        getDatabase(),
        await getQueue(),
        'chat',
        user.id,
        conversation.currentTurn.id,
      )
      return readConversation(getDatabase(), user.id, id)
    }
    return conversation
  }),
)
