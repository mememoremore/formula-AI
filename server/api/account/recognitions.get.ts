import { parseRecognitionHistoryInput } from '../../services/task-input'
import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { workspaceRequest } from '../../utils/workspace-operation'
import { readRecognitionHistory } from '../../database/task-queries'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    const user = await requireAccountUser(event)
    const { cursor, q } = parseRecognitionHistoryInput(getQuery(event))
    return readRecognitionHistory(getDatabase(), user.id, cursor, q)
  }),
)
