import { z } from 'zod'
import { resourceIdPattern } from '#shared/resource-id'
import { requireAccountWriter } from '../../../../../../utils/auth'
import { workspaceRequest } from '../../../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../../../utils/request-body'
import { getDatabase } from '../../../../../../utils/database'
import { replaceFailedBatchPart } from '../../../../../../database/recognition-batches'
const id = z.string().regex(resourceIdPattern)
const input = z.object({
  fileId: id,
  requestKey: id,
  expectedTaskId: id.nullable(),
  expectedFileId: id,
})
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountWriter(event)
    const body = input.safeParse(await readWorkspaceJson(event))
    if (!body.success) throw createError({ statusCode: 400, message: '请重新选择有效公式图片。' })
    return replaceFailedBatchPart(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      getRouterParam(event, 'partId') ?? '',
      body.data,
    )
  }),
)
