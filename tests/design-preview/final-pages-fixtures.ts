import {
  createError,
  getCookie,
  getRequestURL,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'
import type { ExportTaskState } from '../../shared/types/tasks'
interface State {
  sessions: number
  keys: string[]
  lost: boolean
  downloads: number
  task: ExportTaskState
}
const states = new Map<string, State>()
export function hasFinalFixture(event: H3Event) {
  return !!getCookie(event, 'r10-final')
}
export async function finalFixture(event: H3Event) {
  const mode = getCookie(event, 'r10-final')!,
    run = getCookie(event, 'r10-run')
  if (!run || !/^r10-[a-z0-9-]{1,80}$/.test(run))
    throw createError({ statusCode: 400, message: '无效R10运行编号' })
  if (!states.has(run)) {
    if (states.size >= 40) states.delete(states.keys().next().value!)
    states.set(run, {
      sessions: 0,
      keys: [],
      lost: false,
      downloads: 0,
      task: {
        id: 'r10-export',
        status:
          mode === 'failed' || mode === 'retry-lost'
            ? 'FAILED'
            : mode === 'queued'
              ? 'QUEUED'
              : mode === 'processing'
                ? 'PROCESSING'
                : 'COMPLETED',
        attemptCount: 1,
        maxAttempts: 3,
        errorMessage: mode === 'failed' || mode === 'retry-lost' ? '本次文档暂时无法生成。' : null,
        title: '一元二次方程',
        formulaId: 'r10-formula',
        formulaVersionId: 'r10-version',
        versionNumber: 1,
        downloadUrl:
          mode === 'queued' ||
          mode === 'processing' ||
          mode === 'failed' ||
          mode === 'retry-lost' ||
          mode === 'missing-file'
            ? null
            : '/api/account/exports/r10-export/download',
        file: { name: '一元二次方程-v1.docx', sizeBytes: 2048 },
      },
    })
  }
  const state = states.get(run)!,
    path = getRequestURL(event).pathname
  if (path === '/api/__r10debug') {
    if (event.method === 'POST') {
      const body = await readBody<{ action: string }>(event)
      if (body.action === 'complete')
        state.task = {
          ...state.task,
          status: 'COMPLETED',
          downloadUrl: '/api/account/exports/r10-export/download',
        }
    }
    return state
  }
  if (path === '/api/account/session') {
    state.sessions++
    if (mode === 'session-error') throw createError({ statusCode: 503, message: '受控身份故障' })
    return {
      user:
        mode === 'guest' || mode === 'logout'
          ? null
          : {
              id: mode === 'other' ? 'r10-other' : 'r10-owner',
              name: '公式探索者',
              email: 'private-r10@example.test',
              emailVerified: true,
              image: null,
            },
    }
  }
  if (mode === 'other' || mode === 'notfound')
    throw createError({ statusCode: 404, message: '未找到导出任务' })
  if (mode === 'logout') throw createError({ statusCode: 401, message: '请登录' })
  if (path === '/api/account/usage')
    return {
      day: '2026-10-27',
      resetsAt: '2026-10-28T00:00:00Z',
      items: ['RECOGNITION', 'CHAT', 'EXPORT'].map((kind) => ({
        kind,
        used: 2,
        remaining: 18,
        limit: 20,
      })),
    }
  if (path === '/api/account/exports' && event.method === 'POST') {
    const body = await readBody<{ requestKey: string; formulaVersionId: string }>(event)
    state.keys.push(body.requestKey)
    await new Promise((resolve) => setTimeout(resolve, 300))
    if (mode === 'retry-lost' && !state.lost) {
      state.lost = true
      throw createError({ statusCode: 503, message: '提交结果未确认' })
    }
    setResponseStatus(event, 202)
    return {
      ...state.task,
      id: 'r10-retried',
      status: 'QUEUED',
      downloadUrl: null,
      formulaVersionId: body.formulaVersionId,
      errorMessage: null,
    }
  }
  if (path.endsWith('/download')) {
    state.downloads++
    await new Promise((resolve) => setTimeout(resolve, 200))
    if (mode === 'download-error') throw createError({ statusCode: 503, message: '受控下载故障' })
    setResponseHeader(
      event,
      'content-type',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    )
    setResponseHeader(event, 'content-disposition', 'attachment; filename="formula-v1.docx"')
    return Buffer.from('R10 controlled document download fixture')
  }
  if (path.startsWith('/api/account/exports/')) {
    if (mode === 'network') throw createError({ statusCode: 503, message: '受控读取故障' })
    return {
      ...state.task,
      ...(path.endsWith('r10-retried')
        ? { id: 'r10-retried', status: 'QUEUED', downloadUrl: null, errorMessage: null }
        : {}),
    }
  }
  throw createError({ statusCode: 501, message: 'R10替身拒绝未声明请求：' + path })
}
