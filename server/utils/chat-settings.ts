import { readChatSettings } from '../chat/settings'

export function getChatSettings() {
  const config = useRuntimeConfig()
  return readChatSettings({
    provider: config.aiProvider,
    apiKey: config.aiApiKey,
    model: config.aiModel,
    baseURL: config.aiBaseUrl,
  })
}
