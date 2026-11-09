import { requireAccountReader } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readRecycleBin } from '../../../database/recycle-bin'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () =>
    readRecycleBin(getDatabase(), (await requireAccountReader(event)).id),
  ),
)
