import {
  createError,
  getCookie,
  getRequestURL,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'
import type { SavedFormula } from '../../shared/types/workspace'
const states = new Map<string, SavedFormula>()
export const detailLatex =
  '\\begin{aligned} A&=\\begin{pmatrix}1&2&3\\\\4&5&6\\end{pmatrix}\\\\ \\int_0^1x^2\\,dx&=\\frac13\\quad\\Longrightarrow\\quad\\sum_{k=1}^n k^2=\\frac{n(n+1)(2n+1)}6\\end{aligned}'
export function hasDetailFixture(event: H3Event) {
  return !!getCookie(event, 'r6-detail')
}
/** 仅显式预览层的内存替身，绝不创建账号、队列或文件。 */
export async function detailFixture(event: H3Event) {
  const mode = getCookie(event, 'r6-detail')!,
    run = getCookie(event, 'r6-run')
  if (!run || !/^r6-[a-z0-9-]{1,80}$/.test(run))
    throw createError({ statusCode: 400, message: '无效 R6 运行编号' })
  const path = getRequestURL(event).pathname
  setResponseHeader(event, 'Cache-Control', 'no-store')
  if (!states.has(run)) {
    if (states.size >= 20) states.delete(states.keys().next().value!)
    states.set(run, {
      id: 'r6-formula',
      title: '矩阵与定积分：一次公式探索',
      createdAt: '2026-10-27T08:00:00Z',
      updatedAt: '2026-10-27T08:00:00Z',
      category: { id: '11111111-1111-4111-8111-111111111111', name: '代数' },
      favorite: false,
      image: {
        id: 'r6-image',
        name: '隔离测试原图.svg',
        mimeType: 'image/svg+xml',
        sizeBytes: 100,
        width: 640,
        height: 240,
      },
      versions: [
        {
          id: 'r6-v1',
          number: 1,
          latex: 'x^2-5x+6=0',
          origin: 'RECOGNITION',
          isMock: false,
          createdAt: '2026-10-26T08:00:00Z',
        },
        {
          id: 'r6-v2',
          number: 2,
          latex: detailLatex,
          origin: 'MANUAL',
          isMock: false,
          createdAt: '2026-10-27T08:00:00Z',
        },
      ],
    })
  }
  const formula = states.get(run)!
  if (path === '/api/account/session' && mode === 'session-error')
    throw createError({ statusCode: 503, message: '受控身份读取失败' })
  if (path === '/api/account/session')
    return {
      user:
        mode === 'logout'
          ? null
          : {
              id: mode === 'other' ? 'r6-other' : 'r6-user',
              name: '公式探索者',
              email: 'r6@example.invalid',
              emailVerified: true,
              image: null,
            },
    }
  if (mode === 'other') throw createError({ statusCode: 404, message: '当前账号无此资源' })
  if (path === '/api/account/library')
    return {
      items: [
        {
          ...formula,
          latex: formula.versions.at(-1)!.latex,
          versionNumber: formula.versions.at(-1)!.number,
          isMock: false,
          imageId: 'r6-image',
        },
      ],
      nextCursor: null,
    }
  if (path === '/api/account/categories') {
    if (mode === 'category-error') throw createError({ statusCode: 503, message: '分类读取失败' })
    return {
      items: [
        { id: '11111111-1111-4111-8111-111111111111', name: '代数', formulaCount: 1 },
        { id: '22222222-2222-4222-8222-222222222222', name: '微积分', formulaCount: 0 },
      ],
      totalCount: 1,
      uncategorizedCount: 0,
    }
  }
  if (path === '/api/account/files/r6-image/content') {
    setResponseHeader(event, 'Content-Type', 'image/svg+xml')
    return '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="240" viewBox="0 0 640 240"><rect width="640" height="240" fill="#fffcf7"/><text x="45" y="65" fill="#62657d" font-size="20">R6 isolated image fixture</text><text x="80" y="150" font-family="serif" font-style="italic" font-size="44" fill="#151631">x² − 5x + 6 = 0</text></svg>'
  }
  if (path === '/api/account/formulas/r6-formula' && event.method === 'GET') {
    if (mode === 'error') throw createError({ statusCode: 503, message: '受控读取失败' })
    if (mode === 'notfound') throw createError({ statusCode: 404, message: '未找到这条公式' })
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 800))
    return formula
  }
  if (path === '/api/account/formulas/r6-formula/versions') {
    const body = await readBody<{ title: string; latex: string; expectedVersionId: string }>(event)
    if (mode === 'save-error') throw createError({ statusCode: 503, message: '受控保存失败' })
    if (mode === 'slow') await new Promise((r) => setTimeout(r, 800))
    if (mode === 'conflict' || body.expectedVersionId !== formula.versions.at(-1)!.id)
      throw createError({ statusCode: 409, message: '公式已被修改' })
    if (body.latex.trim() !== formula.versions.at(-1)!.latex)
      formula.versions.push({
        id: 'r6-v' + (formula.versions.length + 1),
        number: formula.versions.length + 1,
        latex: body.latex.trim(),
        origin: 'MANUAL',
        isMock: false,
        createdAt: '2026-10-27T09:00:00Z',
      })
    formula.title = body.title.trim()
    return formula
  }
  if (path === '/api/account/formulas/r6-formula/favorite') {
    if (mode === 'favorite-error') throw createError({ statusCode: 503, message: '受控收藏失败' })
    formula.favorite = (await readBody<{ favorite: boolean }>(event)).favorite
    return { favorite: formula.favorite }
  }
  if (path === '/api/account/formulas/r6-formula/category') {
    const id = (await readBody<{ categoryId: string | null }>(event)).categoryId
    formula.category = id ? { id, name: id.startsWith('111') ? '代数' : '微积分' } : null
    return formula
  }
  if (path === '/api/account/exports') {
    const body = await readBody<{ formulaVersionId: string; requestKey: string }>(event)
    if (!formula.versions.some((v) => v.id === body.formulaVersionId))
      throw createError({ statusCode: 400, message: '无效版本' })
    if (mode === 'export-error') throw createError({ statusCode: 503, message: '受控导出失败' })
    setResponseStatus(event, 202)
    return {
      id: 'r6-export',
      status: 'QUEUED',
      formulaVersionId: body.formulaVersionId,
      versionNumber: formula.versions.find((v) => v.id === body.formulaVersionId)!.number,
    }
  }
  if (path === '/api/account/exports/r6-export')
    return { id: 'r6-export', status: 'QUEUED', versionNumber: 1, canRetry: false }
  throw createError({ statusCode: 404, message: 'R6 替身拒绝未声明的接口：' + path })
}
