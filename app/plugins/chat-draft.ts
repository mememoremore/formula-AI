export interface ChatIntent {
  ownerId: string
  slot: string
  question: string
  requestKey: string
  versionId: string | null
  conversationId: string | null
}
/** 仅保存未确认请求，成功即删除；不持久化完整聊天记录或未发送草稿。 */
export default defineNuxtPlugin(() => {
  const items = ref<ChatIntent[]>([]),
    question = ref(''),
    ready = ref(false),
    warning = ref('')
  const storageKey = 'formula-ai:chat-pending:v1'
  let owner: string | null | undefined
  function persist() {
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(items.value))
      warning.value = ''
      return true
    } catch {
      warning.value = '无法保存待确认请求，请允许会话存储后重试；不要重复创建对话。'
      return false
    }
  }
  function confirmOwner(id: string | null) {
    if (owner !== undefined && owner !== id) question.value = ''
    owner = id
    if (ready.value) {
      items.value = items.value.filter((row) => row.ownerId === id)
      persist()
    }
  }
  function put(value: ChatIntent) {
    if (!ready.value)
      throw createError({ statusCode: 400, message: '正在读取待确认请求，请稍后重试。' })
    const next = [
      ...items.value.filter((row) => row.ownerId !== value.ownerId || row.slot !== value.slot),
      value,
    ]
    if (next.length > 10)
      throw createError({
        statusCode: 400,
        message: '待确认请求较多，请先核对已有会话，不会发送新的请求。',
      })
    items.value = next
    if (!persist())
      throw createError({
        statusCode: 400,
        data: { message: warning.value },
        message: warning.value,
      })
  }
  function remove(value: ChatIntent) {
    items.value = items.value.filter(
      (row) => row.ownerId !== value.ownerId || row.slot !== value.slot,
    )
    persist()
  }
  function clear() {
    question.value = ''
    owner = null
    items.value = []
    if (ready.value) persist()
  }
  if (import.meta.client)
    onNuxtReady(() => {
      try {
        const rows: unknown = JSON.parse(sessionStorage.getItem(storageKey) ?? '[]')
        if (!Array.isArray(rows) || rows.length > 10) throw new Error('无效恢复信息')
        const parsed: ChatIntent[] = []
        for (const row of rows) {
          if (!row || typeof row !== 'object') throw new Error('无效请求')
          const r = row as Record<string, unknown>
          if (
            !['ownerId', 'slot', 'question', 'requestKey'].every(
              (key) => typeof r[key] === 'string' && String(r[key]).length > 0,
            ) ||
            String(r.question).length > 2000 ||
            ![r.versionId, r.conversationId].every(
              (value) => value === null || typeof value === 'string',
            )
          )
            throw new Error('无效请求')
          const value = {
            ownerId: String(r.ownerId),
            slot: String(r.slot),
            question: String(r.question),
            requestKey: String(r.requestKey),
            versionId: r.versionId as string | null,
            conversationId: r.conversationId as string | null,
          }
          if (parsed.some((item) => item.ownerId === value.ownerId && item.slot === value.slot))
            throw new Error('重复请求')
          parsed.push(value)
        }
        items.value = parsed
      } catch {
        warning.value =
          '待确认请求无法恢复，已暂停发送。请先核对账号会话记录，检查会话存储后重新加载。'
        return
      }
      ready.value = true
      if (owner !== undefined) confirmOwner(owner)
    })
  return {
    provide: { chatDraft: { items, question, ready, warning, put, remove, confirmOwner, clear } },
  }
})
