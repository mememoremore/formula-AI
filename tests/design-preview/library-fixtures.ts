import { createError, getCookie, getQuery, getRequestURL, readBody, type H3Event } from 'h3'
import type { FormulaLibraryItem, AccountCategory } from '../../shared/types/library'
import type { RecognitionHistoryItem } from '../../shared/types/tasks'

export const algebraId = '11111111-1111-4111-8111-111111111111'
export const calculusId = '22222222-2222-4222-8222-222222222222'
const modes = [
  'account',
  'empty',
  'error',
  'category-error',
  'more-error',
  'more-slow',
  'duplicates',
  'other',
  'history-error',
  'history-finish',
]
interface Store {
  formulas: FormulaLibraryItem[]
  categories: AccountCategory[]
}
const stores = new Map<string, Store>()
function storeFor(run: string) {
  if (!stores.has(run)) {
    if (stores.size >= 20) stores.delete(stores.keys().next().value!)
    stores.set(run, {
      categories: [
        { id: algebraId, name: '代数', formulaCount: 0 },
        { id: calculusId, name: '微积分', formulaCount: 0 },
      ],
      formulas: Array.from({ length: 5 }, (_, i) => ({
        id: 'r5-f' + (i + 1),
        title: '公式' + (i + 1) + '：记录与理解',
        latex:
          i === 0
            ? '\\sum_{k=1}^{n}k^2=\\frac{n(n+1)(2n+1)}{6}\\quad\\Longrightarrow\\quad\\lim_{n\\to\\infty}\\frac{1}{n^3}\\sum_{k=1}^{n}k^2=\\frac{1}{3}'
            : 'x^2-' + (i + 2) + 'x+1=0',
        createdAt: '2026-10-27T08:00:00.000Z',
        versionNumber: 1,
        isMock: false,
        favorite: i % 2 === 0,
        category:
          i === 4 ? null : { id: i % 2 ? calculusId : algebraId, name: i % 2 ? '微积分' : '代数' },
        imageId: null,
      })),
    })
  }
  return stores.get(run)!
}
function savedFormula(item: FormulaLibraryItem) {
  return {
    ...item,
    updatedAt: item.createdAt,
    image: null,
    versions: [
      {
        id: 'r5-version-' + item.id,
        number: 1,
        latex: item.latex,
        origin: 'MANUAL',
        isMock: false,
        createdAt: item.createdAt,
      },
    ],
  }
}
/** 独立预览层的内存替身；每次浏览器运行独立，不接触实际业务资源。 */
export async function libraryFixture(event: H3Event) {
  const mode = getCookie(event, 'r5-library')
  const run = getCookie(event, 'r5-run')
  const path = getRequestURL(event).pathname
  if (!mode || !modes.includes(mode) || !path.startsWith('/api/')) return undefined
  if (!run || !/^r5-[a-z0-9-]{1,80}$/.test(run))
    throw createError({ statusCode: 400, message: 'R5 缺少有效隔离运行编号' })
  const state = storeFor(run)
  const userId = mode === 'other' ? 'r5-other' : 'r5-user'
  if (path === '/api/account/session')
    return {
      user: {
        id: userId,
        name: '公式探索者',
        email: 'r5@example.invalid',
        emailVerified: true,
        image: null,
      },
    }
  const query = getQuery(event)
  if ((query.q === 'slow' || (mode === 'more-slow' && query.cursor)) && event.method === 'GET')
    await new Promise((r) => setTimeout(r, 1200))
  if (path === '/api/account/library') {
    if (mode === 'error' || (mode === 'more-error' && query.cursor))
      throw createError({ statusCode: 503, message: 'R5 声明的列表故障' })
    let rows = mode === 'empty' || mode === 'other' ? [] : state.formulas
    if (query.q)
      rows = rows.filter((item) =>
        (item.title + ' ' + item.latex).toLowerCase().includes(String(query.q).toLowerCase()),
      )
    if (query.category)
      rows = rows.filter((item) =>
        query.category === 'uncategorized' ? !item.category : item.category?.id === query.category,
      )
    if (query.favorites === 'true') rows = rows.filter((item) => item.favorite)
    const start = query.cursor ? rows.findIndex((item) => item.id === query.cursor) + 1 : 0
    let items = rows.slice(start, start + 2)
    const nextCursor = start + 2 < rows.length ? (items.at(-1)?.id ?? null) : null
    if (mode === 'duplicates' && query.cursor && items.length) items = [items[0]!, ...items]
    return { items, nextCursor }
  }
  if (path === '/api/account/categories') {
    if (mode === 'category-error')
      throw createError({ statusCode: 503, message: 'R5 声明的分类故障' })
    if (event.method === 'POST') {
      const body = await readBody<{ name: string }>(event)
      const category = {
        id: '33333333-3333-4333-8333-' + String(state.categories.length).padStart(12, '0'),
        name: body.name,
        formulaCount: 0,
      }
      state.categories.push(category)
      return category
    }
    if (mode === 'other' || mode === 'empty')
      return { items: [], totalCount: 0, uncategorizedCount: 0 }
    return {
      items: state.categories.map((category) => ({
        ...category,
        formulaCount: state.formulas.filter((item) => item.category?.id === category.id).length,
      })),
      totalCount: state.formulas.length,
      uncategorizedCount: state.formulas.filter((item) => !item.category).length,
    }
  }
  const categoryId = path.match(/^\/api\/account\/categories\/([^/]+)$/)?.[1]
  if (categoryId) {
    if (event.method === 'DELETE') {
      state.categories = state.categories.filter((item) => item.id !== categoryId)
      state.formulas = state.formulas.map((item) =>
        item.category?.id === categoryId ? { ...item, category: null } : item,
      )
      return { ok: true }
    }
    if (event.method === 'PATCH') {
      const body = await readBody<{ name: string }>(event)
      state.categories = state.categories.map((item) =>
        item.id === categoryId ? { ...item, name: body.name } : item,
      )
      state.formulas = state.formulas.map((item) =>
        item.category?.id === categoryId
          ? { ...item, category: { id: categoryId, name: body.name } }
          : item,
      )
      return state.categories.find((item) => item.id === categoryId)
    }
  }
  const formula = path.match(/^\/api\/account\/formulas\/(r5-f\d+)(?:\/(favorite|category))?$/)
  if (formula) {
    const item = state.formulas.find((item) => item.id === formula[1])!
    if (formula[2] === 'favorite') {
      const body = await readBody<{ favorite: boolean }>(event)
      item.favorite = body.favorite
      return { favorite: item.favorite }
    }
    if (formula[2] === 'category') {
      const body = await readBody<{ categoryId: string | null }>(event)
      item.category = state.categories.find((category) => category.id === body.categoryId) ?? null
    }
    return savedFormula(item)
  }
  if (path === '/api/account/recognitions') {
    if (mode === 'history-error')
      throw createError({ statusCode: 503, message: 'R5 声明的历史故障' })
    let rows: RecognitionHistoryItem[] = Array.from({ length: 4 }, (_, i) => ({
      id: 'r5-t' + (i + 1),
      title: '识别记录' + (i + 1),
      createdAt: '2026-10-27T08:00:00.000Z',
      status:
        i === 2
          ? mode === 'history-finish'
            ? 'COMPLETED'
            : 'PROCESSING'
          : i === 3
            ? 'FAILED'
            : 'COMPLETED',
      formulaId: i === 2 && mode !== 'history-finish' ? null : 'r5-f' + (i + 1),
      latex: i === 2 && mode !== 'history-finish' ? null : 'x=' + i,
      errorMessage: i === 3 ? '受控识别失败' : null,
    }))
    if (mode === 'history-finish')
      rows = [{ ...rows[0]!, id: 'r5-t-new', title: '新增识别记录' }, ...rows]
    if (mode === 'other' || mode === 'empty') rows = []
    const start = query.cursor ? rows.findIndex((item) => item.id === query.cursor) + 1 : 0
    const items = rows.slice(start, start + 2)
    return { items, nextCursor: start + 2 < rows.length ? (items.at(-1)?.id ?? null) : null }
  }
  throw createError({ statusCode: 503, message: 'R5 替身拒绝未声明的接口' })
}

export function hasLibraryFixture(event: H3Event) {
  const mode = getCookie(event, 'r5-library')
  return !!mode && modes.includes(mode)
}
