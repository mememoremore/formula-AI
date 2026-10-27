/** 宽度和身份按钮只在显式预览层使用，不建立正式产品路由。 */
import { defineNuxtRouteMiddleware } from 'nuxt/app'
export default defineNuxtRouteMiddleware((to) => {
  if (!/^\/(formulas|result)\//.test(to.path)) return
  if (['compact', 'reading', 'workspace'].includes(String(to.query.width)))
    to.meta.contentWidth = to.query.width as 'compact' | 'reading' | 'workspace'
  if (to.query.preview === 'tools') to.meta.layout = 'library-tools'
})
