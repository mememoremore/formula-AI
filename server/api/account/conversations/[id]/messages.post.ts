import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getQueue, getUsageLimits } from '../../../../utils/queue'
import { workspaceOperation } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { isRecord, isText } from '../../../../utils/validate-body'
import { hasValidResourceIdentity } from '../../../../database/private-resources'
import { readConversation, submitChatTurn } from '../../../../database/conversations'
import { taskState } from '../../../../database/task-queries'
import { getChatSettings } from '../../../../utils/chat-settings'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    const id = getRouterParam(event, 'id') ?? ''
    await readConversation(getDatabase(), user.id, id)
    const settings = getChatSettings()
    if (settings.provider === 'deepseek' && !settings.apiKey)
      throw createError({ statusCode: 503, message: 'DeepSeek密钥尚未配置，暂时不能生成回答。' })
    const body = await readWorkspaceJson(event)
    if (
      !isRecord(body) ||
      !isText(body.question, 2000) ||
      !hasValidResourceIdentity(user.id, body.requestKey)
    )
      throw createError({ statusCode: 400, message: '请填写有效的提问和请求编号。' })
    const turn = await submitChatTurn(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      conversationId: id,
      question: body.question,
      requestKey: body.requestKey as string,
    })
    setResponseStatus(event, 202)
    return taskState(turn)
  }),
)
