import type { AccountUser } from '#shared/types/account'
import { safeReturnPath } from '#shared/navigation'
export default defineNuxtRouteMiddleware(async (to) => {
  try {
    const { user } = await useRequestFetch()<{ user: AccountUser | null }>('/api/account/session', {
      timeout: 10_000,
      retry: 0,
    })
    if (user) return
  } catch {
    throw createError({
      statusCode: 503,
      message: '账号服务暂时无法连接，请稍后重试。',
      fatal: true,
    })
  }
  return navigateTo(
    { path: '/login', query: { redirect: safeReturnPath(to.fullPath) } },
    { replace: true },
  )
})
