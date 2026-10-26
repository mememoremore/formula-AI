import { legacyDestination } from '#shared/navigation'
export default defineNuxtRouteMiddleware((to) => {
  const target = legacyDestination(to.path)
  if (target)
    return navigateTo(
      { path: target.path, query: { ...to.query, ...target.query }, hash: to.hash },
      { replace: true },
    )
})
