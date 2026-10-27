import { defineNuxtRouteMiddleware } from 'nuxt/app'
/** 仅显式测试层提供身份刷新按钮，生产不增加调试路由。 */
export default defineNuxtRouteMiddleware((to) => {
  if (
    (to.path === '/upload' || to.path.startsWith('/recognitions/')) &&
    to.query.preview === 'tools'
  )
    to.meta.layout = 'library-tools'
})
