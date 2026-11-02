import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { mkdirSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
const directory = resolve('tmp/observability-secrets')
mkdirSync(directory, { recursive: true, mode: 0o700 })
const password = resolve(directory, 'grafana-admin-password')
if (!existsSync(password))
  writeFileSync(password, randomBytes(32).toString('base64url') + '\n', { mode: 0o600 })
writeFileSync(
  resolve(directory, 'grafana-login.txt'),
  'URL: http://127.0.0.1:3300\nUsername: admin\nPassword file: grafana-admin-password\n',
  { mode: 0o600 },
)
const user = process.env.FORMULA_SMTP_USER?.trim(),
  pass = process.env.FORMULA_SMTP_PASSWORD?.trim()
const recipient = process.env.FORMULA_ALERT_TO?.trim() || user
if (!user || !pass || !recipient || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))
  throw new Error('告警SMTP配置不完整；未输出配置内容。')
writeFileSync(resolve(directory, 'qq-smtp-password'), pass + '\n', { mode: 0o600 })
const q = (value: string) => JSON.stringify(value)
const config = `global:
  resolve_timeout: 5m
  smtp_smarthost: smtp.qq.com:465
  smtp_from: ${q(user)}
  smtp_auth_username: ${q(user)}
  smtp_auth_password_file: /run/secrets/qq-smtp-password
  smtp_require_tls: true
route:
  receiver: qq-email
  group_by: [alertname, job, kind]
  group_wait: 30s
  group_interval: 5m
  repeat_interval: 4h
  routes:
    - matchers: ['alertname="ObservabilityMailTest"']
      receiver: qq-email
      group_wait: 0s
      group_interval: 1m
receivers:
  - name: qq-email
    email_configs:
      - to: ${q(recipient)}
        force_implicit_tls: true
        send_resolved: true
        headers:
          Subject: '[Formula AI] {{ .Status }} {{ .CommonLabels.alertname }}'
        text: >-
          Formula AI 监控告警。状态：{{ .Status }}。
          {{ range .Alerts }}{{ .Annotations.summary }} {{ end }}
          查看平台：http://127.0.0.1:3300/d/formula-overview
inhibit_rules:
  - source_matchers: ['alertname="FormulaServiceDown"', 'job="formula-worker"']
    target_matchers: ['alertname=~"FormulaQueueSnapshotUnavailable|FormulaQueueBacklog"']
`
writeFileSync(resolve(directory, 'alertmanager.yaml'), config, { mode: 0o600 })
console.log('本地观测凭据已准备，内容未输出。')
