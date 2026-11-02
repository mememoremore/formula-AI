import { createServer } from 'node:http'
import type { PrismaClient } from '../generated/prisma/client'
import { metricsEnabled, runtimeMetrics, type Metrics } from '../diagnostics/metrics'
import { diagnostic } from '../diagnostics/operations'
import type { JobKind } from '../../shared/types/tasks'

export function applyQueueSnapshot(
  m: Metrics,
  snapshot: Record<JobKind, { queued: number; processing: number }>,
  now = Date.now() / 1000,
) {
  for (const kind of ['recognition', 'chat', 'export'] as const) {
    m.queued.set({ kind }, snapshot[kind].queued)
    m.running.set({ kind }, snapshot[kind].processing)
  }
  m.snapshotAt.set(now)
  m.snapshotOk.set(1)
}
export async function startWorkerMetrics(db: PrismaClient) {
  if (!metricsEnabled()) return { stop: async () => {} }
  const port = Number(process.env.FORMULA_METRICS_PORT ?? 9464)
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    diagnostic('worker.lifecycle', { code: 'CONFIGURATION', outcome: 'unconfirmed' })
    return { stop: async () => {} }
  }
  const m = runtimeMetrics()
  let busy = false,
    stopped = false
  async function poll() {
    if (busy || stopped) return
    busy = true
    try {
      const where = { status: { in: ['QUEUED', 'PROCESSING'] as ('QUEUED' | 'PROCESSING')[] } }
      const [recognition, chat, exported] = await Promise.all([
        db.recognitionTask.groupBy({ by: ['status'], where, _count: { _all: true } }),
        db.chatTurn.groupBy({ by: ['status'], where, _count: { _all: true } }),
        db.exportTask.groupBy({ by: ['status'], where, _count: { _all: true } }),
      ])
      if (stopped) return
      const counts = (rows: { status: string; _count: { _all: number } }[]) => ({
        queued: rows.find((r) => r.status === 'QUEUED')?._count._all ?? 0,
        processing: rows.find((r) => r.status === 'PROCESSING')?._count._all ?? 0,
      })
      applyQueueSnapshot(m, {
        recognition: counts(recognition),
        chat: counts(chat),
        export: counts(exported),
      })
    } catch {
      m.snapshotOk.set(0)
    } finally {
      busy = false
    }
  }
  const server = createServer(async (request, response) => {
    if (request.url !== '/metrics' || request.method !== 'GET') {
      response.writeHead(404).end()
      return
    }
    try {
      const text = await m.registry.metrics()
      response
        .writeHead(200, { 'content-type': m.registry.contentType, 'cache-control': 'no-store' })
        .end(text)
    } catch {
      response.writeHead(503).end()
    }
  })
  server.requestTimeout = 5000
  server.headersTimeout = 5000
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject)
      server.listen(port, '127.0.0.1', () => resolve())
    })
  } catch {
    diagnostic('worker.lifecycle', { code: 'CONFIGURATION', outcome: 'unconfirmed' })
    return { stop: async () => {} }
  }
  void poll()
  const timer = setInterval(() => void poll(), 15000)
  timer.unref()
  return {
    stop: async () => {
      stopped = true
      clearInterval(timer)
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    },
  }
}
