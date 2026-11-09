import { z } from 'zod'
import { requireAccountWriter } from '../../../../utils/auth'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { getDatabase } from '../../../../utils/database'
import { getQueue } from '../../../../utils/queue'
import { stopAccountTask } from '../../../../database/task-cancellation'
const input = z.object({ kind: z.enum(['batch', 'recognition', 'chat', 'export']) })
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = input.safeParse(await readWorkspaceJson(event))
    if (!body.success) throw createError({ statusCode: 400, message: '任务类型无效。' })
    return stopAccountTask(
      getDatabase(),
      await getQueue(),
      user.id,
      body.data.kind,
      getRouterParam(event, 'id') ?? '',
    )
  }),
)
