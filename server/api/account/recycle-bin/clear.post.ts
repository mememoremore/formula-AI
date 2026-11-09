import { z } from 'zod'
import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { clearRecycleBin } from '../../../database/recycle-bin'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = z.object({ confirmed: z.literal(true) }).safeParse(await readWorkspaceJson(event))
    if (!input.success) throw createError({ statusCode: 400, message: '请确认清空回收站公式。' })
    return clearRecycleBin(getDatabase(), user.id)
  }),
)
