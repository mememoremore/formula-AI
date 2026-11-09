import { requireAccountWriter } from '../../../../../utils/auth'
import { getDatabase } from '../../../../../utils/database'
import { readWorkspaceJson } from '../../../../../utils/request-body'
import { workspaceRequest } from '../../../../../utils/workspace-operation'
import { confirmFormulaRepair } from '../../../../../database/formula-repairs'
import { readSavedFormula } from '../../../../../database/formula-queries'
import { resourceIdPattern } from '../../../../../../shared/resource-id'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event),
      id = getRouterParam(event, 'id') ?? ''
    const raw = (await readWorkspaceJson(event)) as { proposalId?: unknown }
    if (typeof raw?.proposalId !== 'string' || !resourceIdPattern.test(raw.proposalId))
      throw createError({ statusCode: 400, message: '纠错候选编号无效。' })
    await confirmFormulaRepair(getDatabase(), user.id, id, raw.proposalId)
    return readSavedFormula(getDatabase(), user.id, id)
  }),
)
