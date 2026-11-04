import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { readWorkspaceJson } from '../../../utils/request-body'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { parseManualFormula } from '../../../services/manual-formula-input'
import { createManualFormula } from '../../../database/manual-formulas'
import { readSavedFormula } from '../../../database/formula-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const input = parseManualFormula(await readWorkspaceJson(event))
    const result = await createManualFormula(getDatabase(), user.id, input)
    setResponseStatus(event, result.replayed ? 200 : 201)
    return readSavedFormula(getDatabase(), user.id, result.id)
  }),
)
