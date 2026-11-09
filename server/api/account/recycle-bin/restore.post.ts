import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { restoreRecycled } from '../../../database/recycle-bin'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () =>
    restoreRecycled(
      getDatabase(),
      (await requireAccountWriter(event)).id,
      await readWorkspaceJson(event),
    ),
  ),
)
