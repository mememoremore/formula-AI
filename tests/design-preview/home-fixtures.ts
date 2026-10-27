import { createError } from 'h3'
import type { FormulaLibraryPage } from '../../shared/types/library'
import type { ConversationPage } from '../../shared/types/tasks'

export const homeScenarios = [
  'records',
  'empty',
  'formulas-error',
  'conversations-error',
  'records-error',
  'session-error',
  'other',
  'slow',
  'long',
] as const
export type HomeScenario = (typeof homeScenarios)[number]
export function isHomeScenario(value: unknown): value is HomeScenario {
  return homeScenarios.some((scenario) => scenario === value)
}
const createdAt = '2026-10-26T08:00:00.000Z'
const library: FormulaLibraryPage = {
  items: [
    {
      id: 'r4-formula',
      title: '一元二次方程的根',
      createdAt,
      latex: 'x^2-5x+6=0',
      versionNumber: 1,
      isMock: false,
      favorite: false,
      category: null,
      imageId: null,
    },
  ],
  nextCursor: null,
}
const conversations: ConversationPage = {
  items: [
    {
      id: 'r4-chat',
      title: '理解求根公式',
      createdAt,
      preview: '为什么判别式可以判断实数根的个数？',
      latex: 'b^2-4ac',
    },
  ],
  nextCursor: null,
}

/** 仅显式预览层的声明式替身，不创建真实账号/任务/对象。 */
export async function homeFixtureResponse(path: string, scenario: HomeScenario) {
  if (path === '/api/account/session') {
    if (scenario === 'session-error')
      throw createError({ statusCode: 503, message: 'R4 测试会话故障' })
    return {
      user: {
        id: scenario === 'other' ? 'r4-other-user' : 'r4-user',
        name: '公式探索者',
        email: 'r4@example.invalid',
        emailVerified: true,
        image: null,
      },
    }
  }
  if (scenario === 'slow') await new Promise((resolve) => setTimeout(resolve, 1200))
  if (path === '/api/account/library') {
    if (scenario === 'formulas-error' || scenario === 'records-error')
      throw createError({ statusCode: 503, message: 'R4 测试公式故障' })
    return scenario === 'empty' || scenario === 'other' ? { items: [], nextCursor: null } : library
  }
  if (path === '/api/account/conversations') {
    if (scenario === 'conversations-error' || scenario === 'records-error')
      throw createError({ statusCode: 503, message: 'R4 测试对话故障' })
    if (scenario === 'long')
      return {
        ...library,
        items: library.items.map((item) => ({
          ...item,
          title: '包含较长标题的数学公式，需要完整阅读与核对每一个符号',
          latex:
            '\\sum_{k=1}^{n} k^2=\\frac{n(n+1)(2n+1)}{6} \\quad \\Longrightarrow \\quad \\lim_{n\\to\\infty} \\frac{1}{n^3}\\sum_{k=1}^{n}k^2=\\frac{1}{3}',
        })),
      }
    return scenario === 'empty' || scenario === 'other'
      ? { items: [], nextCursor: null }
      : conversations
  }
  if (path.startsWith('/api/'))
    throw createError({ statusCode: 503, message: 'R4 替身不允许调用未声明接口' })
}
