import type { RouteLocationNormalized } from 'vue-router'
import auth from './auth'

export default defineNuxtRouteMiddleware(async (to, from) => {
  if (to.path === '/login') return
  if (to.path.startsWith('/result/')) return navigateTo('/library', { replace: true })
  if (to.query.space === 'demo') {
    const query = { ...to.query }
    delete query.space
    delete query.demoVersionId
    if (to.path.startsWith('/ai')) delete query.formulaId
    return navigateTo({ path: to.path, query, hash: to.hash }, { replace: true })
  }
  return auth(to as RouteLocationNormalized, from as RouteLocationNormalized)
})
