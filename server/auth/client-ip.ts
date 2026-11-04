import { isIP } from 'node:net'

/** Only enable behind a proxy that overwrites X-Forwarded-For and hides the app port. */
export function authenticationClientIP(
  socketIP: string | undefined,
  forwarded: string | undefined,
  trusted: boolean,
) {
  const candidate = forwarded?.trim()
  return trusted && candidate && isIP(candidate) ? candidate : socketIP || '127.0.0.1'
}
