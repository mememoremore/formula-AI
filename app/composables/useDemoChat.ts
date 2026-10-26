import type { ChatMessage, ChatRequest, ChatResponse, FormulaContext } from '#shared/types/api'
import { errorMessage } from '~/utils/error-message'

export function useDemoChat(context: Ref<FormulaContext | undefined>) {
  const store = useDemoStore()
  const pending = ref(false)
  const error = ref('')
  const threadKey = computed(() =>
    context.value ? `version:${context.value.versionId}` : 'general',
  )
  const messages = computed(() => store.value.chats[threadKey.value] ?? [])

  async function send(content: string) {
    const cleaned = content.trim()
    if (!cleaned || cleaned.length > 2000 || pending.value) return false
    // Capture version and thread before awaiting so a response cannot land in another thread.
    const key = threadKey.value
    const formula = context.value ? { ...context.value } : undefined
    const previous = [...(store.value.chats[key] ?? [])]
    const outgoing: ChatMessage[] = [...previous.slice(-18), { role: 'user', content: cleaned }]
    store.value.chats[key] = outgoing
    pending.value = true
    error.value = ''
    try {
      const body: ChatRequest = { formula, messages: outgoing }
      const response = await $fetch<ChatResponse>('/api/chat', { method: 'POST', body })
      store.value.chats[key] = [...outgoing, response.message]
      return true
    } catch (cause) {
      store.value.chats[key] = previous
      error.value = errorMessage(cause, '模拟回答暂时不可用，提问已保留，请稍后重试。')
      return false
    } finally {
      pending.value = false
    }
  }

  function clearMessages() {
    store.value.chats[threadKey.value] = []
    error.value = ''
  }
  return { messages, pending, error, send, clearMessages }
}
