/** 仅显式测试层生效；正式页面及全局默认宽度不增加调试分支。 */
import { defineNuxtRouteMiddleware } from 'nuxt/app'
export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== '/library') return
  if (to.query.width === 'compact') to.meta.contentWidth = 'compact'
  if (to.query.preview === 'tools') to.meta.layout = 'library-tools'
})
