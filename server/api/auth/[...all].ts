import { getAuthentication } from '../../utils/auth'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const request = toWebRequest(event)
  const headers = new Headers(request.headers)
  headers.set('x-formula-client-ip', getRequestIP(event, { xForwardedFor: false }) ?? '127.0.0.1')
  return getAuthentication().handler(new Request(request, { headers }))
})
