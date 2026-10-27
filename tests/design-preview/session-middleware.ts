import { defineEventHandler, getRequestURL, getCookie, setResponseHeader } from 'h3'
import { homeFixtureResponse, isHomeScenario } from './home-fixtures'

/** 仅隔离预览层：避免真实页面的 SSR 会话读取触及认证和数据库。 */
export default defineEventHandler((event) => {
  const scenario = getCookie(event, 'r4-home')
  if (isHomeScenario(scenario) && getRequestURL(event).pathname.startsWith('/api/')) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return homeFixtureResponse(getRequestURL(event).pathname, scenario)
  }
  if (getRequestURL(event).pathname === '/api/account/session') return { user: null }
})
