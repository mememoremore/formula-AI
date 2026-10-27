import type { SavedConversation, AccountMessage, ChatTurnState } from '../../shared/types/tasks'
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const nullableText = (value: unknown) => value === null || typeof value === 'string'
/** SSE 是外部 JSON，不能靠类型断言跳过运行时协议检查。 */
export function parseConversationSnapshot(value: unknown, id: string): SavedConversation {
  if (
    !record(value) ||
    value.id !== id ||
    typeof value.title !== 'string' ||
    typeof value.hasEarlierMessages !== 'boolean' ||
    !Array.isArray(value.messages) ||
    value.messages.length > 100
  )
    throw new Error('无效对话快照')
  let position = 0
  for (const row of value.messages) {
    if (
      !record(row) ||
      typeof row.id !== 'string' ||
      !['USER', 'ASSISTANT'].includes(String(row.role)) ||
      typeof row.content !== 'string' ||
      !['STREAMING', 'COMPLETED', 'FAILED'].includes(String(row.status)) ||
      typeof row.isMock !== 'boolean' ||
      !nullableText(row.modelVersion) ||
      !Number.isInteger(row.position) ||
      Number(row.position) <= position
    )
      throw new Error('无效消息快照')
    position = Number(row.position)
  }
  const turn = value.currentTurn
  if (
    turn !== null &&
    (!record(turn) ||
      typeof turn.id !== 'string' ||
      !['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'].includes(String(turn.status)) ||
      !Number.isInteger(turn.attemptCount) ||
      Number(turn.attemptCount) < 0 ||
      !Number.isInteger(turn.maxAttempts) ||
      typeof turn.partialContent !== 'string' ||
      !nullableText(turn.errorMessage) ||
      typeof turn.isMock !== 'boolean' ||
      !nullableText(turn.modelVersion))
  )
    throw new Error('无效轮次快照')
  const context = value.context
  if (
    context !== null &&
    (!record(context) ||
      !['id', 'formulaId', 'title', 'latex'].every((key) => typeof context[key] === 'string') ||
      !Number.isInteger(context.number))
  )
    throw new Error('无效公式上下文')
  return value as unknown as SavedConversation
}
export const activeChatTurn = (turn: ChatTurnState | null | undefined) =>
  !!turn && ['QUEUED', 'PROCESSING'].includes(turn.status)
/** 只使用协议已有的服务端事实，不用到达时间充当服务端版本号。 */
export function acceptConversationSnapshot(
  previous: SavedConversation | undefined,
  next: SavedConversation,
) {
  if (!previous) return next
  if (previous.id !== next.id) throw new Error('对话响应不匹配')
  const oldMax = previous.messages.at(-1)?.position ?? 0,
    newMax = next.messages.at(-1)?.position ?? 0
  if (newMax < oldMax) return previous
  const known = new Map<number, AccountMessage>(previous.messages.map((m) => [m.position, m]))
  for (const message of next.messages) {
    const old = known.get(message.position)
    if (
      old &&
      (old.id !== message.id ||
        old.role !== message.role ||
        old.content !== message.content ||
        old.status !== message.status)
    )
      return previous
  }
  const old = previous.currentTurn,
    turn = next.currentTurn
  if (old && turn && old.id === turn.id) {
    if (turn.attemptCount < old.attemptCount) return previous
    if (!activeChatTurn(old)) {
      if (turn.status !== old.status || activeChatTurn(turn)) return previous
    } else if (
      turn.attemptCount === old.attemptCount &&
      activeChatTurn(turn) &&
      turn.status !== 'QUEUED' &&
      !turn.partialContent.startsWith(old.partialContent)
    )
      return previous
  } else if (old?.id !== turn?.id && newMax <= oldMax) return previous
  return next
}
