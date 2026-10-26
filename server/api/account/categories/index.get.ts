import { requireAccountUser } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readCategories } from '../../../database/library-queries'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    return readCategories(getDatabase(), user.id)
  }),
)
