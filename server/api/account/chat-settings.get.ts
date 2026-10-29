import { requireAccountUser } from '../../utils/auth'
import { getChatSettings } from '../../utils/chat-settings'
import { workspaceRequest } from '../../utils/workspace-operation'

export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    await requireAccountUser(event)
    const settings = getChatSettings()
    return {
      provider: settings.provider,
      model: settings.provider === 'mock' ? 'mock-chat-v1' : settings.model,
      ready: settings.provider === 'mock' || !!settings.apiKey,
    }
  }),
)
