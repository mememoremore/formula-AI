import { requireAccountWriter } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceOperation } from '../../../../utils/workspace-operation'
import { readWorkspaceJson } from '../../../../utils/request-body'
import { isRecord } from '../../../../utils/validate-body'
import { setFormulaFavorite } from '../../../../database/library-mutations'

export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountWriter(event)
    const body = await readWorkspaceJson(event)
    if (!isRecord(body) || typeof body.favorite !== 'boolean')
      throw createError({ statusCode: 400, message: '收藏状态必须为布尔值。' })
    return setFormulaFavorite(
      getDatabase(),
      user.id,
      getRouterParam(event, 'id') ?? '',
      body.favorite,
    )
  }),
)
