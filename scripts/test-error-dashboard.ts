import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { assertLocalDocker } from '../tests/support/test-runtime'

type Target = { refId: string; expr: string; queryType: 'instant' | 'range' }
type Panel = { id: number; type: string; targets?: Target[] }
type LokiResult = { value?: [number, string]; values?: [string, string][] }
const dashboard = JSON.parse(
  readFileSync('observability/grafana/provisioning/dashboards/errors.json', 'utf8'),
) as { uid: string; panels: Panel[] }
assert.equal(dashboard.uid, 'formula-errors')
assertLocalDocker()
const name = 'formula-errors-check-' + randomUUID()
const directory = resolve('tmp', name)
mkdirSync(directory, { recursive: true, mode: 0o700 })
const config = resolve(directory, 'loki.yaml')
const original = readFileSync('observability/loki.yaml', 'utf8')
writeFileSync(
  config,
  original
    .replaceAll('/loki', '/tmp/loki')
    .replace('retention_enabled: true', 'retention_enabled: false'),
)
const docker = (...args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  }).trim()
const purpose = 'formula-error-dashboard-check'
try {
  docker(
    'run',
    '--detach',
    '--name',
    name,
    '--label',
    'formula-purpose=' + purpose,
    '--read-only',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=128m',
    '--memory',
    '384m',
    '--cpus',
    '1',
    '--publish',
    '127.0.0.1::3100',
    '--mount',
    'type=bind,src=' + config + ',dst=/etc/loki/check.yaml,readonly',
    'grafana/loki:3.6.0',
    '-config.file=/etc/loki/check.yaml',
  )
  const published = docker('port', name, '3100/tcp')
  assert.match(published, /^127\.0\.0\.1:\d+$/)
  const base = 'http://' + published
  let ready = false
  for (let i = 0; i < 90; i++) {
    try {
      const r = await fetch(base + '/ready', { signal: AbortSignal.timeout(1000) })
      ready = r.ok
      await r.body?.cancel()
    } catch {}
    if (ready) break
    await delay(1000)
  }
  assert.ok(ready, '临时Loki必须就绪')
  async function query(target: Target): Promise<LokiResult[]> {
    const params = new URLSearchParams({
      query: target.expr.replaceAll('$__range', '15m'),
      time: String(Date.now() / 1000),
    })
    if (target.queryType === 'range') {
      params.delete('time')
      params.set('start', String((Date.now() - 15 * 60000) / 1000))
      params.set('end', String(Date.now() / 1000))
      params.set('limit', '100')
    }
    const r = await fetch(
      base +
        '/loki/api/v1/' +
        (target.queryType === 'range' ? 'query_range' : 'query') +
        '?' +
        params,
      { signal: AbortSignal.timeout(10000) },
    )
    const body = (await r.json()) as {
      status: string
      data: { result: { value?: [number, string]; values?: [string, string][] }[] }
    }
    assert.equal(r.status, 200, '看板查询必须有效：' + target.refId)
    assert.equal(body.status, 'success')
    return body.data.result
  }
  const stats = dashboard.panels.filter((p) => p.type === 'stat')
  assert.equal(stats.length, 4)
  for (const p of stats)
    assert.equal(Number((await query(p.targets![0]!))[0]?.value?.[1]), 0, '空记录必须显示0')
  const records: Record<string, Record<string, unknown>[]> = {}
  function event(service: string, row: Record<string, unknown>) {
    ;(records[service] ??= []).push({
      traceId: 'b'.repeat(32),
      requestId: '11111111-1111-4111-8111-111111111111',
      ...row,
    })
  }
  for (let i = 0; i < 2; i++)
    event('formula-browser', {
      event: 'browser.error',
      errorName: 'TypeError',
      errorKind: 'vue',
      route: '/upload',
      asset: 'fixture.js',
      line: 12,
      column: 3,
      fingerprint: 'a'.repeat(64),
      outcome: 'failed',
    })
  event('formula-browser', { event: 'normal.event', outcome: 'returned' })
  for (const status of [200, 400, 401, 403, 404, 409, 429, 500])
    event('formula-api', {
      event: 'http.operation',
      status,
      operation: 'recognition',
      code: 'UPSTREAM',
      outcome: status >= 400 ? 'failed' : 'returned',
    })
  event('formula-api', { event: 'resource.file', outcome: 'failed', code: 'UNCLASSIFIED' })
  for (const outcome of ['started', 'returned', 'retrying', 'unconfirmed', 'cancelled', 'failed'])
    event('formula-worker', {
      event: 'worker.attempt',
      outcome,
      operation: 'recognition',
      code: 'TIMEOUT',
      taskId: '22222222-2222-4222-8222-222222222222',
      attempt: 2,
    })
  for (const status of [200, 401, 422, 503])
    event('formula-recognition', { event: 'recognition.request', status, durationMs: 123 })
  let sequence = 0
  const stamp = BigInt(Date.now() - 30000) * 1000000n
  const streams = Object.entries(records).map(([service, rows]) => ({
    stream: { service },
    values: rows.map((row) => [
      (stamp + BigInt(sequence++) * 1000000n).toString(),
      JSON.stringify(row),
    ]),
  }))
  streams.push({
    stream: { service: 'formula-api' },
    values: [[(stamp + BigInt(sequence++) * 1000000n).toString(), 'not-json']],
  })
  const pushed = await fetch(base + '/loki/api/v1/push', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ streams }),
    signal: AbortSignal.timeout(10000),
  })
  assert.equal(pushed.status, 204)
  const expected = [2, 1, 1, 1]
  for (let i = 0; i < stats.length; i++) {
    const value = Number((await query(stats[i]!.targets![0]!))[0]?.value?.[1])
    assert.equal(value, expected[i], '四类错误必须排除4xx/重试/取消/其他事件')
  }
  const logs = dashboard.panels.find((p) => p.type === 'logs')!
  assert.equal(logs.targets?.length, 4)
  const datasource = readFileSync(
    'observability/grafana/provisioning/datasources/default.yaml',
    'utf8',
  )
  const match = datasource.match(/matcherRegex: '([^']+)'/)
  assert.ok(match)
  const derived = new RegExp(match[1]!)
  for (let i = 0; i < logs.targets!.length; i++) {
    const rows: [string, string][] = (await query(logs.targets![i]!)).flatMap((s) => s.values ?? [])
    assert.equal(rows.length, expected[i])
    for (const [, line] of rows) {
      assert.equal(derived.exec(line)?.[1], 'b'.repeat(32), '中文日志摘要必须保留查看链路链接')
      assert.doesNotMatch(line, /undefined|<no value>/)
    }
  }
  for (const p of dashboard.panels.filter((p) => p.type === 'table')) {
    const rows = await query(p.targets![0]!)
    assert.equal(rows.length, 1, '相同问题应聚合到同一组')
    assert.equal(Number(rows[0]!.value?.[1]), p.id === 7 ? 2 : 1)
  }
  console.log('自动错误中心：4类计数、空样本、4xx/取消/重试过滤、中文摘要、链路链接与分组均通过。')
} finally {
  let owned = false
  try {
    owned =
      docker('inspect', name, '--format', '{{index .Config.Labels "formula-purpose"}}') === purpose
  } catch {}
  if (owned) {
    docker('rm', '--force', name)
    console.log('仅清理本次临时Loki容器，未挂载或操作业务数据卷。')
  }
}
