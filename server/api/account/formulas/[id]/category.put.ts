import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { parseFormulaCategory } from '../../../../services/library-input'
import { assignFormulaCategory } from '../../../../database/library-mutations'
import { readSavedFormula } from '../../../../database/formula-queries'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const id = getRouterParam(event, 'id') ?? ''
    await readSavedFormula(getDatabase(), user.id, id)
    const body = parseFormulaCategory(await readWorkspaceJson(event))
    await assignFormulaCategory(getDatabase(), user.id, id, body.categoryId)
    return readSavedFormula(getDatabase(), user.id, id)
  }),
)
