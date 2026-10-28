import { requireAccountWriter } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { readWorkspaceJson } from '../../utils/request-body'
import { workspaceRequest } from '../../utils/workspace-operation'
import { isRecord } from '../../utils/validate-body'
import { hasValidResourceIdentity } from '../../database/private-resources'
import { submitRecognition } from '../../database/task-submissions'
import { readRecognitionTask } from '../../database/task-queries'
import { getQueue, getUsageLimits } from '../../utils/queue'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = await readWorkspaceJson(event)
    if (
      !isRecord(body) ||
      !hasValidResourceIdentity(user.id, body.fileId) ||
      !hasValidResourceIdentity(user.id, body.requestKey) ||
      (body.mode !== 'handwritten' && body.mode !== 'printed')
    )
      throw createError({ statusCode: 400, message: '图片、识别模式或请求编号无效。' })
    const task = await submitRecognition(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      fileId: body.fileId as string,
      requestKey: body.requestKey as string,
      mode: body.mode,
    })
    setResponseStatus(event, 202)
    return readRecognitionTask(getDatabase(), user.id, task.id)
  }),
)
