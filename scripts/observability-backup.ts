import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
const root = fileURLToPath(new URL('../', import.meta.url))
process.chdir(root)
const docker = (args: string[]) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
    maxBuffer: 4 * 1024 * 1024,
  }).trim()
const context = docker(['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'])
if (!/^(npipe:|unix:)/.test(context)) throw new Error('仅允许备份本机Docker。')
const project = 'formula-ai-observability'
const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const directory = resolve(root, 'backups', 'observability', stamp)
if (!directory.startsWith(resolve(root, 'backups', 'observability') + sep))
  throw new Error('备份目录无效。')
const services = ['grafana', 'prometheus', 'loki', 'tempo', 'alloy', 'alertmanager']
const compose = ['compose', '-f', 'compose.observability.yaml', '--profile', 'alerts']
const running = docker([...compose, 'ps', '--services', '--filter', 'status=running'])
  .split('\n')
  .filter((s) => services.includes(s))
const suffixes = [
  'grafana_data',
  'prometheus_data',
  'loki_data',
  'tempo_data',
  'alloy_data',
  'alertmanager_data',
]
const volumes = suffixes.map((s) => project + '_' + s)
for (const v of volumes)
  if (
    docker([
      'volume',
      'inspect',
      v,
      '--format',
      '{{index .Labels "com.docker.compose.project"}}',
    ]) !== project
  )
    throw new Error('卷归属不匹配；未停止服务。')
mkdirSync(directory, { recursive: true, mode: 0o700 })
let stopped = false
try {
  if (running.length) {
    stopped = true
    docker([...compose, 'stop', ...running])
  }
  const manifest: { volume: string; file: string; sha256: string }[] = []
  for (const volume of volumes) {
    const file = volume + '.tar.gz'
    docker([
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--mount',
      `type=volume,src=${volume},dst=/source,readonly`,
      '--mount',
      `type=bind,src=${directory},dst=/backup`,
      '--entrypoint',
      'tar',
      'ubuntu:22.04',
      '-czf',
      '/backup/' + file,
      '-C',
      '/source',
      '.',
    ])
    docker([
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--mount',
      `type=bind,src=${directory},dst=/backup,readonly`,
      '--entrypoint',
      'tar',
      'ubuntu:22.04',
      '-tzf',
      '/backup/' + file,
    ])
    manifest.push({
      volume,
      file,
      sha256: createHash('sha256')
        .update(readFileSync(resolve(directory, file)))
        .digest('hex'),
    })
  }
  writeFileSync(
    resolve(directory, 'manifest.json'),
    JSON.stringify({ createdAt: new Date().toISOString(), project, files: manifest }, null, 2),
    { mode: 0o600 },
  )
} finally {
  if (stopped && running.length) docker([...compose, 'start', ...running])
}
const restore = 'formula-ai-observability-restore-check-' + Date.now()
docker(['volume', 'create', '--label', 'formula-purpose=restore-check', restore])
try {
  docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--mount',
    `type=bind,src=${directory},dst=/backup,readonly`,
    '--mount',
    `type=volume,src=${restore},dst=/restore`,
    '--entrypoint',
    'tar',
    'ubuntu:22.04',
    '-xzf',
    '/backup/' + project + '_grafana_data.tar.gz',
    '-C',
    '/restore',
  ])
  docker([
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--mount',
    `type=volume,src=${restore},dst=/restore,readonly`,
    '--entrypoint',
    'python',
    'python:3.11.14-slim-bookworm',
    '-c',
    "import sqlite3; db=sqlite3.connect('file:/restore/grafana.db?mode=ro',uri=True); assert db.execute('pragma integrity_check').fetchone()[0]=='ok'",
  ])
} finally {
  if (
    docker(['volume', 'inspect', restore, '--format', '{{index .Labels "formula-purpose"}}']) ===
    'restore-check'
  )
    docker(['volume', 'rm', restore])
}
console.log('观测备份及隔离SQLite恢复校验通过：' + directory)
