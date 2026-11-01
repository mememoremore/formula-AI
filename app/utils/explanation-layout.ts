interface Message {
  id: string
  role: 'USER' | 'ASSISTANT'
  content: string
}
/** Keep the initial request above its structured answer without duplicating either in follow-ups. */
export function explanationLayout<T extends Message>(conversation: {
  purpose?: 'CHAT' | 'EXPLANATION'
  baseExplanation?: { messageId: string } | null
  messages: T[]
  hasEarlierMessages: boolean
}) {
  if (conversation.purpose !== 'EXPLANATION')
    return { question: null, messages: conversation.messages }
  const baseId = conversation.baseExplanation?.messageId
  const index = conversation.messages.findIndex((row) => row.id === baseId)
  const questionIndex =
    index > 0 && conversation.messages[index - 1]?.role === 'USER'
      ? index - 1
      : !conversation.hasEarlierMessages && conversation.messages[0]?.role === 'USER'
        ? 0
        : -1
  const initial = conversation.messages[questionIndex]
  const automatic = initial?.content === '请结构化解释这个固定版本公式。'
  return {
    question: !initial || automatic ? '请解释这个公式。' : initial.content,
    messages: conversation.messages.filter((row) => row.id !== baseId && row.id !== initial?.id),
  }
}
