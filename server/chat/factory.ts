import { readChatSettings } from './settings'
import { mockChatAdapter } from './mock-adapter'
import { createDeepSeekAdapter } from './deepseek-adapter'

export function createChatAdapter(env: NodeJS.ProcessEnv = process.env) {
  const settings = readChatSettings({
    provider: env.NUXT_AI_PROVIDER,
    apiKey: env.NUXT_AI_API_KEY,
    model: env.NUXT_AI_MODEL,
    baseURL: env.NUXT_AI_BASE_URL,
  })
  return settings.provider === 'mock' ? mockChatAdapter : createDeepSeekAdapter(settings)
}
