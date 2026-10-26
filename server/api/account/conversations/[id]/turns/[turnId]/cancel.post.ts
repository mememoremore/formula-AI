import { requireAccountWriter } from '../../../../../../utils/auth'
import { getDatabase } from '../../../../../../utils/database'
import { getQueue } from '../../../../../../utils/queue'
import { workspaceOperation } from '../../../../../../utils/workspace-operation'
import { hasValidResourceIdentity } from '../../../../../../database/private-resources'
import { readConversation } from '../../../../../../database/conversations'
import { cancelChatTurn } from '../../../../../../database/chat-progress'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    const id = getRouterParam(event, 'id') ?? ''
    const turnId = getRouterParam(event, 'turnId') ?? ''
    if (!hasValidResourceIdentity(user.id, turnId))
      throw createError({ statusCode: 404, message: '未找到这个提问。' })
    await readConversation(getDatabase(), user.id, id)
    if (!(await cancelChatTurn(getDatabase(), await getQueue(), user.id, id, turnId)))
      throw createError({ statusCode: 404, message: '未找到这个提问。' })
    return readConversation(getDatabase(), user.id, id)
  }),
)
