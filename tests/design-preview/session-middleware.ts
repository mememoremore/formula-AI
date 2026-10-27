import { defineEventHandler, getRequestURL, getCookie, setResponseHeader } from 'h3'
import { homeFixtureResponse, isHomeScenario } from './home-fixtures'
import { libraryFixture, hasLibraryFixture } from './library-fixtures'
import { detailFixture, hasDetailFixture } from './detail-fixtures'
import { recognitionFixture, hasRecognitionFixture } from './recognition-fixtures'

/** 仅隔离预览层：避免真实页面的 SSR 会话读取触及认证和数据库。 */
export default defineEventHandler((event) => {
  if (hasRecognitionFixture(event) && getRequestURL(event).pathname.startsWith('/api/'))
    return recognitionFixture(event)
  if (hasDetailFixture(event) && getRequestURL(event).pathname.startsWith('/api/'))
    return detailFixture(event)
  if (hasLibraryFixture(event) && getRequestURL(event).pathname.startsWith('/api/'))
    return libraryFixture(event)
  const scenario = getCookie(event, 'r4-home')
  if (isHomeScenario(scenario) && getRequestURL(event).pathname.startsWith('/api/')) {
    setResponseHeader(event, 'Cache-Control', 'no-store')
    return homeFixtureResponse(getRequestURL(event).pathname, scenario)
  }
  if (getRequestURL(event).pathname === '/api/account/session') return { user: null }
})
