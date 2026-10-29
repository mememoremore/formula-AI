import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { isRecord } from '../../../../utils/validate-body'
import { hasValidResourceIdentity } from '../../../../database/private-resources'
import { assignFormulaCategory } from '../../../../database/library-mutations'
import { readSavedFormula } from '../../../../database/formula-queries'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const id = getRouterParam(event, 'id') ?? ''
    await readSavedFormula(getDatabase(), user.id, id)
    const body = await readWorkspaceJson(event)
    if (
      !isRecord(body) ||
      (body.categoryId !== null && !hasValidResourceIdentity(user.id, body.categoryId))
    )
      throw createError({ statusCode: 400, message: '请选择有效的分类或未分类。' })
    await assignFormulaCategory(getDatabase(), user.id, id, body.categoryId as string | null)
    return readSavedFormula(getDatabase(), user.id, id)
  }),
)
