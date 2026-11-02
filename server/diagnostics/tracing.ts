import { AsyncLocalStorage } from 'node:async_hooks'
import {
  ROOT_CONTEXT,
  trace,
  SpanKind,
  SpanStatusCode,
  type Span,
  type Attributes,
} from '@opentelemetry/api'
import { TracerProvider, BatchSpanProcessor } from '@opentelemetry/sdk-trace'
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http'
import { resourceFromAttributes } from '@opentelemetry/resources'
import { parseTraceparent, traceparent } from '../../shared/trace-context'

const active = new AsyncLocalStorage<Span>()
let provider: TracerProvider | undefined
let service = 'formula-api'
export function setTraceService(value: 'formula-api' | 'formula-worker') {
  service = value
}
export function tracingEndpoint() {
  const value = process.env.FORMULA_OTLP_ENDPOINT
  if (!value) return undefined
  try {
    const url = new URL(value)
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      return
    return url.href
  } catch {
    return undefined
  }
}
function getProvider() {
  return (provider ??= new TracerProvider({
    resource: resourceFromAttributes({
      'service.name': service,
      'deployment.environment.name': 'local',
      'service.version': process.env.FORMULA_RELEASE ?? 'development',
    }),
    spanProcessors: tracingEndpoint()
      ? [
          new BatchSpanProcessor({
            exporter: new OTLPTraceExporter({ url: tracingEndpoint(), timeoutMillis: 1500 }),
            maxQueueSize: 512,
            maxExportBatchSize: 64,
            scheduledDelayMillis: 1000,
            exportTimeoutMillis: 2000,
          }),
        ]
      : [],
    spanLimits: { attributeCountLimit: 16, attributeValueLengthLimit: 160, eventCountLimit: 0 },
  }))
}
export function currentTrace() {
  return active.getStore()?.spanContext()
}
export function currentTraceparent() {
  const value = currentTrace()
  return value ? traceparent(value) : undefined
}
export async function traced<T>(
  name: string,
  action: (span: Span) => Promise<T>,
  options: { parent?: string; root?: boolean; kind?: SpanKind; attributes?: Attributes } = {},
): Promise<T> {
  const remote = parseTraceparent(options.parent)
  const parent = remote
    ? trace.setSpanContext(ROOT_CONTEXT, { ...remote, isRemote: true })
    : !options.root && active.getStore()
      ? trace.setSpan(ROOT_CONTEXT, active.getStore()!)
      : ROOT_CONTEXT
  const span = getProvider()
    .getTracer('formula')
    .startSpan(
      name,
      { kind: options.kind ?? SpanKind.INTERNAL, attributes: options.attributes },
      parent,
    )
  return active.run(span, async () => {
    try {
      return await action(span)
    } catch (error) {
      span.setStatus({ code: SpanStatusCode.ERROR })
      throw error
    } finally {
      span.end()
    }
  })
}
export async function flushTraces() {
  await provider?.forceFlush({ timeoutMillis: 2500 }).catch(() => {})
}
export async function shutdownTraces() {
  await provider?.shutdown().catch(() => {})
}
