import { z } from 'zod'
import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getChatSettings } from '../../../../utils/chat-settings'
import { getUsageLimits } from '../../../../utils/queue'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { generateLearningQuestions } from '../../../../database/learning-questions'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = z
      .object({ retry: z.boolean().optional() })
      .safeParse(await readWorkspaceJson(event))
    if (!input.success) throw createError({ statusCode: 400, message: '问答请求格式无效。' })
    return generateLearningQuestions(
      getDatabase(),
      getChatSettings(),
      getUsageLimits().CHAT,
      user.id,
      getRouterParam(event, 'id') ?? '',
      input.data.retry,
    )
  }),
)
