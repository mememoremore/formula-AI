import { getDatabase } from '../utils/database'
import { purgeExpiredRecycleEntries } from '../database/recycle-bin'

export default defineNitroPlugin((nitro) => {
  if (!useRuntimeConfig().databaseUrl) return
  let running: Promise<void> | undefined,
    closed = false
  function cleanup() {
    if (closed || running) return
    running = purgeExpiredRecycleEntries(getDatabase())
      .then(() => undefined)
      .catch(() => {
        console.warn('[recycle-bin] 回收记录清理未完成，将稍后重试。')
      })
      .finally(() => {
        running = undefined
      })
  }
  const timer = setInterval(cleanup, 60000)
  timer.unref()
  nitro.hooks.hook('close', async () => {
    closed = true
    clearInterval(timer)
    await running
  })
  cleanup()
})
