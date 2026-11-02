import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const password = readFileSync('tmp/observability-secrets/grafana-admin-password', 'utf8').trim()
try {
  execFileSync(
    'docker',
    [
      'compose',
      '-f',
      'compose.observability.yaml',
      'exec',
      '-T',
      'grafana',
      'grafana',
      'cli',
      '--homepath',
      '/usr/share/grafana',
      '--config',
      '/etc/grafana/grafana.ini',
      '--configOverrides',
      'cfg:default.paths.data=/var/lib/grafana',
      'admin',
      'reset-admin-password',
      '--password-from-stdin',
    ],
    { input: password + '\n', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
  )
  writeFileSync(
    'tmp/observability-secrets/grafana-password-initialized',
    new Date().toISOString(),
    { mode: 0o600 },
  )
  console.log('Grafana已有数据卷凭据已初始化，密码未输出。')
} catch {
  throw new Error('Grafana凭据初始化失败；未输出私有CLI响应。')
}
