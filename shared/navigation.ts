/** 页面地址集中管理；与 /api/account 业务接口完全独立。 */
export type LibraryView = 'all' | 'favorites' | 'recent'
export const mainTabs = [
  { to: '/', label: '首页', icon: 'home' },
  { to: '/library', label: '公式库', icon: 'book' },
  { to: '/ai', label: 'AI', icon: 'sparkles' },
  { to: '/profile', label: '我的', icon: 'user' },
] as const
const knownPath =
  /^(?:\/|\/library|\/ai(?:\/new|\/[a-zA-Z0-9-]+)?|\/profile(?:\/edit)?|\/upload|\/settings|\/help|\/feedback|\/about|\/(?:formulas|recognitions|exports|result)\/[a-zA-Z0-9-]+)$/
export function safeReturnPath(value: unknown, fallback = '/profile'): string {
  if (typeof value !== 'string' || value.length > 2048 || /[\\\x00-\x20]/.test(value))
    return fallback
  try {
    const url = new URL(value, 'https://formula.invalid')
    if (
      url.origin !== 'https://formula.invalid' ||
      !value.startsWith('/') ||
      !knownPath.test(url.pathname)
    )
      return fallback
    return url.pathname + url.search + url.hash
  } catch {
    return fallback
  }
}
export function libraryView(value: unknown): LibraryView {
  return value === 'favorites' || value === 'recent' ? value : 'all'
}
export function navigationSection(path: string) {
  if (path === '/library' || /^\/(formulas|recognitions|exports|result)\//.test(path))
    return '/library'
  if (path === '/ai' || path.startsWith('/ai/')) return '/ai'
  if (
    ['/profile', '/profile/edit', '/settings', '/help', '/feedback', '/about', '/login'].includes(
      path,
    )
  )
    return '/profile'
  return '/'
}
export function legacyDestination(
  path: string,
): { path: string; query?: Record<string, string> } | undefined {
  const fixed: Record<string, { path: string; query?: Record<string, string> }> = {
    '/account': { path: '/profile', query: { space: 'account' } },
    '/account/library': { path: '/library', query: { space: 'account' } },
    '/account/favorites': { path: '/library', query: { view: 'favorites', space: 'account' } },
    '/account/history': { path: '/library', query: { view: 'recent', space: 'account' } },
    '/account/conversations': { path: '/ai', query: { space: 'account' } },
    '/account/chat': { path: '/ai/new', query: { space: 'account' } },
    '/favorites': { path: '/library', query: { view: 'favorites' } },
    '/history': { path: '/library', query: { view: 'recent' } },
  }
  if (fixed[path]) return fixed[path]
  const match = path.match(/^\/account\/(formulas|tasks|exports|conversations)\/([a-zA-Z0-9-]+)$/)
  if (match) {
    const sections: Record<string, string> = { tasks: 'recognitions', conversations: 'ai' }
    return { path: '/' + (sections[match[1]!] ?? match[1]) + '/' + match[2] }
  }
}
export function isTransientPage(path: string) {
  return path === '/login' || path === '/ai/new' || /^\/recognitions\//.test(path)
}
