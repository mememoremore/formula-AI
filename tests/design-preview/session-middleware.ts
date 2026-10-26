import { defineEventHandler, getRequestURL } from 'h3'

/** 仅隔离预览层：避免真实页面的 SSR 会话读取触及认证和数据库。 */
export default defineEventHandler((event) => {
  if (getRequestURL(event).pathname === '/api/account/session') return { user: null }
})
