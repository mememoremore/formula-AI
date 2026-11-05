import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { parseCategoryInput } from '../../../services/library-input'
import { renameCategory } from '../../../database/library-mutations'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = parseCategoryInput(await readWorkspaceJson(event))
    return renameCategory(getDatabase(), user.id, getRouterParam(event, 'id') ?? '', body.name)
  }),
)
