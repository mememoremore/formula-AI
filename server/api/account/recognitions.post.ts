import { requireAccountWriter } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { readWorkspaceJson } from '../../utils/request-body'
import { workspaceRequest } from '../../utils/workspace-operation'
import { isRecord } from '../../utils/validate-body'
import { hasValidResourceIdentity } from '../../database/private-resources'
import { submitRecognition } from '../../database/task-submissions'
import { readRecognitionTask } from '../../database/task-queries'
import { getQueue, getUsageLimits } from '../../utils/queue'
import {
  normalizeOptionalFormulaTitle,
  optionalFormulaTitleFeedback,
} from '../../../shared/formula-title'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = await readWorkspaceJson(event)
    const requestedTitle =
      body &&
      typeof body === 'object' &&
      ((body as Record<string, unknown>).requestedTitle === null ||
        (body as Record<string, unknown>).requestedTitle === undefined ||
        typeof (body as Record<string, unknown>).requestedTitle === 'string')
        ? normalizeOptionalFormulaTitle(
            (body as Record<string, unknown>).requestedTitle as string | null | undefined,
          )
        : undefined
    if (
      !isRecord(body) ||
      !hasValidResourceIdentity(user.id, body.fileId) ||
      !hasValidResourceIdentity(user.id, body.requestKey) ||
      (body.mode !== 'handwritten' && body.mode !== 'printed') ||
      requestedTitle === undefined ||
      optionalFormulaTitleFeedback(requestedTitle ?? '')
    )
      throw createError({
        statusCode: 400,
        message: '图片、识别模式、公式名称或请求编号无效。',
      })
    const task = await submitRecognition(getDatabase(), await getQueue(), getUsageLimits(), {
      ownerId: user.id,
      fileId: body.fileId as string,
      requestKey: body.requestKey as string,
      mode: body.mode,
      requestedTitle,
    })
    setResponseStatus(event, 202)
    return readRecognitionTask(getDatabase(), user.id, task.id)
  }),
)
