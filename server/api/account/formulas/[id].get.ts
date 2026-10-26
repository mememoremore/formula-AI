import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readSavedFormula } from '../../../database/formula-queries'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    return readSavedFormula(getDatabase(), user.id, getRouterParam(event, 'id') ?? '')
  }),
)
