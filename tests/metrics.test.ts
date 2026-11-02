import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createMetrics,
  runtimeMetrics,
  observeHttp,
  beginTaskMetrics,
  withTaskMetrics,
  markTaskCancelled,
  beginAiMetrics,
  metricsEnabled,
} from '../server/diagnostics/metrics'
import { applyQueueSnapshot } from '../server/diagnostics/worker-metrics'
const labels = (value: { labels: unknown }) => value.labels as Record<string, unknown>
const enabled = async (action: () => Promise<void>) => {
  const before = process.env.FORMULA_METRICS_ENABLED
  process.env.FORMULA_METRICS_ENABLED = 'true'
  try {
    await action()
  } finally {
    if (before === undefined) delete process.env.FORMULA_METRICS_ENABLED
    else process.env.FORMULA_METRICS_ENABLED = before
  }
}

test('指标默认关闭；HTTP标签不包含动态ID与查询参数，SSE不进入延迟统计', async () => {
  assert.equal(metricsEnabled(), false)
  await enabled(async () => {
    observeHttp('GET', '/api/account/formulas/private-email@example.com?secret=value', 401, 0.2)
    observeHttp('GET', '/api/account/conversations/private-id/events', 200, 3600)
    const text = await runtimeMetrics().registry.metrics()
    assert.ok(
      text.includes('formula_http_requests_total') && text.includes('/api/account/formulas/:id'),
    )
    for (const value of ['private-email', 'secret=value', 'private-id', '/events'])
      assert.ok(!text.includes(value))
  })
})
test('重试不算最终失败，取消单独计数，重复结束不会把活跃数减为负', async () =>
  enabled(async () => {
    const m = runtimeMetrics()
    const retry = beginTaskMetrics('recognition', new Date(0), new Date(1000))
    retry('retrying')
    retry('failed')
    await withTaskMetrics(async () => {
      const stop = beginTaskMetrics('chat', new Date(0), new Date(2000))
      markTaskCancelled()
      stop('lost_claim')
    })
    const attempts = await m.attempts.get(),
      results = await m.results.get(),
      active = await m.active.get()
    assert.equal(
      attempts.values.find(
        (v) => labels(v).kind === 'recognition' && labels(v).outcome === 'retrying',
      )?.value,
      1,
    )
    assert.equal(
      results.values.find((v) => labels(v).kind === 'recognition' && labels(v).outcome === 'failed')
        ?.value,
      0,
    )
    assert.equal(
      results.values.find((v) => labels(v).kind === 'chat' && labels(v).outcome === 'cancelled')
        ?.value,
      1,
    )
    assert.ok(active.values.every((v) => v.value === 0))
  }))
test('队列快照失败保留上次值但标记无效，初始状态不伪造队列为零', async () => {
  const m = createMetrics('formula-worker')
  assert.equal((await m.snapshotOk.get()).values[0]?.value, 0)
  assert.equal((await m.queued.get()).values.length, 0)
  applyQueueSnapshot(
    m,
    {
      recognition: { queued: 5, processing: 1 },
      chat: { queued: 0, processing: 0 },
      export: { queued: 0, processing: 0 },
    },
    1000,
  )
  m.snapshotOk.set(0)
  assert.equal(
    (await m.queued.get()).values.find((v) => labels(v).kind === 'recognition')?.value,
    5,
  )
  assert.equal((await m.snapshotAt.get()).values[0]?.value, 1000)
  assert.equal((await m.snapshotOk.get()).values[0]?.value, 0)
})
test('AI首个文本仅统计一次，real/mock分离，生成失败单独观察', async () =>
  enabled(async () => {
    const m = runtimeMetrics(),
      a = beginAiMetrics(true)
    a.text()
    a.text()
    a.finish('failed')
    a.finish('completed')
    const first = await m.firstText.get(),
      duration = await m.aiDuration.get()
    assert.equal(
      first.values.find(
        (v) => v.metricName === 'formula_ai_first_text_seconds_count' && labels(v).mode === 'mock',
      )?.value,
      1,
    )
    assert.equal(
      duration.values.find(
        (v) =>
          v.metricName === 'formula_ai_generation_seconds_count' && labels(v).outcome === 'failed',
      )?.value,
      1,
    )
    assert.ok(!first.values.some((v) => labels(v).mode === 'real'))
  }))
