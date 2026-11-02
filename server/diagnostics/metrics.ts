import { AsyncLocalStorage } from 'node:async_hooks'
import { Registry, Counter, Gauge, Histogram, collectDefaultMetrics } from '@prometheus-io/client'
import { safeRoute } from '../../shared/trace-context'
import type { JobKind } from '../../shared/types/tasks'

const taskMetricContext = new AsyncLocalStorage<{ cancelled: boolean }>()
export function withTaskMetrics<T>(action: () => T): T {
  return taskMetricContext.run({ cancelled: false }, action)
}
export function markTaskCancelled() {
  const state = taskMetricContext.getStore()
  if (state) state.cancelled = true
}
export type AttemptOutcome =
  'completed' | 'failed' | 'retrying' | 'cancelled' | 'lost_claim' | 'unknown'
export function createMetrics(service: 'formula-api' | 'formula-worker', defaults = false) {
  const registry = new Registry()
  registry.setDefaultLabels({ service })
  const registers = [registry]
  const requests = new Counter({
    name: 'formula_http_requests_total',
    help: 'Account API requests excluding SSE and telemetry',
    labelNames: ['method', 'route', 'status'] as const,
    registers,
  })
  const latency = new Histogram({
    name: 'formula_http_duration_seconds',
    help: 'Account HTTP response duration excluding SSE',
    labelNames: ['method', 'route'] as const,
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30],
    registers,
  })
  const active = new Gauge({
    name: 'formula_worker_active',
    help: 'Attempts executing in this worker',
    labelNames: ['kind'] as const,
    registers,
  })
  const attempts = new Counter({
    name: 'formula_task_attempts_total',
    help: 'Observed worker attempts by outcome',
    labelNames: ['kind', 'outcome'] as const,
    registers,
  })
  const results = new Counter({
    name: 'formula_task_results_total',
    help: 'Observed terminal task outcomes; not an accounting ledger',
    labelNames: ['kind', 'outcome'] as const,
    registers,
  })
  const processing = new Histogram({
    name: 'formula_task_duration_seconds',
    help: 'Worker attempt duration',
    labelNames: ['kind'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    registers,
  })
  const waiting = new Histogram({
    name: 'formula_task_queue_wait_seconds',
    help: 'Eligible queue waiting time; excludes scheduled retry backoff',
    labelNames: ['kind'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120, 300],
    registers,
  })
  const queued = new Gauge({
    name: 'formula_tasks_queued',
    help: 'Business tasks currently queued, including delayed retries',
    labelNames: ['kind'] as const,
    registers,
  })
  const running = new Gauge({
    name: 'formula_tasks_processing',
    help: 'Business tasks currently processing',
    labelNames: ['kind'] as const,
    registers,
  })
  const snapshotOk = new Gauge({
    name: 'formula_queue_snapshot_success',
    help: 'Whether last queue database snapshot succeeded',
    registers,
  })
  const snapshotAt = new Gauge({
    name: 'formula_queue_snapshot_timestamp_seconds',
    help: 'Unix time of last successful queue snapshot',
    registers,
  })
  const aiDuration = new Histogram({
    name: 'formula_ai_generation_seconds',
    help: 'AI stream generation duration, before structured validation',
    labelNames: ['mode', 'outcome'] as const,
    buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
    registers,
  })
  const firstText = new Histogram({
    name: 'formula_ai_first_text_seconds',
    help: 'Time to first non-empty content, not reasoning tokens',
    labelNames: ['mode'] as const,
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10, 30, 60],
    registers,
  })
  if (defaults) collectDefaultMetrics({ register: registry, prefix: 'formula_' })
  snapshotOk.set(0)
  for (const kind of ['recognition', 'chat', 'export'] as const) {
    active.set({ kind }, 0)
    for (const outcome of ['completed', 'failed', 'cancelled']) results.inc({ kind, outcome }, 0)
  }
  return {
    registry,
    requests,
    latency,
    active,
    attempts,
    results,
    processing,
    waiting,
    queued,
    running,
    snapshotOk,
    snapshotAt,
    aiDuration,
    firstText,
  }
}
export type Metrics = ReturnType<typeof createMetrics>
let metrics: Metrics | undefined
export const metricsEnabled = () => process.env.FORMULA_METRICS_ENABLED === 'true'
export function runtimeMetrics() {
  return (metrics ??= createMetrics(
    process.env.FORMULA_SERVICE_NAME === 'formula-worker' ? 'formula-worker' : 'formula-api',
    true,
  ))
}
export function observeHttp(method: string, path: string, status: number, seconds: number) {
  if (!metricsEnabled() || path.split('?')[0]?.endsWith('/events')) return
  try {
    const m = runtimeMetrics(),
      route = safeRoute(path)
    const verb = ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'].includes(method)
      ? method
      : 'OTHER'
    m.requests.inc({ method: verb, route, status: String(status) })
    m.latency.observe({ method: verb, route }, Math.max(0, seconds))
  } catch {
    /* Observability never changes a business result. */
  }
}
export function beginTaskMetrics(kind: JobKind, eligible: Date, started: Date) {
  if (!metricsEnabled()) return (_outcome: AttemptOutcome) => {}
  const m = runtimeMetrics(),
    time = performance.now(),
    state = taskMetricContext.getStore()
  try {
    m.active.inc({ kind })
    const wait = (started.getTime() - eligible.getTime()) / 1000
    if (Number.isFinite(wait)) m.waiting.observe({ kind }, Math.max(0, wait))
  } catch {}
  let done = false
  return (outcome: AttemptOutcome) => {
    if (done) return
    done = true
    if (state?.cancelled) outcome = 'cancelled'
    try {
      m.active.dec({ kind })
      m.processing.observe({ kind }, (performance.now() - time) / 1000)
      m.attempts.inc({ kind, outcome })
      if (['completed', 'failed', 'cancelled'].includes(outcome)) m.results.inc({ kind, outcome })
    } catch {}
  }
}
export function beginAiMetrics(isMock: boolean) {
  const started = performance.now()
  let first = false,
    done = false
  const mode = isMock ? 'mock' : 'real'
  return {
    text() {
      if (first || !metricsEnabled()) return
      first = true
      try {
        runtimeMetrics().firstText.observe({ mode }, (performance.now() - started) / 1000)
      } catch {}
    },
    finish(outcome: 'completed' | 'failed') {
      if (done || !metricsEnabled()) return
      done = true
      try {
        runtimeMetrics().aiDuration.observe({ mode, outcome }, (performance.now() - started) / 1000)
      } catch {}
    },
  }
}
