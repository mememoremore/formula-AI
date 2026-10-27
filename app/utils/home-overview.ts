import type { FormulaLibraryPage } from '../../shared/types/library'
import type { ConversationPage } from '../../shared/types/tasks'
import type { DemoState } from '../../shared/types/demo'

export interface HomeRecent {
  ownerId: string | null
  formulas: FormulaLibraryPage['items']
  conversation: ConversationPage['items'][number] | null
  failed: ('formulas' | 'conversations')[]
}
export const emptyHomeRecent = (): HomeRecent => ({
  ownerId: null,
  formulas: [],
  conversation: null,
  failed: [],
})
type HomeRequest = <T>(
  path: string,
  options: { signal: AbortSignal; retry: 0; timeout: number },
) => Promise<T>

/** 部分失败不能遮住另一组成功记录。 */
export async function loadHomeRecent(
  ownerId: string,
  request: HomeRequest,
  signal: AbortSignal,
): Promise<HomeRecent> {
  const options = { signal, retry: 0 as const, timeout: 10_000 }
  const [formulas, conversations] = await Promise.allSettled([
    request<FormulaLibraryPage>('/api/account/library', options),
    request<ConversationPage>('/api/account/conversations', options),
  ])
  signal.throwIfAborted()
  return {
    ownerId,
    formulas: formulas.status === 'fulfilled' ? formulas.value.items.slice(0, 1) : [],
    conversation:
      conversations.status === 'fulfilled' ? (conversations.value.items[0] ?? null) : null,
    failed: [
      ...(formulas.status === 'rejected' ? ['formulas' as const] : []),
      ...(conversations.status === 'rejected' ? ['conversations' as const] : []),
    ],
  }
}

/** 没有活动时间；按存储顺序选可恢复的非空会话，不伪造最近时间。 */
export function homeDemoConversation(state: DemoState) {
  for (const [key, messages] of Object.entries(state.chats)) {
    if (!messages.length) continue
    const subtitle =
      messages.filter((message) => message.role === 'user').at(-1)?.content ?? '继续上次的思考'
    if (key === 'general')
      return { title: '自由提问', subtitle, to: '/ai/new?space=demo', latex: undefined }
    if (!key.startsWith('version:')) continue
    const versionId = key.slice('version:'.length)
    const formula = state.formulas.find((item) =>
      item.versions.some((version) => version.id === versionId),
    )
    const version = formula?.versions.find((item) => item.id === versionId)
    if (formula && version)
      return {
        title: formula.title,
        subtitle,
        latex: version.latex,
        to:
          '/ai/new?space=demo&formulaId=' +
          encodeURIComponent(formula.id) +
          '&demoVersionId=' +
          encodeURIComponent(version.id),
      }
  }
}
