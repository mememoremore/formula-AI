import type { SavedConversation } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'
import {
  acceptConversationSnapshot,
  parseConversationSnapshot,
  activeChatTurn,
} from '~/utils/chat-state'
export function useAccountChat(id: string, ownerId: string) {
  let disposed = false,
    accepted: SavedConversation | undefined
  const controllers = new Set<AbortController>()
  const intents = useNuxtApp().$chatDraft
  const slot = 'conversation:' + id
  const pendingIntent = computed(() =>
    intents.items.value.find((row) => row.ownerId === ownerId && row.slot === slot),
  )
  const feedback = ref(''),
    submitting = ref(false),
    stopping = ref(false)
  function accept(value: SavedConversation) {
    accepted = acceptConversationSnapshot(accepted, parseConversationSnapshot(value, id))
    return accepted
  }
  const events = useConversationEvents(
    id,
    (value) => {
      const next = accept(value)
      request.data.value = next
      request.error.value = undefined
      return next
    },
    () => {
      accepted = undefined
      request.clear()
      request.data.value = undefined
      request.error.value = createError({ statusCode: 401, message: '对话身份已失效' })
      feedback.value = '身份已失效或对话不可访问，请重新登录。'
    },
  )
  const read = useRequestFetch()
  const request = useTaskPolling<SavedConversation>(
    `account-conversation-${ownerId}-${id}`,
    `/api/account/conversations/${id}`,
    (v) => activeChatTurn(v.currentTurn),
    {
      paused: events.connected,
      async read(signal) {
        const value = await read<SavedConversation>(
          `/api/account/conversations/${encodeURIComponent(id)}`,
          { signal, retry: 0, timeout: 15000 },
        )
        signal.throwIfAborted()
        if (disposed) throw new Error('页面已离开')
        return accept(value)
      },
    },
  )
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  watch(
    request.data,
    (value) => {
      if (value) accepted = accept(value)
    },
    { immediate: true },
  )
  watch(
    [() => request.data.value?.currentTurn, mounted],
    ([turn, ready]) => {
      if (!ready) return
      if (activeChatTurn(turn)) events.connect(turn!.id)
      else events.close()
    },
    { immediate: true },
  )
  async function refresh() {
    await request.refresh()
    if (!disposed && activeChatTurn(accepted?.currentTurn))
      events.reconnect(accepted!.currentTurn!.id)
  }
  async function stop() {
    const turn = accepted?.currentTurn
    if (!activeChatTurn(turn) || stopping.value || disposed) return
    const controller = new AbortController()
    controllers.add(controller)
    stopping.value = true
    feedback.value = ''
    try {
      const value = await $fetch<SavedConversation>(
        `/api/account/conversations/${id}/turns/${turn!.id}/cancel`,
        { method: 'POST', retry: 0, timeout: 20000, signal: controller.signal },
      )
      if (disposed || controller.signal.aborted) return
      request.data.value = accept(value)
      if (!activeChatTurn(accepted?.currentTurn)) events.close()
    } catch (error) {
      if (!disposed && !controller.signal.aborted)
        feedback.value = workspaceFeedback(error, '暂时无法确认停止结果，请重新读取对话。')
    } finally {
      controllers.delete(controller)
      if (!disposed) stopping.value = false
    }
  }
  const generating = computed(() => activeChatTurn(request.data.value?.currentTurn))
  const busy = computed(() => submitting.value || generating.value)
  async function send(question: string) {
    const cleaned = question.trim()
    if (
      !cleaned ||
      cleaned.length > 2000 ||
      submitting.value ||
      (generating.value && !pendingIntent.value) ||
      disposed ||
      !intents.ready.value
    )
      return false
    if (pendingIntent.value && pendingIntent.value.question !== cleaned) {
      feedback.value = '上一条提问尚未确认，请先用原内容确认发送。'
      return false
    }
    const intent = pendingIntent.value ?? {
      ownerId,
      slot,
      question: cleaned,
      requestKey: crypto.randomUUID(),
      versionId: null,
      conversationId: id,
    }
    const controller = new AbortController()
    controllers.add(controller)
    submitting.value = true
    feedback.value = ''
    try {
      intents.put(intent)
      await $fetch(`/api/account/conversations/${id}/messages`, {
        method: 'POST',
        body: { question: intent.question, requestKey: intent.requestKey },
        retry: 0,
        timeout: 20000,
        signal: controller.signal,
      })
      if (disposed || controller.signal.aborted) return false
      intents.remove(intent)
      clearNuxtData(
        (key) =>
          key.startsWith('account-conversations') ||
          key.startsWith('account-usage') ||
          key === 'home-recent',
      )
      await request.refresh()
      return !disposed
    } catch (error) {
      if (!disposed && !controller.signal.aborted)
        feedback.value = workspaceFeedback(error, '提问暂时未能确认，请用原内容重试。')
      return false
    } finally {
      controllers.delete(controller)
      if (!disposed) submitting.value = false
    }
  }
  onScopeDispose(() => {
    disposed = true
    events.close()
    for (const c of controllers) c.abort()
    controllers.clear()
    if (import.meta.client) request.clear()
  })
  return {
    request,
    refresh,
    busy,
    generating,
    submitting,
    feedback,
    send,
    stop,
    stopping,
    pendingIntent,
    recoveryReady: intents.ready,
    recoveryWarning: intents.warning,
    streamFeedback: events.feedback,
  }
}
