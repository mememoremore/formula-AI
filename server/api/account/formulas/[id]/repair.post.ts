import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getObjectStore } from '../../../../utils/storage'
import { getChatSettings } from '../../../../utils/chat-settings'
import { getUsageLimits } from '../../../../utils/queue'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { proposeFormulaRepair } from '../../../../database/formula-repairs'
import { repairInputSchema } from '../../../../../shared/schemas/formula-intelligence'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = repairInputSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success)
      throw createError({ statusCode: 400, message: '请输入1～60字领域并重新读取公式。' })
    return proposeFormulaRepair(
      getDatabase(),
      getObjectStore(),
      getChatSettings(),
      getUsageLimits().CHAT,
      user.id,
      getRouterParam(event, 'id') ?? '',
      input.data,
    )
  }),
)
