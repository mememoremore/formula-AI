import { conversationNameInputSchema } from '../../../../shared/schemas/conversation-name'
import { renameConversation } from '../../../database/conversation-mutations'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = conversationNameInputSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({
        statusCode: 400,
        message: input.error.issues[0]?.message ?? '请输入对话名称。',
      })
    return renameConversation(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      input.data.title,
    )
  }),
)
