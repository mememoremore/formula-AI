import { requireAccountUser } from '../../utils/auth'
import { getDatabase } from '../../utils/database'
import { getObjectStore } from '../../utils/storage'
import { workspaceRequest } from '../../utils/workspace-operation'
import { getChatSettings } from '../../utils/chat-settings'
import { readRecognitionSettings } from '../../recognition/settings'
import type { ServiceStatusResponse } from '../../../shared/types/services'

/** 设置页显式展开时才探测；只返回状态，不输出密钥、连接串或内部地址。 */
export default defineEventHandler((event) =>
  workspaceRequest(event, async () => {
    await requireAccountUser(event)
    const config = useRuntimeConfig()
    async function check(id: string, name: string, operation: () => Promise<unknown>) {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          operation(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('deadline')), 5000)
          }),
        ])
        return { id, name, state: 'ready' as const, detail: '已连接' }
      } catch {
        return { id, name, state: 'unavailable' as const, detail: '暂时无法连接，请稍后重试' }
      } finally {
        clearTimeout(timer)
      }
    }
    const items: ServiceStatusResponse['items'] = await Promise.all([
      check('database', '账号数据', () => getDatabase().$queryRaw`SELECT 1`),
      check('storage', '图片存储', () => getObjectStore().check()),
    ])
    try {
      const recognition = readRecognitionSettings({
        NUXT_RECOGNITION_PROVIDER: config.recognitionProvider,
        NUXT_RECOGNITION_SERVICE_URL: config.recognitionServiceUrl,
        NUXT_RECOGNITION_API_KEY: config.recognitionApiKey,
      })
      items.push(
        recognition.provider === 'mock'
          ? { id: 'recognition', name: '图片识别', state: 'demo', detail: '当前使用固定模拟结果' }
          : await check('recognition', '图片识别', async () => {
              const value = await $fetch<{ ready: boolean }>(recognition.serviceUrl + '/ready', {
                timeout: 3000,
                retry: 0,
              })
              if (!value.ready) throw new Error('not ready')
            }),
      )
    } catch {
      items.push({
        id: 'recognition',
        name: '图片识别',
        state: 'unavailable',
        detail: '识别服务配置尚未就绪',
      })
    }
    try {
      const ai = getChatSettings()
      items.push(
        ai.provider === 'mock'
          ? { id: 'ai', name: 'AI 助手', state: 'demo', detail: '当前使用固定模拟回答' }
          : {
              id: 'ai',
              name: 'AI 助手',
              state: ai.apiKey ? 'configured' : 'unavailable',
              detail: ai.apiKey ? 'DeepSeek 已配置，实际连接以发送结果为准' : 'AI 服务尚未配置完成',
            },
      )
    } catch {
      items.push({ id: 'ai', name: 'AI 助手', state: 'unavailable', detail: 'AI 服务配置尚未就绪' })
    }
    return { checkedAt: new Date().toISOString(), items } satisfies ServiceStatusResponse
  }),
)
