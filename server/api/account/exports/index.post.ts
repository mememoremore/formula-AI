import { requireAccountWriter } from '../../../utils/auth'
import { getDatabase } from '../../../utils/database'
import { getQueue, getUsageLimits } from '../../../utils/queue'
import { workspaceOperation } from '../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../utils/request-body'
import { isRecord } from '../../../utils/validate-body'
import { hasValidResourceIdentity } from '../../../database/private-resources'
import { submitExport } from '../../../database/task-submissions'
import { readExportTask } from '../../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    const body = await readWorkspaceJson(event)
    if (
      !isRecord(body) ||
      !hasValidResourceIdentity(user.id, body.formulaVersionId) ||
      !hasValidResourceIdentity(user.id, body.requestKey)
    )
      throw createError({ statusCode: 400, message: '请提供有效的公式版本和请求编号。' })
    const task = await submitExport(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      formulaVersionId: body.formulaVersionId as string,
      requestKey: body.requestKey as string,
    })
    setResponseStatus(event, 202)
    return readExportTask(getDatabase(), user.id, task.id)
  }),
)
