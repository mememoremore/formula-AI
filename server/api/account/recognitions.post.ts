import { requireAccountWriter } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { readWorkspaceJson } from '../../utils/request-body'
import { workspaceRequest } from '../../utils/workspace-operation'
import { parseRecognitionTaskInput } from '../../services/task-input'
import { submitRecognition } from '../../database/task-submissions'
import { readRecognitionTask } from '../../database/task-queries'
import { getQueue, getUsageLimits } from '../../utils/queue'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = parseRecognitionTaskInput(await readWorkspaceJson(event))
    const task = await submitRecognition(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      fileId: body.fileId,
      requestKey: body.requestKey,
      mode: body.mode,
      requestedTitle: body.requestedTitle,
    })
    setResponseStatus(event, 202)
    return readRecognitionTask(getDatabase(), user.id, task.id)
  }),
)
