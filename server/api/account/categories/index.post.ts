import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { isRecord } from '../../../utils/validate-body'
import { createCategory } from '../../../database/library-mutations'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = await readWorkspaceJson(event)
    return createCategory(getDatabase(), user.id, isRecord(body) ? body.name : undefined)
  }),
)
