import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { workspaceRequest } from '../../utils/workspace-operation'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const db = getDatabase()
    const [formulas, favorites, conversations] = await db.$transaction(
      [
        db.formula.count({ where: { ownerId: user.id, deletedAt: null } }),
        db.favorite.count({ where: { ownerId: user.id, formula: { deletedAt: null } } }),
        db.conversation.count({ where: { ownerId: user.id } }),
      ],
      { isolationLevel: 'RepeatableRead' },
    )
    return { ownerId: user.id, formulas, favorites, conversations }
  }),
)
