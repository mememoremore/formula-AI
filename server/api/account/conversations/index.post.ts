import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { parseConversationInput } from '../../../services/task-input'
import { createConversation, readConversation } from '../../../database/conversations'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = parseConversationInput(await readWorkspaceJson(event))
    const conversation = await createConversation(
      getDatabase(),
      user.id,
      body.formulaVersionId,
      body.requestKey,
    )
    return readConversation(getDatabase(), user.id, conversation.id)
  }),
)
