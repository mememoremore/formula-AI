export interface TraceContext {
  traceId: string
  spanId: string
  traceFlags: number
}
export function parseTraceparent(value: unknown): TraceContext | undefined {
  if (typeof value !== 'string' || !/^00-[0-9a-f]{32}-[0-9a-f]{16}-0[01]$/.test(value)) return
  const [, traceId, spanId, flags] = value.split('-')
  if (!traceId || !spanId || /^0+$/.test(traceId) || /^0+$/.test(spanId)) return
  return { traceId, spanId, traceFlags: Number.parseInt(flags!, 16) }
}
export function traceparent(value: TraceContext) {
  return `00-${value.traceId}-${value.spanId}-${value.traceFlags & 1 ? '01' : '00'}`
}
const staticSegments = new Set([
  'api',
  'account',
  'formulas',
  'versions',
  'tasks',
  'conversations',
  'categories',
  'exports',
  'files',
  'recognitions',
  'recognition-batches',
  'batches',
  'retry',
  'turns',
  'resources',
  'image',
  'avatar',
  'docx',
  'download',
  'events',
  'messages',
  'favorite',
  'category',
  'explanations',
  'cancel',
  'profile',
  'profile-stats',
  'history',
  'usage',
  'service-status',
  'chat-settings',
  'telemetry',
  'traces',
  'ai',
  'new',
  'library',
  'upload',
  'settings',
  'help',
  'feedback',
  'about',
  'login',
  'register',
  'manual',
  'edit',
  'export',
])
export function safeRoute(path: string) {
  return path
    .split('?')[0]!
    .split('/')
    .map((segment) => (!segment || staticSegments.has(segment) ? segment : ':id'))
    .join('/')
    .slice(0, 160)
}
