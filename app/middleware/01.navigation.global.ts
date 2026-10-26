import { isTransientPage, safeReturnPath } from '#shared/navigation'
export default defineNuxtRouteMiddleware((to, from) => {
  if (import.meta.server || !from.name || from.fullPath === to.fullPath) return
  const origins = useState<Record<string, string>>('page-origins', () => ({}))
  if (origins.value[from.fullPath] === to.fullPath) return
  const origin = isTransientPage(from.path) ? origins.value[from.fullPath] : from.fullPath
  if (origin && safeReturnPath(origin, '') && origin !== to.fullPath) {
    origins.value[to.fullPath] = origin
    const keys = Object.keys(origins.value)
    if (keys.length > 100) delete origins.value[keys[0]!]
  }
})
