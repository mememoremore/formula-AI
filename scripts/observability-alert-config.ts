/** Email is an explicit deployment choice, independent of registration SMTP. */
export function alertEmailEnabled(value?: string) {
  const flag = value?.trim() ?? 'false'
  if (flag !== 'true' && flag !== 'false')
    throw new Error('FORMULA_ALERT_EMAIL_ENABLED仅支持true或false。')
  return flag === 'true'
}

export function alertmanagerConfig(mail?: { sender: string; recipient: string }) {
  if (!mail)
    return 'global:\n  resolve_timeout: 5m\nroute:\n  receiver: local-panel\nreceivers:\n  - name: local-panel\n'
  const q = (value: string) => JSON.stringify(value)
  const recipient = mail.recipient
  return `global:
  resolve_timeout: 5m
  smtp_smarthost: smtp.qq.com:465
  smtp_from: ${q(mail.sender)}
  smtp_auth_username: ${q(mail.sender)}
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
}
