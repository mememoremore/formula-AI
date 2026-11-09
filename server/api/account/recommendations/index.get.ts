import { requireAccountReader } from '../../../utils/auth'
import { workspaceRequest } from '../../../utils/workspace-operation'
import { getDatabase } from '../../../utils/database'
import { getChatSettings } from '../../../utils/chat-settings'
import { readRecommendations } from '../../../database/recommendations'
export default defineEventHandler((event) =>
  workspaceRequest(event, async () =>
    readRecommendations(getDatabase(), (await requireAccountReader(event)).id, getChatSettings()),
  ),
)
