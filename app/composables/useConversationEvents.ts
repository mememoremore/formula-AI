import type { SavedConversation } from '#shared/types/tasks'

/** SSE只接收安全快照；故障关闭后交回轮询，同一轮不无限自动重连。 */
export function useConversationEvents(id: string, onSnapshot: (value: SavedConversation) => void) {
  const connected = ref(false)
  const feedback = ref('')
  let source: EventSource | undefined
  let failedTurn = ''
  function close() {
    source?.close()
    source = undefined
    connected.value = false
  }
  function connect(turnId: string) {
    if (import.meta.server || source || failedTurn === turnId) return
    const current = new EventSource(`/api/account/conversations/${id}/events`)
    source = current
    current.onopen = () => {
      if (source === current) {
        connected.value = true
        feedback.value = ''
      }
    }
    current.addEventListener('snapshot', (event) => {
      if (source !== current) return
      try {
        const value = JSON.parse((event as MessageEvent<string>).data) as SavedConversation
        if (value.id !== id || !Array.isArray(value.messages)) throw new Error('Invalid snapshot')
        onSnapshot(value)
        if (!value.currentTurn || !['QUEUED', 'PROCESSING'].includes(value.currentTurn.status))
          close()
      } catch {
        failedTurn = turnId
        close()
        feedback.value = '实时连接已暂停，正在改用状态查询。'
      }
    })
    const fail = () => {
      if (source !== current) return
      failedTurn = turnId
      close()
      feedback.value = '实时连接已断开，正在改用状态查询；刷新可重新连接。'
    }
    current.addEventListener('stream-error', fail)
    current.onerror = fail
  }
  onScopeDispose(close)
  return { connected, feedback, connect, close }
}
