import { parseConversationListInput } from '../../../services/task-input'
import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readConversationList } from '../../../database/conversation-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    return readConversationList(getDatabase(), user.id, parseConversationListInput(getQuery(event)))
  }),
)
