import type { SavedConversation, AccountMessage, ChatTurnState } from '../../shared/types/tasks'
const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object'
const nullableText = (value: unknown) => value === null || typeof value === 'string'
/** 已校验的非负十进制串按长度/字典序比较，避免丢精度和客户端BigInt目标限制。 */
function compareRevisions(a: string, b: string) {
  if (a.length !== b.length) return a.length > b.length ? 1 : -1
  return a === b ? 0 : a > b ? 1 : -1
}
/** SSE 是外部 JSON，不能靠类型断言跳过运行时协议检查。 */
export function parseConversationSnapshot(
  value: unknown,
  id: string,
  requireRevision = false,
): SavedConversation {
  if (
    !record(value) ||
    value.id !== id ||
    typeof value.title !== 'string' ||
    typeof value.hasEarlierMessages !== 'boolean' ||
    !Array.isArray(value.messages) ||
    value.messages.length > 100
  )
    throw new Error('无效对话快照')
  if (
    (requireRevision || value.protocolVersion !== undefined || value.revision !== undefined) &&
    (value.protocolVersion !== 2 ||
      typeof value.revision !== 'string' ||
      !/^(0|[1-9]\d{0,18})$/.test(value.revision) ||
      compareRevisions(value.revision, '9223372036854775807') > 0)
  )
    throw new Error('对话协议需要刷新，缺少有效修订号')
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
function snapshotContent(value: SavedConversation) {
  const c = value.context,
    t = value.currentTurn
  return JSON.stringify([
    value.id,
    value.title,
    value.hasEarlierMessages,
    c && [c.id, c.formulaId, c.title, c.number, c.latex],
    value.messages.map((m) => [
      m.id,
      m.role,
      m.content,
      m.status,
      m.isMock,
      m.modelVersion,
      m.position,
    ]),
    t && [
      t.id,
      t.status,
      t.attemptCount,
      t.maxAttempts,
      t.errorMessage,
      t.partialContent,
      t.isMock,
      t.modelVersion,
    ],
  ])
}
/** 只使用协议已有的服务端事实，不用到达时间充当服务端版本号。 */
export function acceptConversationSnapshot(
  previous: SavedConversation | undefined,
  next: SavedConversation,
) {
  if (!previous) return next
  if (previous.id !== next.id) throw new Error('对话响应不匹配')
  if (previous.protocolVersion === 2 || next.protocolVersion === 2) {
    parseConversationSnapshot(next, previous.id, true)
    if (previous.revision !== undefined) {
      const order = compareRevisions(next.revision!, previous.revision)
      if (order < 0) return previous
      if (order === 0) {
        if (snapshotContent(previous) !== snapshotContent(next))
          throw new Error('相同修订号包含冲突内容，请重新读取对话')
        return previous
      }
    }
    if (
      previous.context?.id !== next.context?.id ||
      previous.context?.latex !== next.context?.latex ||
      previous.context?.number !== next.context?.number ||
      previous.context?.formulaId !== next.context?.formulaId
    )
      throw new Error('固定公式上下文发生冲突')
    const known = new Map(previous.messages.map((m) => [m.id, m]))
    for (const m of next.messages) {
      const old = known.get(m.id)
      if (
        old &&
        (old.content !== m.content ||
          old.role !== m.role ||
          old.status !== m.status ||
          old.position !== m.position ||
          old.isMock !== m.isMock ||
          old.modelVersion !== m.modelVersion)
      )
        throw new Error('持久化消息发生冲突')
    }
    if (
      previous.currentTurn?.id === next.currentTurn?.id &&
      previous.currentTurn &&
      next.currentTurn &&
      !activeChatTurn(previous.currentTurn) &&
      activeChatTurn(next.currentTurn)
    )
      throw new Error('已结束轮次发生状态冲突')
    return next
  }
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
