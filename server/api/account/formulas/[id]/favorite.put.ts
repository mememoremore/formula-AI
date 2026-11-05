import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { parseFormulaFavorite } from '../../../../services/formula-input'
import { setFormulaFavorite } from '../../../../database/library-mutations'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = parseFormulaFavorite(await readWorkspaceJson(event))
    return setFormulaFavorite(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      body.favorite,
    )
  }),
)
