import type { PgBoss } from 'pg-boss'
import { createQueueClient } from '../queue/client'
import { defaultUsageLimits, type UsageLimits } from '../database/usage'

const state = globalThis as typeof globalThis & { formulaQueue?: Promise<PgBoss> }
export async function getQueue() {
  state.formulaQueue ??= (async () => {
    const boss = createQueueClient(useRuntimeConfig().databaseUrl)
    try {
      await boss.start()
      return boss
    } catch {
      await boss.stop().catch(() => {})
      state.formulaQueue = undefined
      throw createError({
        statusCode: 503,
        message: '任务队列尚未就绪，请运行 npm run worker:setup 并启动 Worker。',
      })
    }
  })()
  return state.formulaQueue
}
export function getUsageLimits(): UsageLimits {
  const config = useRuntimeConfig()
  function checkedLimit(value: unknown, fallback: number) {
    const limit = Number(value ?? fallback)
    if (!Number.isInteger(limit) || limit < 1 || limit > 10000)
      throw createError({ statusCode: 503, message: '每日额度配置无效，请联系管理员。' })
    return limit
  }
  return {
    RECOGNITION: checkedLimit(config.recognitionDailyLimit, defaultUsageLimits.RECOGNITION),
    CHAT: checkedLimit(config.chatDailyLimit, defaultUsageLimits.CHAT),
    EXPORT: checkedLimit(config.exportDailyLimit, defaultUsageLimits.EXPORT),
  }
}
