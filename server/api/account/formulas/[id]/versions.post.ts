import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceOperation } from '../../../../utils/workspace-operation'
import { isRecord, isText } from '../../../../utils/validate-body'
import { hasValidResourceIdentity } from '../../../../database/private-resources'
import { appendFormulaVersion } from '../../../../database/formulas'
import { readSavedFormula } from '../../../../database/formula-queries'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    const id = getRouterParam(event, 'id') ?? ''
    // 先判断记录归属，外部资源与不存在资源保持一致的 404。
    await readSavedFormula(getDatabase(), user.id, id)
    const body = await readWorkspaceJson(event)
    if (isRecord(body) && !isText(body.expectedTitle, 100))
      throw createError({
        statusCode: 400,
        message: '保存需要编辑时的原标题（expectedTitle），请刷新页面后重新编辑。',
      })
    if (
      !isRecord(body) ||
      !isText(body.latex, 5000) ||
      !isText(body.title, 100) ||
      !hasValidResourceIdentity(user.id, body.expectedVersionId)
    )
      throw createError({ statusCode: 400, message: '请填写有效的名称、LaTeX 和编辑版本。' })
    await appendFormulaVersion(getDatabase(), {
      ownerId: user.id,
      formulaId: id,
      expectedVersionId: body.expectedVersionId as string,
      expectedTitle: body.expectedTitle as string,
      latex: body.latex,
      title: body.title,
    })
    return readSavedFormula(getDatabase(), user.id, id)
  }),
)
