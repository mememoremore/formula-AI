import { safeRoute } from '#shared/trace-context'
export type BrowserErrorKind = 'vue' | 'window' | 'promise'
const names = new Set([
  'Error',
  'TypeError',
  'ReferenceError',
  'SyntaxError',
  'RangeError',
  'URIError',
  'EvalError',
  'AggregateError',
])
export function browserErrorSummary(
  kind: BrowserErrorKind,
  error: unknown,
  page: string,
  frame?: { filename?: string; line?: number; column?: number },
) {
  const name = error instanceof Error && names.has(error.name) ? error.name : 'Error'
  const location = new URL(page)
  let filename = frame?.filename,
    line = frame?.line,
    column = frame?.column
  if (!filename && error instanceof Error) {
    const match = error.stack?.match(/(https?:\/\/[^\s)]+):(\d+):(\d+)/)
    if (match) {
      filename = match[1]
      line = Number(match[2])
      column = Number(match[3])
    }
  }
  let asset: string | undefined
  try {
    const source = new URL(filename ?? '', page)
    const base = source.pathname.split('/').at(-1) ?? ''
    if (source.origin === location.origin && /^[A-Za-z0-9_-]{1,120}\.(?:m?js|vue)$/.test(base))
      asset = base
  } catch {}
  const bounded = (n: unknown) =>
    Number.isSafeInteger(n) && Number(n) >= 0 && Number(n) <= 1_000_000 ? Number(n) : undefined
  return {
    kind,
    errorName: name,
    route: safeRoute(location.pathname),
    asset,
    line: asset ? bounded(line) : undefined,
    column: asset ? bounded(column) : undefined,
    time: new Date().toISOString(),
  }
}
export function browserErrorGate() {
  const recent = new Map<string, number>()
  let count = 0,
    windowStart = 0
  return (key: string, now = Date.now()) => {
    if (now - windowStart >= 60000) {
      count = 0
      windowStart = now
    }
    for (const [k, t] of recent) if (now - t >= 60000) recent.delete(k)
    if (count >= 20 || recent.has(key) || recent.size >= 100) return false
    recent.set(key, now)
    count++
    return true
  }
}
