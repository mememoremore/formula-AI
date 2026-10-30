import {
  createError,
  getCookie,
  getRequestURL,
  getHeader,
  readBody,
  readRawBody,
  setResponseStatus,
  type H3Event,
} from 'h3'
import type { RecognitionTaskState } from '../../shared/types/tasks'
interface State {
  uploads: string[]
  submissions: { key: string; mode: string; fileId: string }[]
  files: Map<string, string>
  tasks: Map<string, RecognitionTaskState>
  lostUpload: boolean
  lostSubmit: boolean
  reads: number
}
const states = new Map<string, State>()
export function hasRecognitionFixture(event: H3Event) {
  return !!getCookie(event, 'r7-recognition')
}
export async function recognitionFixture(event: H3Event) {
  const mode = getCookie(event, 'r7-recognition'),
    run = getCookie(event, 'r7-run')
  if (!run || !/^r7-[a-z0-9-]{1,80}$/.test(run))
    throw createError({ statusCode: 400, message: '无效 R7 运行编号' })
  if (!states.has(run)) {
    if (states.size >= 32) states.delete(states.keys().next().value!)
    states.set(run, {
      uploads: [],
      submissions: [],
      files: new Map(),
      tasks: new Map(),
      lostUpload: false,
      lostSubmit: false,
      reads: 0,
    })
  }
  const state = states.get(run)!,
    path = getRequestURL(event).pathname
  if (path === '/api/account/session') {
    if (mode === 'session-error') throw createError({ statusCode: 503, message: '受控身份故障' })
    return {
      user:
        mode === 'guest' || mode === 'logout'
          ? null
          : {
              id: mode === 'other' ? 'r7-other' : 'r7-user',
              name: '公式探索者',
              email: 'r7@example.invalid',
              emailVerified: true,
              image: null,
            },
    }
  }
  if (path === '/api/__r7debug')
    return {
      uploads: state.uploads,
      submissions: state.submissions,
      tasks: state.tasks.size,
      files: state.files.size,
      reads: state.reads,
    }
  if (mode === 'other' && path.startsWith('/api/account/'))
    throw createError({ statusCode: 404, message: '当前账号无此资源' })
  if (path === '/api/account/usage')
    return {
      day: '2026-10-27',
      resetsAt: '2026-10-28T00:00:00Z',
      items: ['RECOGNITION', 'CHAT', 'EXPORT'].map((kind) => ({
        kind,
        used: state.tasks.size,
        limit: 20,
        remaining: 20 - state.tasks.size,
      })),
    }
  if (path === '/api/account/files') {
    const key = getHeader(event, 'x-upload-key') ?? ''
    await readRawBody(event)
    state.uploads.push(key)
    if (mode === 'upload-slow') await new Promise((r) => setTimeout(r, 1300))
    const id = state.files.get(key) ?? 'r7-image-' + (state.files.size + 1)
    state.files.set(key, id)
    if (mode === 'upload-lost' && !state.lostUpload) {
      state.lostUpload = true
      throw createError({ statusCode: 503, message: '模拟上传已保存但响应丢失' })
    }
    return {
      image: {
        id,
        name: '测试公式.png',
        mimeType: 'image/png',
        sizeBytes: 1024,
        width: 640,
        height: 480,
      },
    }
  }
  if (path === '/api/account/recognitions' && event.method === 'POST') {
    const body = await readBody<{
      fileId: string
      mode: 'handwritten' | 'printed'
      requestKey: string
      requestedTitle?: string
    }>(event)
    state.submissions.push({ key: body.requestKey, mode: body.mode, fileId: body.fileId })
    if (mode === 'quota') throw createError({ statusCode: 429, message: '今日识别次数已用完。' })
    if (mode === 'unavailable')
      throw createError({ statusCode: 503, message: '识别服务暂时不可用' })
    if (mode === 'submit-slow') await new Promise((r) => setTimeout(r, 1300))
    let task = state.tasks.get(body.requestKey)
    if (!task) {
      task = {
        id: 'r7-t' + (state.tasks.size + 1),
        fileId: body.fileId,
        mode: body.mode,
        requestedTitle: body.requestedTitle?.trim() || null,
        status: 'QUEUED',
        attemptCount: 0,
        maxAttempts: 3,
        errorMessage: null,
        formulaId: null,
        isMock: true,
      }
      state.tasks.set(body.requestKey, task)
    }
    if (mode === 'submit-lost' && !state.lostSubmit) {
      state.lostSubmit = true
      throw createError({ statusCode: 503, message: '模拟任务已入队但响应丢失' })
    }
    setResponseStatus(event, 202)
    return task
  }
  if (path.startsWith('/api/account/tasks/')) {
    if (mode === 'network-task') throw createError({ statusCode: 503, message: '任务连接故障' })
    if (mode === 'notfound' || mode === 'forbidden' || !path.match(/\/r7-t\d+$/))
      throw createError({ statusCode: 404, message: '未找到任务或无权访问' })
    state.reads++
    const id = path.split('/').at(-1)!,
      saved = [...state.tasks.values()].find((t) => t.id === id)
    let status: RecognitionTaskState['status'] =
      mode === 'processing' || mode === 'requeue'
        ? 'PROCESSING'
        : mode === 'completed'
          ? 'COMPLETED'
          : mode === 'failed'
            ? 'FAILED'
            : 'QUEUED'
    let attemptCount = status === 'QUEUED' ? 0 : 1
    if (mode === 'requeue' && state.reads > 1) status = 'QUEUED'
    if (mode === 'stale-attempt') {
      status = 'PROCESSING'
      attemptCount = state.reads === 1 ? 2 : 1
    }
    return {
      ...(saved ?? { id, fileId: 'r7-image-1', mode: 'handwritten', maxAttempts: 3, isMock: true }),
      status,
      attemptCount,
      errorMessage:
        status === 'FAILED'
          ? '图片中的公式未能识别，请检查清晰度。'
          : mode === 'requeue' && state.reads > 1
            ? '上次处理已中断，正在等待重试。'
            : null,
      formulaId: status === 'COMPLETED' ? 'r7-formula' : null,
    }
  }
  if (path === '/api/recognitions')
    return {
      requestId: 'r7-demo-result',
      latex: 'x^2-5x+6=0',
      modelVersion: 'preview-mock',
      isMock: true,
    }
  if (path === '/api/account/formulas/r7-formula')
    return {
      id: 'r7-formula',
      title: '识别得到的公式',
      createdAt: '2026-10-27T08:00:00Z',
      updatedAt: '2026-10-27T08:00:00Z',
      image: null,
      category: null,
      favorite: false,
      versions: [
        {
          id: 'r7-v1',
          number: 1,
          latex: 'x^2-5x+6=0',
          origin: 'RECOGNITION',
          isMock: true,
          createdAt: '2026-10-27T08:00:00Z',
        },
      ],
    }
  if (path === '/api/account/library')
    return {
      items:
        mode === 'completed'
          ? [
              {
                id: 'r7-formula',
                title: '识别得到的公式',
                latex: 'x^2-5x+6=0',
                createdAt: '2026-10-27T08:00:00Z',
                versionNumber: 1,
                isMock: true,
                category: null,
                favorite: false,
                imageId: null,
              },
            ]
          : [],
      nextCursor: null,
    }
  if (path === '/api/account/recognitions')
    return {
      items: [
        {
          id: 'r7-t1',
          status: mode === 'completed' ? 'COMPLETED' : mode === 'failed' ? 'FAILED' : 'QUEUED',
          title: '测试公式.png',
          formulaId: mode === 'completed' ? 'r7-formula' : null,
          latex: mode === 'completed' ? 'x^2-5x+6=0' : null,
          createdAt: '2026-10-27T08:00:00Z',
          errorMessage: null,
        },
      ],
      nextCursor: null,
    }
  if (path === '/api/account/categories')
    return {
      items: [],
      totalCount: mode === 'completed' ? 1 : 0,
      uncategorizedCount: mode === 'completed' ? 1 : 0,
    }
  if (path === '/api/account/conversations') return { items: [], nextCursor: null }
  throw createError({ statusCode: 503, message: 'R7 替身拒绝未声明接口：' + path })
}
