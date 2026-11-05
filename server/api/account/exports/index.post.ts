import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getQueue, getUsageLimits } from '../../../utils/queue'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { parseExportInput } from '../../../services/task-input'
import { submitExport } from '../../../database/task-submissions'
import { readExportTask } from '../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = parseExportInput(await readWorkspaceJson(event))
    const task = await submitExport(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      formulaVersionId: body.formulaVersionId,
      requestKey: body.requestKey,
    })
    setResponseStatus(event, 202)
    return readExportTask(getDatabase(), user.id, task.id)
  }),
)
