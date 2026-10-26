import type { H3Event } from 'h3'
import { createAuthentication } from '../auth/config'
import { getDatabase } from './database'

const processState = globalThis as typeof globalThis & {
  formulaAuthentication?: ReturnType<typeof createAuthentication>
}

export function getAuthentication() {
  const config = useRuntimeConfig()
  if (config.authSecret.length < 32 || !config.authBaseUrl) {
    throw createError({ statusCode: 503, message: '账号服务尚未配置，请运行 npm run auth:env。' })
  }
  processState.formulaAuthentication ??= createAuthentication(getDatabase(), {
    secret: config.authSecret,
    baseURL: config.authBaseUrl,
    isDevelopment: import.meta.dev,
  })
  return processState.formulaAuthentication
}

/** 每次检查数据库会话；身份只来自签名 Cookie，不使用请求中的 ownerId。 */
export async function getAccountSession(event: H3Event) {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const result = await getAuthentication().api.getSession({
    headers: event.headers,
    returnHeaders: true,
  })
  for (const cookie of result.headers.getSetCookie())
    appendResponseHeader(event, 'Set-Cookie', cookie)
  return result.response
}

export async function requireAccountUser(event: H3Event) {
  const session = await getAccountSession(event)
  if (!session?.user) {
    throw createError({ statusCode: 401, message: '请先登录后再访问你的账号空间。' })
  }
  return session.user
}

/** 业务写接口独立校验来源，Cookie 身份验证不能替代 CSRF 检查。 */
export async function requireAccountWriter(event: H3Event) {
  const user = await requireAccountUser(event)
  const { authBaseUrl } = useRuntimeConfig()
  const origins = new Set([new URL(authBaseUrl).origin])
  if (import.meta.dev) {
    origins.add('http://127.0.0.1:3000')
    origins.add('http://localhost:3000')
  }
  if (!origins.has(getHeader(event, 'origin') ?? ''))
    throw createError({ statusCode: 403, message: '请求来源无效，请从本站页面重试。' })
  return user
}
