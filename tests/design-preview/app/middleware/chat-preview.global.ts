import { defineNuxtRouteMiddleware } from 'nuxt/app'
export default defineNuxtRouteMiddleware((to) => {
  if (to.path === '/ai' || to.path.startsWith('/ai/')) {
    if (to.query.preview === 'tools') to.meta.layout = 'library-tools'
  }
})
