import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { decideDuplicate } from '../../../../database/formula-duplicates'
import { duplicateDecisionSchema } from '../../../../../shared/schemas/formula-intelligence'
import { readSavedFormula } from '../../../../database/formula-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event),
      id = getRouterParam(event, 'id') ?? ''
    const input = duplicateDecisionSchema.safeParse(await readWorkspaceJson(event))
    if (!input.success) throw createError({ statusCode: 400, message: '请选择有效的关联决定。' })
    await decideDuplicate(getDatabase(), user.id, id, input.data)
    return readSavedFormula(getDatabase(), user.id, id)
  }),
)
