import {
  browserErrorSummary,
  browserErrorGate,
  type BrowserErrorKind,
} from '~/utils/browser-errors'
import { ROOT_CONTEXT, trace, SpanKind, SpanStatusCode, type Span } from '@opentelemetry/api'
import { TracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { parseTraceparent, traceparent, safeRoute } from '#shared/trace-context'

export default defineNuxtPlugin((nuxt) => {
  if (!useRuntimeConfig().public.observabilityEnabled)
    return {
      provide: {
        accountFetch: globalThis.$fetch,
        traceOperation: (
          _name: 'recognition.submit' | 'recognition.retry',
        ): { header: string; end: () => void } | undefined => undefined,
      },
    }

  const diagnostic = useState<{
    traceId: string
    requestId?: string
    status?: number
    path: string
    time: string
  } | null>('last-diagnostic', () => null)
  const provider = new TracerProvider({
    resource: resourceFromAttributes({ 'service.name': 'formula-browser' }),
    spanProcessors: [
      new BatchSpanProcessor({
        exporter: new OTLPTraceExporter({
          url: '/api/account/telemetry/traces',
          timeoutMillis: 2000,
        }),
        maxQueueSize: 128,
        maxExportBatchSize: 16,
        scheduledDelayMillis: 1500,
      }),
    ],
    spanLimits: { attributeCountLimit: 4, eventCountLimit: 0 },
  })
  const tracer = provider.getTracer('formula-browser')
  const pending = new Map<string, Span>()
  const original = globalThis.$fetch
  const admitError = browserErrorGate()
  const errorQueue: Record<string, unknown>[] = []
  let errorTimer: ReturnType<typeof setTimeout> | undefined

  function flushErrors() {
    clearTimeout(errorTimer)
    errorTimer = undefined

    const events = errorQueue.splice(0, 10)

    if (events.length)
      void fetch('/api/account/telemetry/errors', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ events }),
        keepalive: true,
      })
        .then((r) => r.body?.cancel())
        .catch(() => {})
    if (errorQueue.length) errorTimer = setTimeout(flushErrors, 1000)
  }

  function captureError(
    kind: BrowserErrorKind,
    error: unknown,
    frame?: { filename?: string; line?: number; column?: number },
  ) {
    try {
      const summary = browserErrorSummary(kind, error, location.href, frame)
      const key = [
        summary.kind,
        summary.errorName,
        summary.route,
        summary.asset,
        summary.line,
        summary.column,
      ].join('|')

      if (!admitError(key)) return

      const span = tracer.startSpan('browser.error', {}, ROOT_CONTEXT)

      span.setStatus({ code: SpanStatusCode.ERROR })
      errorQueue.push({ ...summary, traceparent: traceparent(span.spanContext()) })
      diagnostic.value = {
        traceId: span.spanContext().traceId,
        path: summary.route,
        time: summary.time,
      }
      span.end()
      if (!errorTimer) errorTimer = setTimeout(flushErrors, 1000)
    } catch {}
  }

  nuxt.hook('vue:error', (error) => captureError('vue', error))
  window.addEventListener('error', (event) => {
    if (event instanceof ErrorEvent)
      captureError('window', event.error, {
        filename: event.filename,
        line: event.lineno,
        column: event.colno,
      })
  })
  window.addEventListener('unhandledrejection', (event) => captureError('promise', event.reason))
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flushErrors()
  })

  function finish(
    options: { headers: Headers },
    status?: number,
    requestId?: string,
    cancelled = false,
  ) {
    const id = parseTraceparent(options.headers.get('traceparent'))
    const span = id && pending.get(id.spanId)

    if (!span) return
    pending.delete(id!.spanId)
    if ((!status || status >= 400) && !cancelled) {
      span.setStatus({ code: SpanStatusCode.ERROR })

      const route = span.spanContext()

      diagnostic.value = {
        traceId: route.traceId,
        requestId,
        status,
        path: safeRoute(location.pathname),
        time: new Date().toISOString(),
      }
    }
    if (status) span.setAttribute('http.response.status_code', status)
    span.end()
  }

  const accountFetch = original.create({
    onRequest({ request, options }) {
      if (
        typeof request !== 'string' ||
        !request.startsWith('/api/account/') ||
        request.includes('/telemetry/')
      )
        return

      const parent = parseTraceparent(options.headers.get('traceparent'))
      const ctx = parent ? trace.setSpanContext(ROOT_CONTEXT, parent) : ROOT_CONTEXT
      const span = tracer.startSpan(
        String(options.method ?? 'GET').toUpperCase() + ' ' + safeRoute(request),
        { kind: SpanKind.CLIENT },
        ctx,
      )

      options.headers.set('traceparent', traceparent(span.spanContext()))
      pending.set(span.spanContext().spanId, span)
    },
    onResponse({ options, response }) {
      finish(options, response.status, response.headers.get('X-Request-Id') ?? undefined)
    },
    onRequestError({ options }) {
      finish(options, undefined, undefined, options.signal?.aborted)
    },
  })

  return {
    provide: {
      accountFetch,
      traceOperation(name: 'recognition.submit' | 'recognition.retry') {
        const span = tracer.startSpan(name, {}, ROOT_CONTEXT)

        return { header: traceparent(span.spanContext()), end: () => span.end() }
      },
    },
  }
})
