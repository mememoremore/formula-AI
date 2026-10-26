import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { workspaceOperation } from '../../utils/workspace-operation'
import { parseLibraryFilters } from '../../services/library-input'
import { readFormulaLibrary } from '../../database/library-queries'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    return readFormulaLibrary(getDatabase(), user.id, parseLibraryFilters(getQuery(event)))
  }),
)
