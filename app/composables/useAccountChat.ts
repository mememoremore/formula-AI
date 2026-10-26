import type { SavedConversation } from '#shared/types/tasks'
import { workspaceFeedback } from '~/utils/workspace-feedback'

export function useAccountChat(id: string) {
  const events = useConversationEvents(id, (value) => {
    request.data.value = value
    request.error.value = undefined
  })
  const request = useTaskPolling<SavedConversation>(
    `account-conversation-${id}`,
    `/api/account/conversations/${id}`,
    (conversation) =>
      !!conversation.currentTurn &&
      ['QUEUED', 'PROCESSING'].includes(conversation.currentTurn.status),
    { paused: events.connected },
  )
  const mounted = ref(false)
  onMounted(() => {
    mounted.value = true
  })
  watch(
    [() => request.data.value?.currentTurn, mounted],
    ([turn, ready]) => {
      if (!ready) return
      if (turn && ['QUEUED', 'PROCESSING'].includes(turn.status)) events.connect(turn.id)
      else events.close()
    },
    { immediate: true },
  )
  const submitting = ref(false)
  const feedback = ref('')
  const stopping = ref(false)
  async function stop() {
    const turn = request.data.value?.currentTurn
    if (!turn || stopping.value) return
    stopping.value = true
    try {
      const value = await $fetch<SavedConversation>(
        `/api/account/conversations/${id}/turns/${turn.id}/cancel`,
        { method: 'POST', retry: 0, timeout: 20000 },
      )
      request.data.value = value
      events.close()
    } catch (error) {
      feedback.value = workspaceFeedback(error, '暂时无法确认停止结果，请重新读取对话。')
    } finally {
      stopping.value = false
    }
  }
  const busy = computed(
    () =>
      submitting.value ||
      (!!request.data.value?.currentTurn &&
        ['QUEUED', 'PROCESSING'].includes(request.data.value.currentTurn.status)),
  )
  let previousQuestion = ''
  let requestKey = ''
  async function send(question: string) {
    const cleaned = question.trim()
    if (!cleaned || cleaned.length > 2000 || busy.value) return false
    if (cleaned !== previousQuestion) {
      previousQuestion = cleaned
      requestKey = ''
    }
    requestKey ||= crypto.randomUUID()
    submitting.value = true
    feedback.value = ''
    try {
      await $fetch(`/api/account/conversations/${id}/messages`, {
        method: 'POST',
        body: { question: cleaned, requestKey },
        retry: 0,
        timeout: 20000,
      })
      requestKey = ''
      await request.refresh()
      clearNuxtData('account-usage')
      return true
    } catch (error) {
      feedback.value = workspaceFeedback(error, '提问暂时未能确认，请用原内容重试。')
      return false
    } finally {
      submitting.value = false
    }
  }
  return { request, busy, feedback, send, stop, stopping, streamFeedback: events.feedback }
}
