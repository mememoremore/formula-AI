import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { assertLocalDocker } from '../tests/support/test-runtime'
assertLocalDocker()
execFileSync(
  'docker',
  [
    'run',
    '--rm',
    '--network',
    'none',
    '--read-only',
    '--memory',
    '256m',
    '--cpus',
    '1',
    '--tmpfs',
    '/tmp:rw,noexec,nosuid,size=64m',
    '--workdir',
    '/rules',
    '--mount',
    `type=bind,src=${resolve('observability')},dst=/rules,readonly`,
    '--entrypoint',
    '/bin/promtool',
    'quay.io/prometheus/prometheus:v3.13.5',
    'test',
    'rules',
    '/rules/alerts.test.yaml',
  ],
  { stdio: 'inherit', windowsHide: true },
)
