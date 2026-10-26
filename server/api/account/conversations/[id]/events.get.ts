import { setTimeout as delay } from 'node:timers/promises'
import { createEventStream } from 'h3'
import { getAuthentication, requireAccountUser } from '../../../../utils/auth'
import { getDatabase } from '../../../../utils/database'
import { getQueue } from '../../../../utils/queue'
import { workspaceOperation } from '../../../../utils/workspace-operation'
import { readConversation } from '../../../../database/conversations'
import { reconcileTask } from '../../../../database/task-queries'

/** 读取持久化快照，连接或重连均不启动模型、不扣额度。 */
export default defineEventHandler((event) =>
  workspaceOperation(async () => {
    const user = await requireAccountUser(event)
    const id = getRouterParam(event, 'id') ?? ''
    await readConversation(getDatabase(), user.id, id)
    setResponseHeader(event, 'X-Accel-Buffering', 'no')
    const stream = createEventStream(event)
    const controller = new AbortController()
    stream.onClosed(() => controller.abort())
    async function sendSnapshots() {
      let previous = ''
      try {
        for (let tick = 0; tick < 80 && !controller.signal.aborted; tick++) {
          // 不修改已发送的响应头；仅复查数据库会话，退出账号后关闭数据流。
          const session = await getAuthentication().api.getSession({ headers: event.headers })
          if (!session?.user || session.user.id !== user.id) {
            await stream.push({ event: 'stream-error', data: JSON.stringify({ code: 401 }) })
            return
          }
          let snapshot = await readConversation(getDatabase(), user.id, id)
          if (snapshot.currentTurn && tick % 4 === 0) {
            await reconcileTask(
              getDatabase(),
              await getQueue(),
              'chat',
              user.id,
              snapshot.currentTurn.id,
            )
            snapshot = await readConversation(getDatabase(), user.id, id)
          }
          const data = JSON.stringify(snapshot)
          if (data !== previous) {
            await stream.push({ event: 'snapshot', data })
            previous = data
          }
          if (
            !snapshot.currentTurn ||
            !['QUEUED', 'PROCESSING'].includes(snapshot.currentTurn.status)
          )
            return
          await delay(750, undefined, { signal: controller.signal })
        }
      } catch {
        if (!controller.signal.aborted)
          await stream
            .push({ event: 'stream-error', data: JSON.stringify({ code: 503 }) })
            .catch(() => {})
      } finally {
        await stream.close().catch(() => {})
      }
    }
    void sendSnapshots()
    return stream.send()
  }),
)
