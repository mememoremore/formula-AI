import { safeRoute } from '../../shared/trace-context'
/** Accept only bounded browser spans; never forward arbitrary attributes or resource identities. */
export function browserTelemetry(value: unknown) {
  const object = (v: unknown): Record<string, unknown> =>
    v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {}
  const list = (v: unknown) => (Array.isArray(v) ? v : [])
  const resources = list(object(value).resourceSpans)
  const spans = resources.flatMap((r) =>
    list(object(r).scopeSpans).flatMap((s) => list(object(s).spans)),
  )
  if (!spans.length || spans.length > 32) throw new Error('invalid telemetry')
  const sanitized = spans.map((raw) => {
    const s = object(raw)
    if (
      typeof s.traceId !== 'string' ||
      !/^(?!0{32}$)[a-f0-9]{32}$/.test(s.traceId) ||
      typeof s.spanId !== 'string' ||
      !/^(?!0{16}$)[a-f0-9]{16}$/.test(s.spanId)
    )
      throw new Error('invalid trace')
    if (
      typeof s.name !== 'string' ||
      !/^(browser\.error|recognition\.(submit|retry)|(GET|POST|PATCH|DELETE|PUT) \/api\/account\/[A-Za-z0-9/:._-]{1,140})$/.test(
        s.name,
      )
    )
      throw new Error('invalid span')
    if (
      ![s.startTimeUnixNano, s.endTimeUnixNano].every(
        (v) => typeof v === 'string' && /^[0-9]{16,20}$/.test(v),
      )
    )
      throw new Error('invalid timestamp')
    const start = BigInt(s.startTimeUnixNano as string),
      end = BigInt(s.endTimeUnixNano as string)
    const now = BigInt(Date.now()) * BigInt('1000000')
    if (
      end < start ||
      end - start > BigInt('3600000000000') ||
      end > now + BigInt('300000000000') ||
      start < now - BigInt('86400000000000')
    )
      throw new Error('expired span')
    return {
      traceId: s.traceId,
      spanId: s.spanId,
      parentSpanId:
        typeof s.parentSpanId === 'string' && /^[a-f0-9]{16}$/.test(s.parentSpanId)
          ? s.parentSpanId
          : undefined,
      name:
        s.name === 'browser.error' || s.name.startsWith('recognition.')
          ? s.name
          : s.name.split(' ')[0] + ' ' + safeRoute(s.name.slice(s.name.indexOf(' ') + 1)),
      kind: s.kind === 3 ? 3 : 1,
      startTimeUnixNano: s.startTimeUnixNano,
      endTimeUnixNano: s.endTimeUnixNano,
      status: { code: object(s.status).code === 2 ? 2 : 0 },
    }
  })
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: 'service.name', value: { stringValue: 'formula-browser' } }],
        },
        scopeSpans: [{ scope: { name: 'formula-browser' }, spans: sanitized }],
      },
    ],
  }
}
const telemetryWindows = new Map<string, { start: number; count: number }>()
export function admitBrowserTelemetry(ownerId: string, now = Date.now()) {
  for (const [key, value] of telemetryWindows)
    if (now - value.start >= 60_000) telemetryWindows.delete(key)
  let value = telemetryWindows.get(ownerId)
  if (!value) {
    if (telemetryWindows.size >= 1024) return false
    value = { start: now, count: 0 }
    telemetryWindows.set(ownerId, value)
  }
  return ++value.count <= 60
}
