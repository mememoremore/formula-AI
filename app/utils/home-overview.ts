import type { RecognitionHistoryPage } from '../../shared/types/tasks'
import type { DemoState } from '../../shared/types/demo'

export interface HomeRecent {
  ownerId: string | null
  recognitions: RecognitionHistoryPage['items']
  failed: boolean
}
export const emptyHomeRecent = (): HomeRecent => ({
  ownerId: null,
  recognitions: [],
  failed: false,
})
type HomeRequest = <T>(
  path: string,
  options: { signal: AbortSignal; retry: 0; timeout: number },
) => Promise<T>

/** 首页只取识别历史，手动输入和 AI 会话不进入最近识别。 */
export async function loadHomeRecent(
  ownerId: string,
  request: HomeRequest,
  signal: AbortSignal,
): Promise<HomeRecent> {
  const options = { signal, retry: 0 as const, timeout: 10_000 }

  try {
    const page = await request<RecognitionHistoryPage>('/api/account/recognitions', options)

    signal.throwIfAborted()
    return { ownerId, recognitions: page.items.slice(0, 10), failed: false }
  } catch {
    signal.throwIfAborted()
    return { ownerId, recognitions: [], failed: true }
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
