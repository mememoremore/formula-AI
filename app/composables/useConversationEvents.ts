import type { SavedConversation } from '#shared/types/tasks'
import { parseConversationSnapshot, activeChatTurn } from '~/utils/chat-state'
/** 数据库快照流；有限自动重连后交回只读轮询，不重新提交消息。 */
export function useConversationEvents(
  id: string,
  onSnapshot: (value: SavedConversation) => SavedConversation,
  onForbidden: () => void,
) {
  const connected = ref(false),
    feedback = ref('')
  let source: EventSource | undefined, timer: ReturnType<typeof setTimeout> | undefined
  let watchdog: ReturnType<typeof setTimeout> | undefined
  let failedTurn = '',
    retries = 0,
    disposed = false,
    currentTurn = ''
  function close() {
    clearTimeout(timer)
    timer = undefined
    clearTimeout(watchdog)
    source?.close()
    source = undefined
    connected.value = false
  }
  function connect(turnId: string) {
    if (import.meta.server || disposed || failedTurn === turnId) return
    if (currentTurn !== turnId) {
      close()
      retries = 0
      currentTurn = turnId
    }
    if (source || timer) return
    const current = new EventSource(
      `/api/account/conversations/${encodeURIComponent(id)}/events?protocol=2`,
    )
    source = current
    const fail = () => {
      if (source !== current || disposed) return
      close()
      if (retries < 2) {
        const delay = 1000 * ++retries
        feedback.value = '实时连接中断，正在重连；同时查询已保存的状态。'
        timer = setTimeout(() => {
          timer = undefined
          connect(turnId)
        }, delay)
      } else {
        failedTurn = turnId
        feedback.value = '实时连接暂不可用，已改用状态查询。可以手动重新连接。'
      }
    }
    const arm = () => {
      clearTimeout(watchdog)
      watchdog = setTimeout(fail, 15000)
    }
    current.onopen = () => {
      if (source === current) {
        connected.value = true
        feedback.value = ''
        arm()
      }
    }
    current.addEventListener('heartbeat', () => {
      if (source === current && !disposed) arm()
    })
    current.addEventListener('snapshot', (event) => {
      if (source !== current || disposed) return
      try {
        const value = onSnapshot(
          parseConversationSnapshot(JSON.parse((event as MessageEvent<string>).data), id, true),
        )
        arm()
        if (!activeChatTurn(value.currentTurn)) close()
      } catch {
        fail()
      }
    })
    current.addEventListener('stream-error', (event) => {
      if (source !== current || disposed) return
      try {
        const data: unknown = JSON.parse((event as MessageEvent<string>).data)
        if (
          data &&
          typeof data === 'object' &&
          'code' in data &&
          [401, 403, 404].includes(Number(data.code))
        ) {
          failedTurn = turnId
          close()
          onForbidden()
          return
        }
      } catch {
        /* 非结构化错误同样进入只读恢复。 */
      }
      fail()
    })
    current.onerror = fail
  }
  function reconnect(turnId: string) {
    close()
    failedTurn = ''
    retries = 0
    connect(turnId)
  }
  onScopeDispose(() => {
    disposed = true
    close()
  })
  return { connected, feedback, connect, close, reconnect }
}
