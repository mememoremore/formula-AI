import { recordPageOrigin } from '#shared/navigation'
export default defineNuxtRouteMiddleware((to, from) => {
  if (import.meta.server || !from.name || from.fullPath === to.fullPath) return
  const origins = useState<Record<string, string>>('page-origins', () => ({}))
  recordPageOrigin(origins.value, to, from)
})
