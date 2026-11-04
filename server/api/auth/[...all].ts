import { authenticationClientIP } from '../../auth/client-ip'
import { getAuthentication } from '../../utils/auth'

export default defineEventHandler((event) => {
  setResponseHeader(event, 'Cache-Control', 'private, no-store')
  const request = toWebRequest(event)
  const headers = new Headers(request.headers)
  headers.set(
    'x-formula-client-ip',
    authenticationClientIP(
      getRequestIP(event, { xForwardedFor: false }),
      getHeader(event, 'x-forwarded-for'),
      process.env.FORMULA_TRUST_PROXY === 'true',
    ),
  )
  return getAuthentication().handler(new Request(request, { headers }))
})
