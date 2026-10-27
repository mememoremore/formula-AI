import {
  createError,
  createEventStream,
  getCookie,
  getRequestURL,
  readBody,
  setResponseHeader,
  setResponseStatus,
  type H3Event,
} from 'h3'
interface State {
  owner: 'a' | 'b' | null
  names: { a: string; b: string }
  avatars: { a: string | null; b: string | null }
  revision: number
  auth: string[]
  saves: number
  sessions: number
  streams: number
  closed: number
}
const states = new Map<string, State>()
export function hasAccountFixture(event: H3Event) {
  return !!getCookie(event, 'r9-account')
}
export async function accountFixture(event: H3Event) {
  const mode = getCookie(event, 'r9-account')!,
    run = getCookie(event, 'r9-run')
  if (!run || !/^r9-[a-z0-9-]{1,80}$/.test(run))
    throw createError({ statusCode: 400, message: '无效 R9 运行编号' })
  if (!states.has(run)) {
    if (states.size >= 40) states.delete(states.keys().next().value!)
    states.set(run, {
      owner: ['guest', 'login-error', 'register-error', 'postauth-error', 'auth-lost'].includes(
        mode,
      )
        ? null
        : 'a',
      names: { a: '公式探索者甲', b: '公式探索者乙' },
      avatars: { a: null, b: null },
      revision: 0,
      auth: [],
      saves: 0,
      sessions: 0,
      streams: 0,
      closed: 0,
    })
  }
  const state = states.get(run)!,
    path = getRequestURL(event).pathname
  const user = () =>
    state.owner
      ? {
          id: 'r9-owner-' + state.owner,
          name: state.names[state.owner],
          email: state.owner + '@example.test',
          emailVerified: true,
          image: state.avatars[state.owner] ? '/api/account/avatar?v=' + state.revision : null,
        }
      : null
  if (path === '/api/__r9debug') {
    if (event.method === 'POST') {
      const body = await readBody<{ action: string }>(event)
      if (body.action === 'a' || body.action === 'b') state.owner = body.action
      if (body.action === 'logout') state.owner = null
    }
    return {
      ...state,
      avatars: undefined,
      avatar: state.owner ? !!state.avatars[state.owner] : false,
    }
  }
  if (path === '/api/account/session' || path === '/api/auth/get-session') {
    state.sessions++
    if (mode === 'session-error' || (mode === 'postauth-error' && state.auth.length))
      throw createError({ statusCode: 503, message: '受控会话读取失败' })
    return path.includes('/auth/')
      ? { user: user(), session: state.owner ? { id: 'preview-session' } : null }
      : { user: user() }
  }
  if (path === '/api/auth/sign-in/email' || path === '/api/auth/sign-up/email') {
    const body = await readBody<{ email: string; name?: string }>(event)
    state.auth.push(path)
    if (mode === 'login-error') {
      setResponseStatus(event, 401)
      return { code: 'INVALID_EMAIL_OR_PASSWORD', message: '邮箱或密码错误' }
    }
    if (mode === 'register-error') {
      setResponseStatus(event, 422)
      return { code: 'USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL', message: '邮箱已注册' }
    }
    state.owner = body.email.startsWith('b') ? 'b' : 'a'
    if (body.name) state.names[state.owner] = body.name
    if (mode === 'auth-lost') throw createError({ statusCode: 503, message: '认证响应未确认' })
    return { user: user(), token: 'preview-only-not-a-real-token', redirect: false }
  }
  if (path === '/api/auth/sign-out') {
    state.auth.push(path)
    if (mode === 'logout-error') throw createError({ statusCode: 503, message: '受控退出失败' })
    state.owner = null
    if (mode === 'logout-lost') throw createError({ statusCode: 503, message: '退出响应未确认' })
    return { success: true }
  }
  if (!state.owner) throw createError({ statusCode: 401, message: '请登录' })
  if (path === '/api/account/profile') {
    state.saves++
    const body = await readBody<{ name: string; avatar?: string | null }>(event)
    if (mode === 'save-error') throw createError({ statusCode: 503, message: '受控资料保存失败' })
    state.names[state.owner] = body.name
    if (body.avatar !== undefined) {
      state.avatars[state.owner] = body.avatar
      state.revision++
    }
    return { saved: true }
  }
  if (path === '/api/account/avatar') {
    const avatar = state.avatars[state.owner]
    if (!avatar) throw createError({ statusCode: 404, message: '无自定义头像' })
    setResponseHeader(event, 'content-type', 'image/jpeg')
    return Buffer.from(avatar.split(',')[1]!, 'base64')
  }
  if (path === '/api/account/usage') {
    if (mode === 'usage-error') throw createError({ statusCode: 503, message: '受控额度故障' })
    return {
      day: '2026-10-27',
      resetsAt: '2026-10-28T00:00:00Z',
      items: ['RECOGNITION', 'CHAT', 'EXPORT'].map((kind) => ({
        kind,
        limit: 20,
        used: state.owner === 'a' ? 3 : 1,
        remaining: state.owner === 'a' ? 17 : 19,
      })),
    }
  }
  if (path === '/api/account/service-status') {
    if (mode === 'service-error')
      throw createError({ statusCode: 503, message: '受控服务检查故障' })
    return {
      checkedAt: '2026-10-27T08:00:00Z',
      items: [
        { id: 'database', name: '账号数据', state: 'ready', detail: '已连接' },
        { id: 'ai', name: 'AI 助手', state: 'configured', detail: '已配置，不代表实时请求可用' },
      ],
    }
  }
  const formula = {
    id: 'r9-formula',
    title: state.names[state.owner] + '的公式',
    latex: 'x^2-5x+6=0',
    versionId: 'r9-version',
    createdAt: '2026-10-27T08:00:00Z',
    updatedAt: '2026-10-27T08:00:00Z',
    category: null,
    favorite: false,
  }
  if (path === '/api/account/library') return { items: [formula], nextCursor: null }
  if (path === '/api/account/categories') return { items: [], totalCount: 1, uncategorizedCount: 1 }
  if (path === '/api/account/recognitions') return { items: [], nextCursor: null }
  if (path === '/api/account/overview')
    return { counts: { formulas: 1, files: 1, tasks: 0, conversations: 1 }, formulas: [formula] }
  if (path.startsWith('/api/account/formulas/'))
    return {
      ...formula,
      image: null,
      versions: [
        {
          id: 'r9-version',
          number: 1,
          latex: formula.latex,
          origin: 'MANUAL',
          isMock: true,
          createdAt: formula.createdAt,
        },
      ],
    }
  if (path === '/api/account/conversations')
    return {
      items: [
        {
          id: 'r9-chat',
          title: state.names[state.owner] + '的对话',
          createdAt: formula.createdAt,
          preview: '私有回答',
        },
      ],
      nextCursor: null,
    }
  const conversation = () => ({
    id: 'r9-chat',
    title: '学习对话',
    context: null,
    messages: [
      {
        id: 'question',
        role: 'USER',
        content: state.owner + '的私有问题',
        status: 'COMPLETED',
        isMock: true,
        modelVersion: null,
        position: 1,
      },
    ],
    currentTurn: {
      id: 'r9-turn',
      status: 'PROCESSING',
      partialContent: '只有' + state.names[state.owner!] + '可见的片段',
      attemptCount: 1,
      maxAttempts: 3,
      errorMessage: null,
      isMock: true,
      modelVersion: null,
    },
    hasEarlierMessages: false,
  })
  if (path === '/api/account/conversations/r9-chat') return conversation()
  if (path === '/api/account/conversations/r9-chat/events') {
    state.streams++
    const owner = state.owner,
      stream = createEventStream(event)
    const timer = setInterval(() => {
      if (state.owner !== owner) {
        void stream
          .push({ event: 'stream-error', data: JSON.stringify({ code: 401 }) })
          .finally(() => stream.close())
        return
      }
      void stream
        .push({ event: 'snapshot', data: JSON.stringify(conversation()) })
        .catch(() => clearInterval(timer))
    }, 200)
    stream.onClosed(() => {
      state.closed++
      clearInterval(timer)
    })
    return stream.send()
  }
  throw createError({ statusCode: 501, message: 'R9 替身拒绝未声明请求：' + path })
}
