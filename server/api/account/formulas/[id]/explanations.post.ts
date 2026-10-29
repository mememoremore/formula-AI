import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getQueue, getUsageLimits } from '../../../../utils/queue'
import { getChatSettings } from '../../../../utils/chat-settings'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { isRecord } from '../../../../utils/validate-body'
import { hasValidResourceIdentity } from '../../../../database/private-resources'
import { submitExplanation } from '../../../../database/explanations'
import { taskState } from '../../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event),
      id = getRouterParam(event, 'id') ?? ''
    const expected = getHeader(event, 'x-account-id')
    if (expected && expected !== user.id)
      throw createError({ statusCode: 403, message: '账号已变化，请重新确认。' })
    const body = await readWorkspaceJson(event)
    if (
      !isRecord(body) ||
      !hasValidResourceIdentity(user.id, id) ||
      !hasValidResourceIdentity(user.id, body.versionId) ||
      !hasValidResourceIdentity(user.id, body.requestKey)
    )
      throw createError({ statusCode: 400, message: '公式版本或请求编号无效。' })
    const settings = getChatSettings()
    if (settings.provider === 'deepseek' && !settings.apiKey)
      throw createError({ statusCode: 503, message: 'AI服务尚未配置。' })
    const turn = await submitExplanation(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      formulaId: id,
      versionId: body.versionId as string,
      requestKey: body.requestKey as string,
    })
    setResponseStatus(event, 202)
    return { conversationId: turn.conversationId, task: taskState(turn) }
  }),
)
