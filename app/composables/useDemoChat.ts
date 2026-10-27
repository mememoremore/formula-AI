import type { ChatMessage, ChatRequest, ChatResponse, FormulaContext } from '#shared/types/api'
import { errorMessage } from '~/utils/error-message'
export function useDemoChat(context: Ref<FormulaContext | undefined>) {
  const store = useDemoStore(),
    pending = ref(false),
    error = ref('')
  const threadKey = computed(() =>
    context.value ? `version:${context.value.versionId}` : 'general',
  )
  const messages = computed(() => store.value.chats[threadKey.value] ?? [])
  let controller: AbortController | undefined,
    disposed = false,
    generation = 0
  let rollback: (() => void) | undefined
  function cancel() {
    rollback?.()
    rollback = undefined
    generation++
    controller?.abort()
    controller = undefined
    pending.value = false
  }
  watch(threadKey, cancel, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    cancel()
  })
  async function send(content: string) {
    const cleaned = content.trim()
    if (!cleaned || cleaned.length > 2000 || pending.value || disposed) return false
    const key = threadKey.value,
      formula = context.value ? { ...context.value } : undefined,
      previous = [...(store.value.chats[key] ?? [])],
      current = ++generation,
      active = new AbortController()
    const outgoing: ChatMessage[] = [...previous.slice(-18), { role: 'user', content: cleaned }]
    controller = active
    pending.value = true
    error.value = ''
    store.value.chats[key] = outgoing
    rollback = () => {
      store.value.chats[key] = previous
    }
    try {
      const body: ChatRequest = { formula, messages: outgoing }
      const response = await $fetch<ChatResponse>('/api/chat', {
        method: 'POST',
        body,
        signal: active.signal,
        retry: 0,
        timeout: 20000,
      })
      if (disposed || current !== generation || key !== threadKey.value) return false
      store.value.chats[key] = [...outgoing, response.message]
      rollback = undefined
      return true
    } catch (cause) {
      if (!disposed && current === generation) {
        store.value.chats[key] = previous
        error.value = errorMessage(cause, '模拟回答暂时不可用，提问已保留，请重试。')
      }
      return false
    } finally {
      if (current === generation) {
        pending.value = false
        rollback = undefined
        controller = undefined
      }
    }
  }
  function clearMessages() {
    if (pending.value) return
    store.value.chats[threadKey.value] = []
    error.value = ''
  }
  return { messages, pending, error, send, clearMessages }
}
