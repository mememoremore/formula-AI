import { createHash } from 'node:crypto'
import { safeRoute, parseTraceparent } from '../../shared/trace-context'
export function parseBrowserErrors(input: unknown) {
  if (
    !input ||
    typeof input !== 'object' ||
    !('events' in input) ||
    !Array.isArray(input.events) ||
    input.events.length < 1 ||
    input.events.length > 10
  )
    throw new Error('Invalid events')
  return input.events.map((value: unknown) => {
    if (!value || typeof value !== 'object') throw new Error('Invalid event')
    const row = value as Record<string, unknown>
    if (
      !['vue', 'window', 'promise'].includes(String(row.kind)) ||
      ![
        'Error',
        'TypeError',
        'ReferenceError',
        'SyntaxError',
        'RangeError',
        'URIError',
        'EvalError',
        'AggregateError',
      ].includes(String(row.errorName))
    )
      throw new Error('Invalid category')
    if (typeof row.route !== 'string' || row.route.length > 200 || !row.route.startsWith('/'))
      throw new Error('Invalid route')
    const time = typeof row.time === 'string' ? Date.parse(row.time) : NaN
    if (!Number.isFinite(time) || Math.abs(Date.now() - time) > 300000)
      throw new Error('Invalid time')
    const parent = parseTraceparent(row.traceparent)
    if (!parent) throw new Error('Invalid context')
    const asset =
      typeof row.asset === 'string' && /^[A-Za-z0-9_-]{1,120}\.(?:m?js|vue)$/.test(row.asset)
        ? row.asset
        : undefined
    const bounded = (v: unknown) =>
      Number.isSafeInteger(v) && Number(v) >= 0 && Number(v) <= 1000000 ? Number(v) : undefined
    const safe = {
      errorKind: String(row.kind),
      errorName: String(row.errorName),
      route: safeRoute(row.route),
      asset,
      line: asset ? bounded(row.line) : undefined,
      column: asset ? bounded(row.column) : undefined,
    }
    return {
      ...safe,
      traceparent: row.traceparent as string,
      fingerprint: createHash('sha256').update(JSON.stringify(safe)).digest('hex'),
    }
  })
}
