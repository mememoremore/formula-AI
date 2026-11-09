import { z } from 'zod'
import { requireAccountWriter } from '../../../utils/auth'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { getDatabase } from '../../../utils/database'
import { getChatSettings } from '../../../utils/chat-settings'
import { getUsageLimits } from '../../../utils/queue'
import { generateRecommendations } from '../../../database/recommendations'
const input = z.object({
  fingerprint: z.string().regex(/^[0-9a-f]{64}$/),
  retry: z.boolean().optional(),
})
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = input.safeParse(await readWorkspaceJson(event))
    if (!body.success)
      throw createError({ statusCode: 400, message: '推荐请求无效，请刷新页面后重试。' })
    return generateRecommendations(
      getDatabase(),
      user.id,
      getChatSettings(),
      getUsageLimits().CHAT,
      body.data.fingerprint,
      body.data.retry,
    )
  }),
)
