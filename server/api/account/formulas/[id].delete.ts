import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { softDeleteFormula } from '../../../database/formulas'
import { WorkspaceError } from '../../../services/workspace-error'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const deleted = await softDeleteFormula(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
    )
    if (!deleted) throw new WorkspaceError(404, '未找到这条公式。')
    setResponseStatus(event, 204)
    return null
  }),
)
