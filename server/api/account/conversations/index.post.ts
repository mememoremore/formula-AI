import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { isRecord } from '../../../utils/validate-body'
import { hasValidResourceIdentity } from '../../../database/private-resources'
import { createConversation, readConversation } from '../../../database/conversations'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = await readWorkspaceJson(event)
    if (
      !isRecord(body) ||
      !hasValidResourceIdentity(user.id, body.requestKey) ||
      (body.formulaVersionId !== null && !hasValidResourceIdentity(user.id, body.formulaVersionId))
    )
      throw createError({ statusCode: 400, message: '对话版本或请求编号无效。' })
    const conversation = await createConversation(
      getDatabase(),
      user.id,
      body.formulaVersionId as string | null,
      body.requestKey as string,
    )
    return readConversation(getDatabase(), user.id, conversation.id)
  }),
)
