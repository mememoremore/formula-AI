import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getQueue, getUsageLimits } from '../../../../utils/queue'
import { getChatSettings } from '../../../../utils/chat-settings'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { parseExplanationInput } from '../../../../services/task-input'
import { hasValidResourceIdentity } from '../../../../database/private-resources'
import { submitExplanation } from '../../../../database/explanations'
import { taskState } from '../../../../database/task-queries'
import { identityRoot } from '../../../../database/formula-identities'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event),
      id = getRouterParam(event, 'id') ?? ''
    const raw = await readWorkspaceJson(event)
    if (!hasValidResourceIdentity(user.id, id))
      throw createError({ statusCode: 400, message: '公式版本或请求编号无效。' })
    const body = parseExplanationInput(raw)
    const db = getDatabase(),
      root = await identityRoot(db, user.id, id)
    const local = await db.formulaVersion.findFirst({
      where: { formulaId: id, ownerId: user.id },
      orderBy: { number: 'desc' },
    })
    if (local?.id !== body.versionId)
      throw createError({ statusCode: 409, message: '公式已变化，请刷新后重试。' })
    const version =
      root.id === id
        ? local
        : await db.formulaVersion.findFirstOrThrow({
            where: { formulaId: root.id, ownerId: user.id },
            orderBy: { number: 'desc' },
          })
    const settings = getChatSettings()
    if (settings.provider === 'deepseek' && !settings.apiKey)
      throw createError({ statusCode: 503, message: 'AI服务尚未配置。' })
    const turn = await submitExplanation(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      formulaId: root.id,
      versionId: version.id,
      requestKey: body.requestKey,
      domain: body.domain,
    })
    setResponseStatus(event, 202)
    return { conversationId: turn.conversationId, task: taskState(turn) }
  }),
)
