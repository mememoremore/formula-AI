import { requireAccountUser } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { workspaceRequest } from '../../../../utils/workspace-operation'
import { readExplanationHistory } from '../../../../database/explanations'
import { hasValidResourceIdentity } from '../../../../database/private-resources'
import { identityRoot } from '../../../../database/formula-identities'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event),
      q = getQuery(event)
    for (const name of ['versionId', 'cursor'] as const)
      if (q[name] !== undefined && !hasValidResourceIdentity(user.id, q[name]))
        throw createError({ statusCode: 400, message: '历史查询参数无效。' })
    const id = getRouterParam(event, 'id') ?? '',
      root = await identityRoot(getDatabase(), user.id, id)
    const versionId = root.id === id ? (q.versionId as string | undefined) : undefined
    return readExplanationHistory(getDatabase(), user.id, root.id, {
      versionId,
      cursor: q.cursor as string | undefined,
    })
  }),
)
