import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { parseFormulaEdit } from '../../../../services/formula-input'
import { appendFormulaVersion } from '../../../../database/formulas'
import { readSavedFormula } from '../../../../database/formula-queries'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const id = getRouterParam(event, 'id') ?? ''
    // 先判断记录归属，外部资源与不存在资源保持一致的 404。
    await readSavedFormula(getDatabase(), user.id, id)
    const body = parseFormulaEdit(await readWorkspaceJson(event))
    await appendFormulaVersion(getDatabase(), {
      ownerId: user.id,
      formulaId: id,
      expectedVersionId: body.expectedVersionId,
      expectedTitle: body.expectedTitle,
      latex: body.latex,
      title: body.title,
    })
    return readSavedFormula(getDatabase(), user.id, id)
  }),
)
