import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getChatSettings } from '../../../../utils/chat-settings'
import { getUsageLimits } from '../../../../utils/queue'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { checkDuplicate } from '../../../../database/formula-duplicates'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    return checkDuplicate(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      getChatSettings(),
      getUsageLimits().CHAT,
    )
  }),
)
