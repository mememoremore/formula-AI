import { defineNuxtRouteMiddleware } from 'nuxt/app'
export default defineNuxtRouteMiddleware((to) => {
  if (to.query.preview === 'account-tools') to.meta.layout = 'account-tools'
})
