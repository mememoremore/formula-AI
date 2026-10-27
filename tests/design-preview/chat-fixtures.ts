import {
  createError,
  createEventStream,
  getCookie,
  getRequestURL,
  readBody,
  setResponseStatus,
  type H3Event,
} from 'h3'
import type { SavedConversation } from '../../shared/types/tasks'
export const chatId = '88888888-8888-4888-8888-888888888888'
const answer =
  '## 先看公式的结构\n**配方法**可以把二次式整理为平方的形式。对于 $x^2-5x+6=0$，先找乘积为 6、和为 5 的两个数。\n\n$$x^2-5x+6=(x-2)(x-3)=0$$\n\n因此，两个根分别是 **2 和 3**。\n\n```typescript\nconst roots = [2, 3]\nconsole.log(roots.map(x => x * x - 5 * x + 6))\n```\n代回原式，可以验证每个根。<script>alert("不会执行")</script>'
interface State {
  value: SavedConversation
  creates: string[]
  sends: { key: string; question: string }[]
  stops: number
  streams: number
  reads: number
  lost: boolean
}
const states = new Map<string, State>()
export function hasChatFixture(event: H3Event) {
  return !!getCookie(event, 'r8-chat')
}
export async function chatFixture(event: H3Event) {
  const mode = getCookie(event, 'r8-chat')!,
    run = getCookie(event, 'r8-run')
  if (!run || !/^r8-[a-z0-9-]{1,80}$/.test(run))
    throw createError({ statusCode: 400, message: '无效 R8 运行编号' })
  if (!states.has(run)) {
    if (states.size >= 32) states.delete(states.keys().next().value!)
    states.set(run, {
      value: {
        id: chatId,
        title: '读懂一元二次方程',
        context: {
          id: 'v1',
          formulaId: 'f1',
          title: '一元二次方程',
          number: 1,
          latex: 'x^2-5x+6=0',
        },
        messages:
          mode === 'empty'
            ? []
            : [
                {
                  id: 'm1',
                  role: 'USER',
                  content: '请解释这个公式，并给我一个例子。',
                  status: 'COMPLETED',
                  isMock: true,
                  modelVersion: null,
                  position: 1,
                },
                {
                  id: 'm2',
                  role: 'ASSISTANT',
                  content: answer,
                  status: 'COMPLETED',
                  isMock: true,
                  modelVersion: 'preview',
                  position: 2,
                },
              ],
        currentTurn: null,
        hasEarlierMessages: mode === 'long',
      },
      creates: [],
      sends: [],
      stops: 0,
      streams: 0,
      reads: 0,
      lost: false,
    })
  }
  const state = states.get(run)!,
    path = getRequestURL(event).pathname,
    params = getRequestURL(event).searchParams
  if (path === '/api/account/session') {
    if (mode === 'session-error') throw createError({ statusCode: 503, message: '受控身份故障' })
    return {
      user:
        mode === 'guest' || mode === 'logout'
          ? null
          : {
              id: mode === 'other' ? 'other-owner' : 'r8-owner',
              name: '公式探索者',
              email: 'preview@example.test',
              emailVerified: true,
              image: null,
            },
    }
  }
  if (path === '/api/__r8debug') {
    if (event.method === 'POST') {
      const body = await readBody<{ action: string }>(event)
      if (body.action === 'next-turn') {
        state.value.messages.push({
          id: 'next-question',
          position: (state.value.messages.at(-1)?.position ?? 0) + 1,
          role: 'USER',
          content: '其他窗口的新问题',
          status: 'COMPLETED',
          isMock: true,
          modelVersion: null,
        })
        state.value.currentTurn = {
          id: 'next-turn',
          status: 'QUEUED',
          partialContent: '',
          attemptCount: 0,
          maxAttempts: 3,
          errorMessage: null,
          isMock: true,
          modelVersion: null,
        }
      }
      if (body.action === 'advanced' && state.value.currentTurn)
        state.value.currentTurn.partialContent += '，这是后续保存的解释内容。'
      if (body.action === 'queued' || body.action === 'partial')
        state.value.currentTurn = {
          id: 'turn-preview',
          status: body.action === 'queued' ? 'QUEUED' : 'PROCESSING',
          partialContent: body.action === 'partial' ? '开始推导：$x^2-5x+6=0$' : '',
          attemptCount: 1,
          maxAttempts: 3,
          errorMessage: null,
          isMock: true,
          modelVersion: 'preview',
        }
      if (body.action === 'complete' || body.action === 'failed') {
        const turn = state.value.currentTurn
        if (turn) {
          turn.status = body.action === 'complete' ? 'COMPLETED' : 'FAILED'
          turn.errorMessage = body.action === 'failed' ? '受控模型失败' : null
          state.value.messages.push({
            id: 'a-' + state.value.messages.length,
            role: 'ASSISTANT',
            position: (state.value.messages.at(-1)?.position ?? 0) + 1,
            content: body.action === 'complete' ? answer : '部分内容保留；回答未完成。',
            status: body.action === 'complete' ? 'COMPLETED' : 'FAILED',
            isMock: true,
            modelVersion: 'preview',
          })
        }
      }
      if (body.action === 'long')
        state.value.messages = Array.from({ length: 30 }, (_, i) => ({
          id: 'long-' + i,
          position: i + 1,
          role: i % 2 ? 'ASSISTANT' : 'USER',
          content:
            i % 2
              ? answer +
                (i === 29
                  ? '\n\n$$' +
                    Array.from({ length: 12 }, () => '\\frac{n(n+1)(2n+1)}{6}').join('+') +
                    '$$\n$$\\begin{pmatrix}1&2\\\\3&4\\end{pmatrix}$$'
                  : '')
              : '第 ' + (i + 1) + ' 个问题',
          status: 'COMPLETED',
          isMock: true,
          modelVersion: null,
        }))
    }
    return state
  }
  if (mode === 'logout') throw createError({ statusCode: 401, message: '请重新登录' })
  if (mode === 'other' || mode === 'notfound')
    throw createError({ statusCode: 404, message: '未找到这段对话' })
  if (path === '/api/account/chat-settings')
    return { ready: mode !== 'unavailable', provider: 'mock' }
  if (path === '/api/account/conversations' && event.method === 'GET') {
    if (mode === 'list-error') throw createError({ statusCode: 503, message: '受控列表故障' })
    if (params.get('q') === '慢') await new Promise((r) => setTimeout(r, 700))
    return {
      items:
        mode === 'empty' || params.get('q') === '不存在'
          ? []
          : [
              {
                id: params.has('cursor') ? 'second-chat' : chatId,
                title: params.has('cursor') ? '另一段公式思考' : state.value.title,
                createdAt: '2026-10-27T08:00:00Z',
                preview: '配方法与因式分解',
                latex: null,
              },
            ],
      nextCursor: params.has('cursor') ? null : 'second',
    }
  }
  if (path === '/api/account/conversations' && event.method === 'POST') {
    const body = await readBody<{ requestKey: string }>(event)
    state.creates.push(body.requestKey)
    if (mode === 'create-lost' && !state.lost) {
      state.lost = true
      throw createError({ statusCode: 503, message: '创建响应未确认' })
    }
    return { ...state.value, messages: [], currentTurn: null }
  }
  if (path.endsWith('/messages') && event.method === 'POST') {
    const body = await readBody<{ question: string; requestKey: string }>(event)
    state.sends.push({ key: body.requestKey, question: body.question })
    if (!state.value.messages.some((m) => m.id === body.requestKey)) {
      state.value.messages.push({
        id: body.requestKey,
        role: 'USER',
        content: body.question,
        position: (state.value.messages.at(-1)?.position ?? 0) + 1,
        status: 'COMPLETED',
        isMock: true,
        modelVersion: null,
      })
      state.value.currentTurn = {
        id: body.requestKey,
        status: 'QUEUED',
        partialContent: '',
        attemptCount: 0,
        maxAttempts: 3,
        errorMessage: null,
        isMock: true,
        modelVersion: null,
      }
    }
    if (mode === 'send-lost' && !state.lost) {
      state.lost = true
      throw createError({ statusCode: 503, message: '发送响应未确认' })
    }
    setResponseStatus(event, 202)
    return state.value.currentTurn
  }
  if (path.endsWith('/cancel')) {
    state.stops++
    if (mode === 'stop-error') throw createError({ statusCode: 503, message: '停止尚未确认' })
    if (
      state.value.currentTurn &&
      !['COMPLETED', 'FAILED'].includes(state.value.currentTurn.status)
    ) {
      state.value.currentTurn.status = 'FAILED'
      state.value.currentTurn.errorMessage = '已停止生成。'
      state.value.messages.push({
        id: 'stopped',
        position: (state.value.messages.at(-1)?.position ?? 0) + 1,
        role: 'ASSISTANT',
        content: '部分内容。已停止生成。',
        status: 'FAILED',
        isMock: true,
        modelVersion: null,
      })
    }
    return state.value
  }
  if (path.endsWith('/events')) {
    state.streams++
    if (mode === 'offline') throw createError({ statusCode: 503, message: '受控 SSE 断线' })
    const stream = createEventStream(event)
    const timer = setInterval(() => {
      void stream
        .push({ event: 'snapshot', data: JSON.stringify(state.value) })
        .catch(() => clearInterval(timer))
    }, 250)
    stream.onClosed(() => clearInterval(timer))
    return stream.send()
  }
  if (/^\/api\/account\/conversations\/[^/]+$/.test(path)) {
    state.reads++
    if (mode === 'network') throw createError({ statusCode: 503, message: '受控读取失败' })
    return state.value
  }
  if (path === '/api/account/library')
    return {
      items:
        params.get('q') === '不存在'
          ? []
          : [
              {
                id: params.has('cursor') ? 'f2' : 'f1',
                title: params.has('cursor') ? '积分公式' : '一元二次方程',
                latex: params.has('cursor') ? '\\int_0^1 x^2 dx' : 'x^2-5x+6=0',
                versionId: 'v1',
                createdAt: '2026-10-27T08:00:00Z',
                favorite: false,
                category: null,
              },
            ],
      nextCursor: params.has('cursor') ? null : 'next',
    }
  if (path.startsWith('/api/account/formulas/'))
    return {
      id: 'f1',
      title: '一元二次方程',
      versions: [{ id: 'v1', number: 1, latex: 'x^2-5x+6=0' }],
    }
  if (path.startsWith('/api/account/versions/')) return state.value.context
  if (path === '/api/chat') return { message: { role: 'assistant', content: answer }, isMock: true }
  throw createError({ statusCode: 501, message: 'R8 替身拒绝未声明请求：' + path })
}
