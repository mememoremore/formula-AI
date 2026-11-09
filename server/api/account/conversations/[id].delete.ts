import { deleteConversation } from '../../../database/conversation-mutations'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    return deleteConversation(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
